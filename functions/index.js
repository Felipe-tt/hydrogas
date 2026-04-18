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

// O Firebase Admin SDK detecta projectId e serviceAccountId automaticamente
// a partir do ambiente do Cloud Functions (GOOGLE_APPLICATION_CREDENTIALS).
// A databaseURL é lida de variável de ambiente para não ficar hardcoded.
// Configure: firebase functions:secrets:set DATABASE_URL
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

// Origens permitidas — ajuste conforme seu domínio de produção
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

// ── Rate limiting persistente no Firebase RTDB ────────────────────────────────
const MAX_TRIES = 5
const WINDOW_MS = 15 * 60 * 1000   // 15 minutos

function sanitizeKey(raw) {
  return raw.replace(/[./#$[\]]/g, '_').slice(0, 100)
}

async function isRateLimited(key) {
  const db      = getDatabase()
  const safeKey = sanitizeKey(key)
  const ref     = db.ref(`_rateLimit/${safeKey}`)
  const now     = Date.now()

  let blocked = false

  await ref.transaction((current) => {
    if (!current) {
      return { count: 1, resetAt: now + WINDOW_MS }
    }
    if (current.resetAt < now) {
      return { count: 1, resetAt: now + WINDOW_MS }
    }
    if (current.count >= MAX_TRIES) {
      blocked = true
      return current
    }
    return { count: current.count + 1, resetAt: current.resetAt }
  })

  return blocked
}

async function clearRateLimit(key) {
  const db      = getDatabase()
  const safeKey = sanitizeKey(key)
  await getDatabase().ref(`_rateLimit/${safeKey}`).remove()
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

    const expectedUsername = process.env.ADMIN_USERNAME      || 'admin'
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
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError('unauthenticated', 'Acesso não autorizado.')
    }

    const { password } = request.data || {}
    if (!password || typeof password !== 'string' || password.length < 4) {
      throw new HttpsError('invalid-argument', 'Senha inválida.')
    }

    try {
      const hash = await argon2.hash(password, ARGON2_OPTIONS)
      return { hash }
    } catch (err) {
      logger.error('Erro ao gerar hash da senha:', err)
      throw new HttpsError('internal', 'Erro interno ao processar senha.')
    }
  }
)

// ── isRateLimitedReadOnly ─────────────────────────────────────────────────────
async function isRateLimitedReadOnly(key) {
  const db      = getDatabase()
  const safeKey = sanitizeKey(key)
  const snap    = await db.ref(`_rateLimit/${safeKey}`).get()
  if (!snap.exists()) return false
  const { count, resetAt } = snap.val()
  if (Date.now() > resetAt) return false
  return count >= MAX_TRIES
}

// ── recordFailedAttempt ───────────────────────────────────────────────────────
async function recordFailedAttempt(key) {
  const db      = getDatabase()
  const safeKey = sanitizeKey(key)
  const ref     = db.ref(`_rateLimit/${safeKey}`)
  const now     = Date.now()
  await ref.transaction((current) => {
    if (!current || current.resetAt < now) {
      return { count: 1, resetAt: now + WINDOW_MS }
    }
    return { count: current.count + 1, resetAt: current.resetAt }
  })
}

// ── resetApartmentRateLimit ──────────────────────────────────────────────────
exports.resetApartmentRateLimit = onCall(
  { region: 'us-central1', secrets: ['DATABASE_URL'], enforceAppCheck: true },
  async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError('unauthenticated', 'Acesso não autorizado.')
    }
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

    if (!token) {
      throw new HttpsError('invalid-argument', 'Token obrigatório.')
    }

    const rateLimitKey = `apt:${token}`

    if (await isRateLimitedReadOnly(rateLimitKey)) {
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')
    }

    const db = getDatabase()

    const aptSnap = await db.ref('apartments')
      .orderByChild('publicToken')
      .equalTo(token)
      .limitToFirst(1)
      .get()

    if (!aptSnap.exists()) {
      throw new HttpsError('not-found', 'Link inválido.')
    }

    const aptData = Object.values(aptSnap.val())[0]

    if (aptData.accessPasswordHash) {
      if (!password) {
        throw new HttpsError('unauthenticated', 'Senha obrigatória.')
      }
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
      residentFirebaseToken = await getAuth().createCustomToken(uid, {
        role: 'resident',
        aptToken: token,
      })
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
// Roda todo dia 1 às 03:00 (horário de Brasília)
// Exporta todo o RTDB como JSON pro Firebase Storage.
//
// Secrets necessários:
//   DATABASE_URL   — já existente
//   STORAGE_BUCKET — ex: hydrogas-77f04.appspot.com
//
// Configurar:
//   firebase functions:secrets:set STORAGE_BUCKET
// ═══════════════════════════════════════════════════════════
exports.monthlyBackup = onSchedule(
  {
    schedule:        'every day 03:00',   // ajuste para "0 3 1 * *" se quiser só dia 1
    timeZone:        'America/Sao_Paulo',
    secrets:         ['DATABASE_URL', 'STORAGE_BUCKET'],
    timeoutSeconds:  120,
    memory:          '512MiB',
    region:          'us-central1',
  },
  async () => {
    const db     = getDatabase()
    const bucket = getStorage().bucket(process.env.STORAGE_BUCKET)

    // Lê todo o banco
    const snap = await db.ref('/').get()
    if (!snap.exists()) {
      logger.warn('monthlyBackup: banco vazio, backup ignorado.')
      return
    }

    const data    = snap.val()
    const now     = new Date()
    const label   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const path    = `backups/rtdb-${label}.json`
    const file    = bucket.file(path)
    const content = JSON.stringify(data, null, 2)

    await file.save(content, {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'no-cache',
        metadata: { createdAt: now.toISOString(), source: 'monthlyBackup' },
      },
    })

    logger.info(`monthlyBackup: backup salvo em gs://${process.env.STORAGE_BUCKET}/${path}`)
  }
)

