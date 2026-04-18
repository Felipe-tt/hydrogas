/**
 * HidroGás — Firebase Cloud Functions
 *
 * adminLogin:            Login do síndico com Argon2id + Custom Token
 * hashApartmentPassword: Gera hash Argon2id da senha do apartamento (chamada autenticada)
 * getPublicApartment:    Dados do apartamento para o morador (valida hash no servidor)
 * monthlyBackup:         Backup automático do RTDB no Firebase Storage (todo dia 1 às 03h)
 * monthlyEmailReport:    Relatório mensal de consumo por e-mail pro síndico
 *                        → Dia de envio configurável em /config/reportDay (padrão: 1)
 *                        → Destinatário configurável em /config/managerEmail
 */

const { onCall, HttpsError }  = require('firebase-functions/v2/https')
const { onSchedule }          = require('firebase-functions/v2/scheduler')
const { logger }              = require('firebase-functions')
const argon2                  = require('argon2')
const { initializeApp }       = require('firebase-admin/app')
const { getAuth }             = require('firebase-admin/auth')
const { getDatabase }         = require('firebase-admin/database')
const { getStorage }          = require('firebase-admin/storage')
const nodemailer              = require('nodemailer')

initializeApp({ databaseURL: process.env.DATABASE_URL })

const ADMIN_UID = 'hydrogas-admin'

