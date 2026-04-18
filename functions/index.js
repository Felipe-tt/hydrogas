/**
 * HidroGás — Firebase Cloud Functions
 *
 * adminLogin:            Login do síndico com Argon2id + Custom Token
 * hashApartmentPassword: Gera hash Argon2id da senha do apartamento (chamada autenticada)
 * getPublicApartment:    Dados do apartamento para o morador (valida hash no servidor)
 * monthlyBackup:         Backup automático do RTDB no Firebase Storage (todo dia 1 às 03h)
 * monthlyWhatsAppReport: Relatório mensal de consumo via WhatsApp (Twilio) pro síndico
 */

const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule }    = require('firebase-functions/v2/scheduler')
const { logger }        = require('firebase-functions')
const argon2            = require('argon2')
const { initializeApp } = require('firebase-admin/app')
const { getAuth }       = require('firebase-admin/auth')
const { getDatabase }   = require('firebase-admin/database')
const { getStorage }    = require('firebase-admin/storage')
const twilio            = require('twilio')

initializeApp({
  databaseURL: process.env.DATABASE_URL,
})

const ADMIN_UID = 'hydrogas-admin'

const ARGON2_OPTIONS = {
  type:        argon2.argon2id,
  memoryCost:  65536,
  timeCost:    3,
  parallelism: 1,
}

const ALLOWED_ORIGINS = [
  'https://hydrogas-77f04.web.app',
  'https://hydrogas-77f04.firebaseapp.com',
  'https://hidrogas.netlify.app',
]

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  res.set('Vary', 'Origin')
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const MAX_TRIES = 5
const WINDOW_MS = 15 * 60 * 1000

function sanitizeKey(raw) {
  return raw.replace(/[./#$[\]]/g, '_').slice(0, 100)
}

async function isRateLimited(key) {
  const db      = getDatabase()
  const safeKey = sanitizeKey(key)
  const ref     = db.ref(`_rateLimit/${safeKey}`)
  const now     = Date.now()
  let blocked   = false

  await ref.transaction((current) => {
    if (!current)                   return { count: 1, resetAt: now + WINDOW_MS }
    if (current.resetAt < now)      return { count: 1, resetAt: now + WINDOW_MS }
    if (current.count >= MAX_TRIES) { blocked = true; return current }
    return { count: current.count + 1, resetAt: current.resetAt }
  })

  return blocked
}

async function clearRateLimit(key) {
  await getDatabase().ref(`_rateLimit/${sanitizeKey(key)}`).remove()
}

async function isRateLimitedReadOnly(key) {
  const snap = await getDatabase().ref(`_rateLimit/${sanitizeKey(key)}`).get()
  if (!snap.exists()) return false
  const { count, resetAt } = snap.val()
  if (Date.now() > resetAt) return false
  return count >= MAX_TRIES
}

async function recordFailedAttempt(key) {
  const ref = getDatabase().ref(`_rateLimit/${sanitizeKey(key)}`)
  const now = Date.now()
  await ref.transaction((current) => {
    if (!current || current.resetAt < now) return { count: 1, resetAt: now + WINDOW_MS }
    return { count: current.count + 1, resetAt: current.resetAt }
  })
}

function getIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
  const firstIp   = forwarded.split(',')[0].trim()
  return 'ip:' + (firstIp || req.ip || 'unknown')
}

// ── adminLogin ────────────────────────────────────────────────────────────────
exports.adminLogin = onCall(
  {
    secrets:         ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'DATABASE_URL'],
    timeoutSeconds:  30,
    memory:          '512MiB',
    region:          'us-central1',
    enforceAppCheck: true,
  },
  async (request) => {
    const ipKey = getIp(request.rawRequest)
    if (await isRateLimited(ipKey))
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')

    const { username, password } = request.data || {}
    if (!username || !password)
      throw new HttpsError('invalid-argument', 'Dados inválidos.')

    const expectedUsername = process.env.ADMIN_USERNAME
    const passwordHash     = process.env.ADMIN_PASSWORD_HASH

    if (!passwordHash) {
      logger.error('ADMIN_PASSWORD_HASH secret não configurado!')
      throw new HttpsError('internal', 'Servidor mal configurado. Contate o administrador.')
    }

    const usernameOk = username === expectedUsername
    let passwordOk   = false
    try {
      passwordOk = await argon2.verify(passwordHash, password, { type: argon2.argon2id })
    } catch (err) {
      logger.error('Erro ao verificar senha:', err)
      throw new HttpsError('internal', 'Erro interno ao verificar senha.')
    }

    if (!usernameOk || !passwordOk)
      throw new HttpsError('unauthenticated', 'Usuário ou senha incorretos.')

    await clearRateLimit(ipKey)

    try {
      const token = await getAuth().createCustomToken(ADMIN_UID, { role: 'admin' })
      return { token }
    } catch (err) {
      logger.error('Erro ao criar custom token:', err)
      throw new HttpsError('internal', err?.message || 'Erro ao criar sessão.')
    }
  }
)

