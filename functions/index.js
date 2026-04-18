/**
 * HidroGás — Firebase Cloud Functions
 *
 * adminLogin            → Login do síndico com Argon2id + Custom Token
 * hashApartmentPassword → Gera hash Argon2id da senha do apartamento (autenticado)
 * resetApartmentRateLimit → Reseta rate limit de um apartamento (autenticado)
 * getPublicApartment    → Dados do apartamento para o morador (valida hash no servidor)
 * monthlyBackup         → Snapshot do RTDB no Storage (todo dia 1 às 03h)
 * monthlyEmailReport    → Relatório de consumo por e-mail (dia configurável em /config/reportDay)
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule }         = require('firebase-functions/v2/scheduler')
const { logger }             = require('firebase-functions')
const argon2                 = require('argon2')
const { initializeApp }      = require('firebase-admin/app')
const { getAuth }            = require('firebase-admin/auth')
const { getDatabase }        = require('firebase-admin/database')
const { getStorage }         = require('firebase-admin/storage')
const nodemailer             = require('nodemailer')

initializeApp({ databaseURL: process.env.DATABASE_URL })

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_UID = 'hydrogas-admin'

const ARGON2_OPTIONS = {
  type:        argon2.argon2id,
  memoryCost:  65536,
  timeCost:    3,
  parallelism: 1,
}

const RATE_LIMIT = {
  maxTries: 5,
  windowMs: 15 * 60 * 1000,
}

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeKey(raw) {
  return raw.replace(/[./#$[\]]/g, '_').slice(0, 100)
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
  return 'ip:' + (forwarded.split(',')[0].trim() || req.ip || 'unknown')
}

function formatBRL(value) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

function formatM3(value) {
  return `${value.toFixed(1).replace('.', ',')} m³`
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

async function isRateLimited(key) {
  const ref   = getDatabase().ref(`_rateLimit/${sanitizeKey(key)}`)
  const now   = Date.now()
  let blocked = false

  await ref.transaction((current) => {
    if (!current || current.resetAt < now)
      return { count: 1, resetAt: now + RATE_LIMIT.windowMs }

    if (current.count >= RATE_LIMIT.maxTries) {
      blocked = true
      return current
    }

    return { count: current.count + 1, resetAt: current.resetAt }
  })

  return blocked
}

async function isRateLimitedReadOnly(key) {
  const snap = await getDatabase().ref(`_rateLimit/${sanitizeKey(key)}`).get()
  if (!snap.exists()) return false
  const { count, resetAt } = snap.val()
  return Date.now() <= resetAt && count >= RATE_LIMIT.maxTries
}

async function recordFailedAttempt(key) {
  const ref = getDatabase().ref(`_rateLimit/${sanitizeKey(key)}`)
  const now = Date.now()

  await ref.transaction((current) => {
    if (!current || current.resetAt < now)
      return { count: 1, resetAt: now + RATE_LIMIT.windowMs }
    return { count: current.count + 1, resetAt: current.resetAt }
  })
}

async function clearRateLimit(key) {
  await getDatabase().ref(`_rateLimit/${sanitizeKey(key)}`).remove()
}

// ─── Email template ───────────────────────────────────────────────────────────

function buildApartmentRow(apt, index) {
  const bg = index % 2 === 0 ? '#ffffff' : '#f9fafb'
  const td = `padding:12px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;`

  return `
    <tr style="background:${bg};">
      <td style="${td}font-weight:600;color:#111827;">${apt.num}</td>
      <td style="${td}color:#2563eb;font-family:monospace;">${formatM3(apt.wM3)}</td>
      <td style="${td}color:#ea580c;font-family:monospace;">${formatM3(apt.gM3)}</td>
      <td style="${td}color:#2563eb;font-family:monospace;">${formatBRL(apt.wCost)}</td>
      <td style="${td}color:#ea580c;font-family:monospace;">${formatBRL(apt.gCost)}</td>
      <td style="${td}font-weight:700;color:#111827;font-family:monospace;">${formatBRL(apt.total)}</td>
    </tr>`
}

function buildKpiCell(emoji, label, color, bgColor, borderColor, value, sub) {
  return `
    <td width="33%" valign="top" style="padding:0 6px;">
      <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:12px;padding:20px 14px;text-align:center;">
        <div style="font-size:24px;margin-bottom:8px;">${emoji}</div>
        <div style="color:${color};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">${label}</div>
        <div style="color:${color};font-size:20px;font-weight:800;font-family:monospace;line-height:1;">${value}</div>
        <div style="color:#9ca3af;font-size:11px;margin-top:5px;">${sub}</div>
      </div>
    </td>`
}

function buildEmailHtml({ condName, managerName, monthName, year, generatedAt, totals, aptRows }) {
  const { agua, gas, geral, m3Agua, m3Gas, numApts } = totals

  const aptRowsHtml = aptRows.length > 0
    ? aptRows.map(buildApartmentRow).join('')
    : null

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Relatório ${monthName}/${year} — ${condName}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Relatório de consumo ${monthName}/${year} — ${condName}
  </div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr><td align="center" style="padding:40px 16px;">

      <!-- Container -->
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:#111827;border-radius:12px 12px 0 0;padding:36px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px;">
                    Relatório Mensal
                  </div>
                  <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.1;">
                    ${monthName} ${year}
                  </div>
                  <div style="font-size:14px;color:#6b7280;margin-top:6px;">
                    ${condName}
                  </div>
                </td>
                <td align="right" valign="top">
                  <div style="background:#1f2937;border:1px solid #374151;border-radius:10px;width:48px;height:48px;text-align:center;line-height:48px;font-size:22px;">
                    💧
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="background:#ffffff;padding:36px 40px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">

            <!-- Greeting -->
            <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.7;">
              Olá, <strong style="color:#111827;">${managerName}</strong>. Aqui está o resumo de consumo de água e gás de
              <strong style="color:#111827;">${monthName} de ${year}</strong>.
            </p>

            <!-- KPI cards -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px 28px;">
              <tr>
                ${buildKpiCell('💧', 'Água',  '#1d4ed8', '#eff6ff', '#bfdbfe', formatBRL(agua),  formatM3(m3Agua))}
                ${buildKpiCell('🔥', 'Gás',   '#c2410c', '#fff7ed', '#fed7aa', formatBRL(gas),   formatM3(m3Gas))}
                ${buildKpiCell('💰', 'Total', '#15803d', '#f0fdf4', '#bbf7d0', formatBRL(geral), `${numApts} apto${numApts !== 1 ? 's' : ''}`)}
              </tr>
            </table>

            <!-- Section label -->
            <div style="font-size:11px;font-weight:700;color:#111827;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #111827;">
              Detalhamento por apartamento
            </div>

            <!-- Detail table -->
            ${aptRowsHtml ? `
            <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Ap.</th>
                    <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#2563eb;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Água m³</th>
                    <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#ea580c;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Gás m³</th>
                    <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#2563eb;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Custo água</th>
                    <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#ea580c;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Custo gás</th>
                    <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#111827;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Total</th>
                  </tr>
                </thead>
                <tbody>${aptRowsHtml}</tbody>
              </table>
            </div>` : `
            <div style="text-align:center;padding:40px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
              <div style="font-size:32px;margin-bottom:10px;">📭</div>
              <div style="font-size:14px;color:#9ca3af;">Nenhuma leitura fechada em ${monthName}/${year}.</div>
            </div>`}

          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.7;">
                    Gerado automaticamente pelo <strong style="color:#6b7280;">HidroGás</strong> em ${generatedAt}.<br>
                    Este é um e-mail automático — não responda.
                  </p>
                </td>
                <td align="right">
                  <span style="display:inline-block;background:#111827;color:#ffffff;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;padding:5px 12px;border-radius:6px;">
                    HidroGás
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`
}

// ─── Functions ────────────────────────────────────────────────────────────────

exports.adminLogin = onCall(
  {
    secrets:         ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'DATABASE_URL'],
    timeoutSeconds:  30,
    memory:          '512MiB',
    region:          'us-central1',
    enforceAppCheck: true,
  },
  async (request) => {
    const ipKey = getClientIp(request.rawRequest)

    if (await isRateLimited(ipKey))
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')

    const { username, password } = request.data || {}
    if (!username || !password)
      throw new HttpsError('invalid-argument', 'Dados inválidos.')

    const passwordHash = process.env.ADMIN_PASSWORD_HASH
    if (!passwordHash) {
      logger.error('ADMIN_PASSWORD_HASH não configurado!')
      throw new HttpsError('internal', 'Servidor mal configurado.')
    }

    const usernameOk = username === process.env.ADMIN_USERNAME
    let passwordOk   = false

    try {
      passwordOk = await argon2.verify(passwordHash, password, { type: argon2.argon2id })
    } catch (err) {
      logger.error('Erro ao verificar senha:', err)
      throw new HttpsError('internal', 'Erro interno.')
    }

    if (!usernameOk || !passwordOk)
      throw new HttpsError('unauthenticated', 'Usuário ou senha incorretos.')

    await clearRateLimit(ipKey)

    try {
      const token = await getAuth().createCustomToken(ADMIN_UID, { role: 'admin' })
      return { token }
    } catch (err) {
      logger.error('Erro ao criar token:', err)
      throw new HttpsError('internal', err?.message || 'Erro ao criar sessão.')
    }
  }
)

exports.hashApartmentPassword = onCall(
  {
    region:          'us-central1',
    secrets:         ['DATABASE_URL'],
    enforceAppCheck: true,
  },
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
      logger.error('Erro ao gerar hash:', err)
      throw new HttpsError('internal', 'Erro interno.')
    }
  }
)

exports.resetApartmentRateLimit = onCall(
  {
    region:          'us-central1',
    secrets:         ['DATABASE_URL'],
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID)
      throw new HttpsError('unauthenticated', 'Acesso não autorizado.')

    const { token } = request.data || {}
    if (!token)
      throw new HttpsError('invalid-argument', 'Token obrigatório.')

    await clearRateLimit(`apt:${token}`)
    return { ok: true }
  }
)

exports.getPublicApartment = onCall(
  {
    region:          'us-central1',
    secrets:         ['DATABASE_URL'],
    enforceAppCheck: true,
  },
  async (request) => {
    const { token, password } = request.data || {}
    if (!token)
      throw new HttpsError('invalid-argument', 'Token obrigatório.')

    const rateLimitKey = `apt:${token}`
    if (await isRateLimitedReadOnly(rateLimitKey))
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')

    const db      = getDatabase()
    const aptSnap = await db.ref('apartments')
      .orderByChild('publicToken').equalTo(token).limitToFirst(1).get()

    if (!aptSnap.exists())
      throw new HttpsError('not-found', 'Link inválido.')

    const aptData = Object.values(aptSnap.val())[0]

    if (aptData.accessPasswordHash) {
      if (!password)
        throw new HttpsError('unauthenticated', 'Senha obrigatória.')

      let passwordOk = false
      try {
        passwordOk = await argon2.verify(
          aptData.accessPasswordHash,
          password.trim(),
          { type: argon2.argon2id }
        )
      } catch (err) {
        logger.error('Erro ao verificar senha do apartamento:', err)
        throw new HttpsError('internal', 'Erro interno.')
      }

      if (!passwordOk) {
        await recordFailedAttempt(rateLimitKey)
        throw new HttpsError('unauthenticated', 'Senha incorreta.')
      }

      await clearRateLimit(rateLimitKey)
    }

    let residentFirebaseToken = null
    try {
      residentFirebaseToken = await getAuth().createCustomToken(
        `resident-${sanitizeKey(token)}`,
        { role: 'resident', aptToken: token }
      )
    } catch (err) {
      logger.warn('Não foi possível gerar token morador:', err)
    }

    const publicSnap = await db.ref(`public/${token}`).get()
    const publicData = publicSnap.exists() ? publicSnap.val() : {}
    const { accessPasswordHash: _h, hasPassword: _hp, ...safeData } = publicData

    return { ...safeData, _firebaseToken: residentFirebaseToken }
  }
)

// ─── monthlyBackup ────────────────────────────────────────────────────────────
// Roda todo dia 1 às 03:00 (Brasília).
// Salva snapshot do RTDB em gs://<bucket>/backups/rtdb-YYYY-MM.json
//
// Secret necessário:
//   firebase functions:secrets:set STORAGE_BUCKET
//   → valor: hydrogas-77f04.appspot.com
// ─────────────────────────────────────────────────────────────────────────────

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
    const snap = await getDatabase().ref('/').get()
    if (!snap.exists()) {
      logger.warn('monthlyBackup: banco vazio.')
      return
    }

    const now      = new Date()
    const label    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const filePath = `backups/rtdb-${label}.json`

    await getStorage()
      .bucket(process.env.STORAGE_BUCKET)
      .file(filePath)
      .save(JSON.stringify(snap.val(), null, 2), {
        contentType: 'application/json',
        metadata:    { metadata: { createdAt: now.toISOString() } },
      })

    logger.info(`monthlyBackup: salvo em gs://${process.env.STORAGE_BUCKET}/${filePath}`)
  }
)

// ─── monthlyEmailReport ───────────────────────────────────────────────────────
// Roda todo dia às 08:00 (Brasília).
// Só envia se hoje === /config/reportDay (padrão: 1).
// Destinatário: /config/managerEmail
//
// Secret necessário:
//   firebase functions:secrets:set GMAIL_APP_PASSWORD
//   → senha de app de 16 dígitos gerada em myaccount.google.com/apppasswords
// ─────────────────────────────────────────────────────────────────────────────

exports.monthlyEmailReport = onSchedule(
  {
    schedule:       '0 8 * * *',
    timeZone:       'America/Sao_Paulo',
    secrets:        ['DATABASE_URL', 'GMAIL_APP_PASSWORD'],
    timeoutSeconds: 60,
    memory:         '256MiB',
    region:         'us-central1',
  },
  async () => {
    const db = getDatabase()

    // Config
    const configSnap = await db.ref('config').get()
    if (!configSnap.exists()) {
      logger.warn('monthlyEmailReport: /config não encontrado.')
      return
    }
    const config = configSnap.val()

    // Verifica dia de envio
    const reportDay = config.reportDay ?? 1
    const today     = new Date()
    if (today.getDate() !== reportDay) {
      logger.info(`monthlyEmailReport: hoje é dia ${today.getDate()}, envio configurado para dia ${reportDay}. Pulando.`)
      return
    }

    // Valida e-mail
    const toEmail = (config.managerEmail || '').trim()
    if (!toEmail) {
      logger.warn('monthlyEmailReport: managerEmail não configurado.')
      return
    }

    // Mês de referência (mês anterior)
    const refYear  = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
    const refMonth = today.getMonth() === 0 ? 12 : today.getMonth() // 1–12

    // Lê leituras fechadas do mês de referência
    const readingsSnap = await db.ref('readings').get()
    const byApt        = {}

    if (readingsSnap.exists()) {
      for (const r of Object.values(readingsSnap.val())) {
        if (r.month !== refMonth || r.year !== refYear) continue
        if (!r.closedAt && r.status !== 'closed') continue

        if (!byApt[r.apartmentId]) byApt[r.apartmentId] = { wCost: 0, gCost: 0, wM3: 0, gM3: 0 }

        if (r.type === 'water') {
          byApt[r.apartmentId].wCost += r.totalCost   || 0
          byApt[r.apartmentId].wM3   += r.consumption || 0
        } else {
          byApt[r.apartmentId].gCost += r.totalCost   || 0
          byApt[r.apartmentId].gM3   += r.consumption || 0
        }
      }
    }

    // Mapeia IDs → números de apartamento
    const aptsSnap   = await db.ref('apartments').get()
    const aptNumbers = {}
    if (aptsSnap.exists()) {
      for (const [id, apt] of Object.entries(aptsSnap.val()))
        aptNumbers[id] = apt.number || id
    }

    // Linhas ordenadas por total desc
    const aptRows = Object.entries(byApt)
      .map(([id, v]) => ({
        num:   aptNumbers[id] || id,
        wM3:   v.wM3,
        gM3:   v.gM3,
        wCost: v.wCost,
        gCost: v.gCost,
        total: v.wCost + v.gCost,
      }))
      .sort((a, b) => b.total - a.total)

    // Totais
    const totals = {
      agua:    aptRows.reduce((s, r) => s + r.wCost, 0),
      gas:     aptRows.reduce((s, r) => s + r.gCost, 0),
      geral:   aptRows.reduce((s, r) => s + r.total, 0),
      m3Agua:  aptRows.reduce((s, r) => s + r.wM3,   0),
      m3Gas:   aptRows.reduce((s, r) => s + r.gM3,   0),
      numApts: aptRows.length,
    }

    const condName    = config.condominiumName || 'HidroGás'
    const managerName = config.managerName     || 'Síndico'
    const monthName   = MONTHS_PT[refMonth - 1]
    const generatedAt = today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

    // Texto plano (fallback para clientes sem HTML)
    const text = [
      `Relatório HidroGás — ${monthName} ${refYear}`,
      condName,
      '',
      `Apartamentos: ${totals.numApts}`,
      `Água:  ${formatBRL(totals.agua)} (${formatM3(totals.m3Agua)})`,
      `Gás:   ${formatBRL(totals.gas)} (${formatM3(totals.m3Gas)})`,
      `Total: ${formatBRL(totals.geral)}`,
      '',
      'Detalhamento:',
      ...aptRows.map(a => `  Ap. ${a.num} — Água ${formatBRL(a.wCost)} | Gás ${formatBRL(a.gCost)} | Total ${formatBRL(a.total)}`),
      '',
      `Gerado automaticamente em ${generatedAt}.`,
    ].join('\n')

    // HTML
    const html = buildEmailHtml({
      condName,
      managerName,
      monthName,
      year: refYear,
      generatedAt,
      totals,
      aptRows,
    })

    // Envia
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'hidrogas.noreply@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    await transporter.sendMail({
      from:    '"HidroGás" <hidrogas.noreply@gmail.com>',
      to:      toEmail,
      subject: `Relatório ${monthName}/${refYear} — ${condName}`,
      text,
      html,
    })

    logger.info(`monthlyEmailReport: enviado para ${toEmail} — ${monthName}/${refYear}`)
  }
)