const ARGON2_OPTIONS = {
  type:        argon2.argon2id,
  memoryCost:  65536,
  timeCost:    3,
  parallelism: 1,
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const MAX_TRIES = 5
const WINDOW_MS = 15 * 60 * 1000

function sanitizeKey(raw) {
  return raw.replace(/[./#$[\]]/g, '_').slice(0, 100)
}

async function isRateLimited(key) {
  const ref   = getDatabase().ref(`_rateLimit/${sanitizeKey(key)}`)
  const now   = Date.now()
  let blocked = false
  await ref.transaction((cur) => {
    if (!cur)                  return { count: 1, resetAt: now + WINDOW_MS }
    if (cur.resetAt < now)     return { count: 1, resetAt: now + WINDOW_MS }
    if (cur.count >= MAX_TRIES){ blocked = true; return cur }
    return { count: cur.count + 1, resetAt: cur.resetAt }
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
  return Date.now() <= resetAt && count >= MAX_TRIES
}

async function recordFailedAttempt(key) {
  const ref = getDatabase().ref(`_rateLimit/${sanitizeKey(key)}`)
  const now = Date.now()
  await ref.transaction((cur) => {
    if (!cur || cur.resetAt < now) return { count: 1, resetAt: now + WINDOW_MS }
    return { count: cur.count + 1, resetAt: cur.resetAt }
  })
}

function getIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '')
  return 'ip:' + (fwd.split(',')[0].trim() || req.ip || 'unknown')
}

// ── adminLogin ────────────────────────────────────────────────────────────────
exports.adminLogin = onCall(
  { secrets: ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'DATABASE_URL'], timeoutSeconds: 30, memory: '512MiB', region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    const ipKey = getIp(request.rawRequest)
    if (await isRateLimited(ipKey))
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')

    const { username, password } = request.data || {}
    if (!username || !password) throw new HttpsError('invalid-argument', 'Dados inválidos.')

    const passwordHash = process.env.ADMIN_PASSWORD_HASH
    if (!passwordHash) {
      logger.error('ADMIN_PASSWORD_HASH não configurado!')
      throw new HttpsError('internal', 'Servidor mal configurado.')
    }

    const usernameOk = username === process.env.ADMIN_USERNAME
    let passwordOk   = false
    try { passwordOk = await argon2.verify(passwordHash, password, { type: argon2.argon2id }) }
    catch (err) { logger.error('Erro ao verificar senha:', err); throw new HttpsError('internal', 'Erro interno.') }

    if (!usernameOk || !passwordOk)
      throw new HttpsError('unauthenticated', 'Usuário ou senha incorretos.')

    await clearRateLimit(ipKey)
    try {
      return { token: await getAuth().createCustomToken(ADMIN_UID, { role: 'admin' }) }
    } catch (err) {
      logger.error('Erro ao criar token:', err)
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
    try { return { hash: await argon2.hash(password, ARGON2_OPTIONS) } }
    catch (err) { logger.error('Erro ao gerar hash:', err); throw new HttpsError('internal', 'Erro interno.') }
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
    const aptSnap = await db.ref('apartments').orderByChild('publicToken').equalTo(token).limitToFirst(1).get()
    if (!aptSnap.exists()) throw new HttpsError('not-found', 'Link inválido.')

    const aptData = Object.values(aptSnap.val())[0]
    if (aptData.accessPasswordHash) {
      if (!password) throw new HttpsError('unauthenticated', 'Senha obrigatória.')
      let passwordOk = false
      try { passwordOk = await argon2.verify(aptData.accessPasswordHash, password.trim(), { type: argon2.argon2id }) }
      catch (err) { logger.error('Erro ao verificar senha do apartamento:', err); throw new HttpsError('internal', 'Erro interno.') }
      if (!passwordOk) { await recordFailedAttempt(rateLimitKey); throw new HttpsError('unauthenticated', 'Senha incorreta.') }
      await clearRateLimit(rateLimitKey)
    }

    let residentFirebaseToken = null
    try {
      residentFirebaseToken = await getAuth().createCustomToken(`resident-${sanitizeKey(token)}`, { role: 'resident', aptToken: token })
    } catch (err) { logger.warn('Não foi possível gerar token morador:', err) }

    const publicSnap = await db.ref(`public/${token}`).get()
    const publicData = publicSnap.exists() ? publicSnap.val() : {}
    const { accessPasswordHash: _h, hasPassword: _hp, ...safeData } = publicData
    return { ...safeData, _firebaseToken: residentFirebaseToken }
  }
)

// ═══════════════════════════════════════════════════════════
// BACKUP MENSAL
// Roda todo dia 1 às 03:00 (horário de Brasília).
// Salva snapshot do RTDB como JSON em gs://<bucket>/backups/rtdb-YYYY-MM.json
//
// Configurar secret (uma vez só):
//   firebase functions:secrets:set STORAGE_BUCKET
//   → valor: hydrogas-77f04.appspot.com
// ═══════════════════════════════════════════════════════════
exports.monthlyBackup = onSchedule(
  { schedule: '0 3 1 * *', timeZone: 'America/Sao_Paulo', secrets: ['DATABASE_URL', 'STORAGE_BUCKET'], timeoutSeconds: 120, memory: '512MiB', region: 'us-central1' },
  async () => {
    const snap = await getDatabase().ref('/').get()
    if (!snap.exists()) { logger.warn('monthlyBackup: banco vazio.'); return }

    const now   = new Date()
    const label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const path  = `backups/rtdb-${label}.json`

    await getStorage().bucket(process.env.STORAGE_BUCKET).file(path).save(
      JSON.stringify(snap.val(), null, 2),
      { contentType: 'application/json', metadata: { metadata: { createdAt: now.toISOString() } } }
    )
    logger.info(`monthlyBackup: salvo em gs://${process.env.STORAGE_BUCKET}/${path}`)
  }
)

// ═══════════════════════════════════════════════════════════
// RELATÓRIO MENSAL POR E-MAIL
// Roda todo dia às 08:00 (horário de Brasília) e verifica se
// hoje é o dia configurado em /config/reportDay (padrão: 1).
// Envia relatório do mês anterior pro email em /config/managerEmail.
//
// Remetente: hidrogas.noreply@gmail.com (Gmail App Password)
//
// Configurar secrets (uma vez só):
//   firebase functions:secrets:set GMAIL_APP_PASSWORD
//   → valor: a senha de app de 16 dígitos gerada no Google
// ═══════════════════════════════════════════════════════════
exports.monthlyEmailReport = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Sao_Paulo', secrets: ['DATABASE_URL', 'GMAIL_APP_PASSWORD'], timeoutSeconds: 60, memory: '256MiB', region: 'us-central1' },
  async () => {
    const db = getDatabase()

    // ── Lê config ────────────────────────────────────────────────────────────
    const configSnap = await db.ref('config').get()
    if (!configSnap.exists()) { logger.warn('monthlyEmailReport: /config não encontrado.'); return }
    const config = configSnap.val()

    // Verifica se hoje é o dia configurado para envio
    const reportDay = config.reportDay ?? 1
    const today     = new Date()
    if (today.getDate() !== reportDay) {
      logger.info(`monthlyEmailReport: hoje é dia ${today.getDate()}, envio configurado para dia ${reportDay}. Pulando.`)
      return
    }

    // Valida email do destinatário
    const toEmail = (config.managerEmail || '').trim()
    if (!toEmail) { logger.warn('monthlyEmailReport: managerEmail não configurado. Acesse Configurações e preencha o campo E-mail do síndico.'); return }

    // ── Mês anterior ─────────────────────────────────────────────────────────
    const year      = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
    const month     = today.getMonth() === 0 ? 12 : today.getMonth() // 1–12
    const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const monthName = MONTHS_PT[month - 1]

    // ── Lê leituras fechadas do mês anterior ─────────────────────────────────
    const readingsSnap = await db.ref('readings').get()
    const byApt = {}
    if (readingsSnap.exists()) {
      for (const r of Object.values(readingsSnap.val())) {
        if (r.month !== month || r.year !== year) continue
        if (!r.closedAt && r.status !== 'closed') continue
        if (!byApt[r.apartmentId]) byApt[r.apartmentId] = { wCost: 0, gCost: 0, wM3: 0, gM3: 0 }
        if (r.type === 'water') { byApt[r.apartmentId].wCost += r.totalCost || 0; byApt[r.apartmentId].wM3 += r.consumption || 0 }
        else                   { byApt[r.apartmentId].gCost += r.totalCost || 0; byApt[r.apartmentId].gM3 += r.consumption || 0 }
      }
    }

    // ── Números dos apartamentos ──────────────────────────────────────────────
    const aptsSnap   = await db.ref('apartments').get()
    const aptNumbers = {}
    if (aptsSnap.exists()) {
      for (const [id, apt] of Object.entries(aptsSnap.val())) aptNumbers[id] = apt.number || id
    }

    // ── Totais ────────────────────────────────────────────────────────────────
    const entries    = Object.entries(byApt)
    const totalApts  = entries.length
    const totalAgua  = entries.reduce((s, [, v]) => s + v.wCost, 0)
    const totalGas   = entries.reduce((s, [, v]) => s + v.gCost, 0)
    const totalGeral = totalAgua + totalGas
    const totalM3Agua = entries.reduce((s, [, v]) => s + v.wM3, 0)
    const totalM3Gas  = entries.reduce((s, [, v]) => s + v.gM3, 0)

    const fmt    = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`
    const fmtM3  = (v) => `${v.toFixed(1).replace('.', ',')} m³`

    // ── Tabela de apartamentos ────────────────────────────────────────────────
    const aptRows = entries
      .map(([id, v]) => ({ num: aptNumbers[id] || id, wCost: v.wCost, gCost: v.gCost, wM3: v.wM3, gM3: v.gM3, total: v.wCost + v.gCost }))
      .sort((a, b) => b.total - a.total)

    const tableRows = aptRows.map((a, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="padding:10px 14px;font-weight:700;color:#0d1117;border-bottom:1px solid #e2e8f0">${a.num}</td>
        <td style="padding:10px 14px;color:#2563eb;font-family:monospace;border-bottom:1px solid #e2e8f0">${fmtM3(a.wM3)}</td>
        <td style="padding:10px 14px;color:#ea580c;font-family:monospace;border-bottom:1px solid #e2e8f0">${fmtM3(a.gM3)}</td>
        <td style="padding:10px 14px;color:#2563eb;font-family:monospace;border-bottom:1px solid #e2e8f0">${fmt(a.wCost)}</td>
        <td style="padding:10px 14px;color:#ea580c;font-family:monospace;border-bottom:1px solid #e2e8f0">${fmt(a.gCost)}</td>
        <td style="padding:10px 14px;font-weight:700;color:#0d1117;font-family:monospace;border-bottom:1px solid #e2e8f0">${fmt(a.total)}</td>
      </tr>`).join('')

    const condName    = config.condominiumName || 'HidroGás'
    const managerName = config.managerName     || 'Síndico'
    const generatedAt = today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

    // ── HTML do e-mail ────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relatório Mensal — ${condName}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#0f2340 100%);border-radius:16px 16px 0 0;padding:36px 40px 32px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="display:inline-block;background:rgba(59,130,246,0.2);border:1px solid rgba(59,130,246,0.35);border-radius:8px;padding:6px 14px;margin-bottom:16px">
                    <span style="color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">Relatório Mensal</span>
                  </div>
                  <h1 style="margin:0 0 6px;color:#f1f5f9;font-size:26px;font-weight:800;letter-spacing:-0.5px">${condName}</h1>
                  <p style="margin:0;color:#94a3b8;font-size:14px">${monthName} de ${year}</p>
                </td>
                <td align="right" valign="top">
                  <div style="width:52px;height:52px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:26px;line-height:52px;text-align:center">💧</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:0 40px 36px">

            <!-- Saudação -->
            <p style="margin:28px 0 24px;color:#374151;font-size:15px;line-height:1.6">
              Olá, <strong>${managerName}</strong>. Segue o resumo de consumo de água e gás referente ao mês de <strong>${monthName}/${year}</strong>.
            </p>

            <!-- KPI cards -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
              <tr>
                <!-- Água -->
                <td width="33%" style="padding-right:8px">
                  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;text-align:center">
                    <div style="font-size:20px;margin-bottom:6px">💧</div>
                    <div style="color:#1e40af;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px">Água</div>
                    <div style="color:#1d4ed8;font-size:18px;font-weight:800;font-family:monospace">${fmt(totalAgua)}</div>
                    <div style="color:#3b82f6;font-size:11px;margin-top:3px">${fmtM3(totalM3Agua)}</div>
                  </div>
                </td>
                <!-- Gás -->
                <td width="33%" style="padding:0 4px">
                  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;text-align:center">
                    <div style="font-size:20px;margin-bottom:6px">🔥</div>
                    <div style="color:#9a3412;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px">Gás</div>
                    <div style="color:#c2410c;font-size:18px;font-weight:800;font-family:monospace">${fmt(totalGas)}</div>
                    <div style="color:#ea580c;font-size:11px;margin-top:3px">${fmtM3(totalM3Gas)}</div>
                  </div>
                </td>
                <!-- Total -->
                <td width="33%" style="padding-left:8px">
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center">
                    <div style="font-size:20px;margin-bottom:6px">💰</div>
                    <div style="color:#14532d;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px">Total</div>
                    <div style="color:#15803d;font-size:18px;font-weight:800;font-family:monospace">${fmt(totalGeral)}</div>
                    <div style="color:#16a34a;font-size:11px;margin-top:3px">${totalApts} apto${totalApts !== 1 ? 's' : ''}</div>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Tabela de apartamentos -->
            ${totalApts > 0 ? `
            <h2 style="margin:0 0 14px;color:#0d1117;font-size:14px;font-weight:700;letter-spacing:-0.2px">Detalhamento por Apartamento</h2>
            <div style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
                <thead>
                  <tr style="background:#f8fafc">
                    <th style="padding:10px 14px;text-align:left;color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Ap.</th>
                    <th style="padding:10px 14px;text-align:left;color:#2563eb;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Água m³</th>
                    <th style="padding:10px 14px;text-align:left;color:#ea580c;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Gás m³</th>
                    <th style="padding:10px 14px;text-align:left;color:#2563eb;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Custo Água</th>
                    <th style="padding:10px 14px;text-align:left;color:#ea580c;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Custo Gás</th>
                    <th style="padding:10px 14px;text-align:left;color:#0d1117;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Total</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>` : `
            <div style="text-align:center;padding:32px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;color:#94a3b8;font-size:14px">
              Nenhuma leitura fechada encontrada para ${monthName}/${year}.
            </div>`}

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 40px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6">
                    Gerado automaticamente pelo <strong style="color:#64748b">HidroGás</strong> em ${generatedAt}.<br>
                    Este é um e-mail automático. Não responda esta mensagem.
                  </p>
                </td>
                <td align="right">
                  <span style="display:inline-block;background:#e0f2fe;color:#0369a1;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:4px 10px;border-radius:20px">HidroGás</span>
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

    // ── Texto plano (fallback) ────────────────────────────────────────────────
    const text = [
      `Relatório HidroGás — ${monthName} ${year}`,
      `${condName}`,
      ``,
      `Apartamentos: ${totalApts}`,
      `Água:  ${fmt(totalAgua)} (${fmtM3(totalM3Agua)})`,
      `Gás:   ${fmt(totalGas)} (${fmtM3(totalM3Gas)})`,
      `Total: ${fmt(totalGeral)}`,
      ``,
      `Detalhamento:`,
      ...aptRows.map(a => `  Ap. ${a.num} — Água ${fmt(a.wCost)} | Gás ${fmt(a.gCost)} | Total ${fmt(a.total)}`),
      ``,
      `Gerado automaticamente em ${generatedAt}.`,
    ].join('\n')

    // ── Envia via Nodemailer + Gmail ──────────────────────────────────────────
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
      subject: `📊 Relatório ${monthName}/${year} — ${condName}`,
      text,
      html,
    })

    logger.info(`monthlyEmailReport: enviado para ${toEmail} — ${monthName}/${year}`)
  }
)