// ═══════════════════════════════════════════════════════════
// RELATÓRIO MENSAL VIA WHATSAPP (TWILIO)
// Roda todo dia 1 às 08:00 (horário de Brasília)
// Lê as leituras do mês anterior e manda resumo pro síndico.
//
// Secrets necessários:
//   DATABASE_URL        — já existente
//   TWILIO_ACCOUNT_SID  — no Twilio Console
//   TWILIO_AUTH_TOKEN   — no Twilio Console
//   TWILIO_FROM         — número Twilio, ex: whatsapp:+14155238886
//   SINDICO_WHATSAPP    — número do síndico, ex: whatsapp:+5548999990000
//
// Configurar:
//   firebase functions:secrets:set TWILIO_ACCOUNT_SID
//   firebase functions:secrets:set TWILIO_AUTH_TOKEN
//   firebase functions:secrets:set TWILIO_FROM
//   firebase functions:secrets:set SINDICO_WHATSAPP
// ═══════════════════════════════════════════════════════════
exports.monthlyWhatsAppReport = onSchedule(
  {
    schedule:        '0 8 1 * *',   // todo dia 1 às 08:00
    timeZone:        'America/Sao_Paulo',
    secrets:         ['DATABASE_URL', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'SINDICO_WHATSAPP'],
    timeoutSeconds:  60,
    memory:          '256MiB',
    region:          'us-central1',
  },
  async () => {
    const db = getDatabase()

    // Mês anterior
    const now      = new Date()
    const year     = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const month    = now.getMonth() === 0 ? 12 : now.getMonth()   // 1–12
    const monthPad = String(month).padStart(2, '0')
    const prefix   = `${year}-${monthPad}`

    const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                       'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const monthName = MONTHS_PT[month - 1]

    // Busca leituras fechadas do mês anterior
    const readingsSnap = await db.ref('readings').get()
    const apartments   = {}

    if (readingsSnap.exists()) {
      const all = readingsSnap.val()
      for (const id of Object.keys(all)) {
        const r = all[id]
        // Filtra: fechadas e do mês/ano alvo
        if (r.status !== 'closed') continue
        const readingDate = r.readingDate || r.closedAt || ''
        if (!readingDate.startsWith(prefix)) continue

        if (!apartments[r.apartmentId]) {
          apartments[r.apartmentId] = { waterCost: 0, gasCost: 0, waterM3: 0, gasM3: 0 }
        }
        if (r.type === 'water') {
          apartments[r.apartmentId].waterCost += r.totalCost    || 0
          apartments[r.apartmentId].waterM3   += r.consumption  || 0
        } else {
          apartments[r.apartmentId].gasCost += r.totalCost   || 0
          apartments[r.apartmentId].gasM3   += r.consumption || 0
        }
      }
    }

    // Busca números dos apartamentos para exibir no relatório
    const aptsSnap = await db.ref('apartments').get()
    const aptNumbers = {}
    if (aptsSnap.exists()) {
      const all = aptsSnap.val()
      for (const [id, apt] of Object.entries(all)) {
        aptNumbers[id] = apt.number || id
      }
    }

    const totalApts  = Object.keys(apartments).length
    const totalAgua  = Object.values(apartments).reduce((s, a) => s + a.waterCost, 0)
    const totalGas   = Object.values(apartments).reduce((s, a) => s + a.gasCost,   0)
    const totalGeral = totalAgua + totalGas

    const fmt = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`

    // Top 3 consumidores por custo total
    const top3 = Object.entries(apartments)
      .map(([id, v]) => ({ num: aptNumbers[id] || id, total: v.waterCost + v.gasCost }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)

    const top3Lines = top3.length > 0
      ? top3.map((a, i) => `  ${i + 1}. Ap. ${a.num} — ${fmt(a.total)}`).join('\n')
      : '  Sem dados'

    const message = [
      `📊 *Relatório HidroGás — ${monthName} ${year}*`,
      ``,
      `🏢 Apartamentos com leitura: *${totalApts}*`,
      ``,
      `💧 Total Água:  *${fmt(totalAgua)}*`,
      `🔥 Total Gás:   *${fmt(totalGas)}*`,
      `💰 Total Geral: *${fmt(totalGeral)}*`,
      ``,
      `🏆 Maiores consumos:`,
      top3Lines,
      ``,
      `_Gerado automaticamente pelo HidroGás_`,
    ].join('\n')

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

    await client.messages.create({
      from: process.env.TWILIO_FROM,
      to:   process.env.SINDICO_WHATSAPP,
      body: message,
    })

    logger.info(`monthlyWhatsAppReport: relatório de ${monthName}/${year} enviado para ${process.env.SINDICO_WHATSAPP}`)
  }
)