// ── hashApartmentPassword ─────────────────────────────────────────────────────
exports.hashApartmentPassword = onCall(
  { region: 'us-central1', secrets: ['DATABASE_URL'], enforceAppCheck: true },
  async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID)
      throw new HttpsError('unauthenticated', 'Acesso não autorizado.')

    const { password } = request.data || {}
    if (!password || typeof password !== 'string' || password.length < 4)
      throw new HttpsError('invalid-argument', 'Senha inválida.')

    try {
      const hash = await argon2.hash(password, ARGON2_OPTIONS)
      return { hash }
    } catch (err) {
      logger.error('Erro ao gerar hash da senha:', err)
      throw new HttpsError('internal', 'Erro interno ao processar senha.')
    }
  }
)

// ── resetApartmentRateLimit ───────────────────────────────────────────────────
exports.resetApartmentRateLimit = onCall(
  { region: 'us-central1', secrets: ['DATABASE_URL'], enforceAppCheck: true },
  async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID)
      throw new HttpsError('unauthenticated', 'Acesso não autorizado.')

    const { token } = request.data || {}
    if (!token) throw new HttpsError('invalid-argument', 'Token obrigatório.')
    await clearRateLimit(`apt:${token}`)
    return { ok: true }
  }
)

// ── getPublicApartment ────────────────────────────────────────────────────────
exports.getPublicApartment = onCall(
  { region: 'us-central1', secrets: ['DATABASE_URL'], enforceAppCheck: true },
  async (request) => {
    const { token, password } = request.data || {}
    if (!token) throw new HttpsError('invalid-argument', 'Token obrigatório.')

    const rateLimitKey = `apt:${token}`
    if (await isRateLimitedReadOnly(rateLimitKey))
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')

    const db      = getDatabase()
    const aptSnap = await db.ref('apartments')
      .orderByChild('publicToken').equalTo(token).limitToFirst(1).get()

    if (!aptSnap.exists()) throw new HttpsError('not-found', 'Link inválido.')

    const aptData = Object.values(aptSnap.val())[0]

    if (aptData.accessPasswordHash) {
      if (!password) throw new HttpsError('unauthenticated', 'Senha obrigatória.')
      let passwordOk = false
      try {
        passwordOk = await argon2.verify(aptData.accessPasswordHash, password.trim(), { type: argon2.argon2id })
      } catch (err) {
        logger.error('Erro ao verificar senha do apartamento:', err)
        throw new HttpsError('internal', 'Erro interno ao verificar senha.')
      }
      if (!passwordOk) {
        await recordFailedAttempt(rateLimitKey)
        throw new HttpsError('unauthenticated', 'Senha incorreta.')
      }
      await clearRateLimit(rateLimitKey)
    }

    let residentFirebaseToken = null
    try {
      const uid = `resident-${sanitizeKey(token)}`
      residentFirebaseToken = await getAuth().createCustomToken(uid, { role: 'resident', aptToken: token })
    } catch (err) {
      logger.warn('Não foi possível gerar custom token para morador:', err)
    }

    const publicSnap = await db.ref(`public/${token}`).get()
    const publicData = publicSnap.exists() ? publicSnap.val() : {}
    const { accessPasswordHash: _h, hasPassword: _hp, ...safeData } = publicData
    return { ...safeData, _firebaseToken: residentFirebaseToken }
  }
)

// ═══════════════════════════════════════════════════════════
// BACKUP MENSAL
// Roda todo dia 1 às 03:00 (horário de Brasília).
// Exporta snapshot completo do RTDB como JSON pro Firebase Storage.
// Os arquivos ficam em: gs://<bucket>/backups/rtdb-YYYY-MM.json
//
// Configurar secrets (uma vez só):
//   firebase functions:secrets:set STORAGE_BUCKET
//   → valor: hydrogas-77f04.appspot.com
// ═══════════════════════════════════════════════════════════
exports.monthlyBackup = onSchedule(
  {
    schedule:       '0 3 1 * *',
    timeZone:       'America/Sao_Paulo',
    secrets:        ['DATABASE_URL', 'STORAGE_BUCKET'],
    timeoutSeconds: 120,
    memory:         '512MiB',
    region:         'us-central1',
  },
  async () => {
    const db     = getDatabase()
    const bucket = getStorage().bucket(process.env.STORAGE_BUCKET)

    const snap = await db.ref('/').get()
    if (!snap.exists()) {
      logger.warn('monthlyBackup: banco vazio, backup ignorado.')
      return
    }

    const now   = new Date()
    const label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const path  = `backups/rtdb-${label}.json`

    await bucket.file(path).save(JSON.stringify(snap.val(), null, 2), {
      contentType: 'application/json',
      metadata: { metadata: { createdAt: now.toISOString() } },
    })

    logger.info(`monthlyBackup: salvo em gs://${process.env.STORAGE_BUCKET}/${path}`)
  }
)

// ═══════════════════════════════════════════════════════════
// RELATÓRIO MENSAL VIA WHATSAPP (TWILIO)
// Roda todo dia 1 às 08:00 (horário de Brasília).
//
// O número de destino é lido de /config/managerPhone no RTDB —
// o mesmo campo que o síndico preenche em Configurações > Telefone/WhatsApp.
// Se mudar o número lá, a próxima execução já usa o novo automaticamente.
//
// Formato aceito em managerPhone: só dígitos ou máscara BR
//   ex: "48999990000" ou "(48) 99999-0000"
//
// Configurar secrets (uma vez só):
//   firebase functions:secrets:set TWILIO_ACCOUNT_SID
//   → valor: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  (Twilio Console > Account Info)
//
//   firebase functions:secrets:set TWILIO_AUTH_TOKEN
//   → valor: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   (ao lado do SID)
//
//   firebase functions:secrets:set TWILIO_FROM
//   → Sandbox:  whatsapp:+14155238886
//   → Produção: whatsapp:+55...  (número aprovado no Twilio)
// ═══════════════════════════════════════════════════════════
exports.monthlyWhatsAppReport = onSchedule(
  {
    schedule:       '0 8 1 * *',
    timeZone:       'America/Sao_Paulo',
    secrets:        ['DATABASE_URL', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'],
    timeoutSeconds: 60,
    memory:         '256MiB',
    region:         'us-central1',
  },
  async () => {
    const db = getDatabase()

    // ── Lê config do app ──────────────────────────────────────────────────────
    const configSnap = await db.ref('config').get()
    if (!configSnap.exists()) {
      logger.warn('monthlyWhatsAppReport: /config não encontrado, abortando.')
      return
    }
    const config = configSnap.val()

    // ── Formata número do síndico para E.164 ──────────────────────────────────
    // Remove tudo que não for dígito e adiciona DDI +55 se necessário
    const rawPhone = (config.managerPhone || '').replace(/\D/g, '')
    if (!rawPhone || rawPhone.length < 10) {
      logger.warn('monthlyWhatsAppReport: managerPhone não configurado ou inválido — acesse Configurações e preencha o campo Telefone/WhatsApp.')
      return
    }
    const e164    = rawPhone.startsWith('55') ? `+${rawPhone}` : `+55${rawPhone}`
    const toPhone = `whatsapp:${e164}`

    // ── Determina mês anterior ────────────────────────────────────────────────
    const now      = new Date()
    const year     = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const month    = now.getMonth() === 0 ? 12 : now.getMonth()  // 1–12
    const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                       'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const monthName = MONTHS_PT[month - 1]

    // ── Lê leituras fechadas do mês anterior ──────────────────────────────────
    const readingsSnap = await db.ref('readings').get()
    const byApt = {}

    if (readingsSnap.exists()) {
      for (const r of Object.values(readingsSnap.val())) {
        if (r.month !== month || r.year !== year) continue
        if (!r.closedAt && r.status !== 'closed') continue

        if (!byApt[r.apartmentId]) byApt[r.apartmentId] = { wCost: 0, gCost: 0 }
        if (r.type === 'water') byApt[r.apartmentId].wCost += r.totalCost || 0
        else                    byApt[r.apartmentId].gCost += r.totalCost || 0
      }
    }

    // ── Números dos apartamentos ──────────────────────────────────────────────
    const aptsSnap   = await db.ref('apartments').get()
    const aptNumbers = {}
    if (aptsSnap.exists()) {
      for (const [id, apt] of Object.entries(aptsSnap.val())) {
        aptNumbers[id] = apt.number || id
      }
    }

    // ── Totais e top 3 ────────────────────────────────────────────────────────
    const entries    = Object.entries(byApt)
    const totalApts  = entries.length
    const totalAgua  = entries.reduce((s, [, v]) => s + v.wCost, 0)
    const totalGas   = entries.reduce((s, [, v]) => s + v.gCost, 0)
    const totalGeral = totalAgua + totalGas

    const fmt = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`

    const top3Lines = entries
      .map(([id, v]) => ({ num: aptNumbers[id] || id, total: v.wCost + v.gCost }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map((a, i) => `  ${i + 1}. Ap. ${a.num} — ${fmt(a.total)}`)
      .join('\n') || '  Sem dados'

    // ── Mensagem ──────────────────────────────────────────────────────────────
    const message = [
      `📊 *Relatório ${config.condominiumName || 'HidroGás'}*`,
      `_${monthName} ${year}_`,
      ``,
      `🏢 Apartamentos: *${totalApts}*`,
      `💧 Água:  *${fmt(totalAgua)}*`,
      `🔥 Gás:   *${fmt(totalGas)}*`,
      `💰 Total: *${fmt(totalGeral)}*`,
      ``,
      `🏆 Maiores consumos:`,
      top3Lines,
      ``,
      `_Gerado automaticamente_`,
    ].join('\n')

    // ── Envia ─────────────────────────────────────────────────────────────────
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    await client.messages.create({ from: process.env.TWILIO_FROM, to: toPhone, body: message })

    logger.info(`monthlyWhatsAppReport: enviado para ${toPhone} — ${monthName}/${year}`)
  }
)
