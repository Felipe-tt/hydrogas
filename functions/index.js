/**
 * HidroGás — Firebase Cloud Functions
 *
 * adminLogin              → Login do síndico com Argon2id + Custom Token
 * hashApartmentPassword   → Gera hash Argon2id da senha do apartamento (autenticado)
 * resetApartmentRateLimit → Reseta rate limit de um apartamento (autenticado)
 * getPublicApartment      → Dados do apartamento para o morador (valida hash no servidor)
 * monthlyBackup           → Snapshot do RTDB no Storage (todo dia 1 às 03h)
 * monthlyEmailReport      → Relatório de consumo por e-mail (dia configurável em /config/reportDay)
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
  return `R$&nbsp;${value.toFixed(2).replace('.', ',')}`
}

function formatBRLPlain(value) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

function formatM3(value) {
  return `${value.toFixed(1).replace('.', ',')}&nbsp;m³`
}

function formatM3Plain(value) {
  return `${value.toFixed(1).replace('.', ',')} m³`
}

function pct(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 100)
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

/**
 * Renders a single apartment row.
 * GMAIL-SAFE: no font-family on td/th (causes vertical text), no white-space:nowrap on td.
 * Each cell uses a nested <span> for color/font so Gmail doesn't inherit weirdly.
 */
function buildApartmentRow(apt, index, maxTotal) {
  const bg     = index % 2 === 0 ? '#ffffff' : '#f8fafc'
  const isTop  = index === 0
  const dot    = isTop ? '#f59e0b' : '#94a3b8'
  const badge  = isTop
    ? ` <span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;padding:2px 7px;border-radius:20px;margin-left:4px;">MAIOR</span>`
    : ''

  // spark bar widths (capped at 56px)
  const barW = maxTotal > 0 ? Math.max(4, Math.round((apt.total / maxTotal) * 56)) : 4
  const wPct = apt.total > 0 ? Math.round((apt.wCost / apt.total) * 100) : 50
  const gPct = 100 - wPct

  const td = `padding:10px 12px;border-bottom:1px solid #eef2f7;vertical-align:middle;`

  return `
  <tr style="background:${bg};">
    <td style="${td}">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:6px;vertical-align:middle;">
          <div style="width:7px;height:7px;border-radius:50%;background:${dot};"></div>
        </td>
        <td style="vertical-align:middle;">
          <span style="font-size:13px;font-weight:700;color:#0f172a;">Ap.&nbsp;${apt.num}</span>${badge}
        </td>
      </tr></table>
    </td>
    <td style="${td}"><span style="font-size:12px;color:#1d4ed8;">${formatM3(apt.wM3)}</span></td>
    <td style="${td}"><span style="font-size:12px;color:#b45309;">${formatM3(apt.gM3)}</span></td>
    <td style="${td}"><span style="font-size:12px;color:#1d4ed8;">${formatBRL(apt.wCost)}</span></td>
    <td style="${td}"><span style="font-size:12px;color:#b45309;">${formatBRL(apt.gCost)}</span></td>
    <td style="${td}">
      <span style="font-size:13px;font-weight:800;color:#0f172a;">${formatBRL(apt.total)}</span>
      <table cellpadding="0" cellspacing="0" style="margin-top:5px;">
        <tr>
          <td style="background:#3b82f6;height:4px;width:${Math.round(wPct * barW / 100)}px;border-radius:2px 0 0 2px;font-size:0;line-height:0;">&nbsp;</td>
          <td style="background:#f97316;height:4px;width:${Math.round(gPct * barW / 100)}px;border-radius:0 2px 2px 0;font-size:0;line-height:0;">&nbsp;</td>
          <td style="background:#e2e8f0;height:4px;width:${56 - barW}px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>`
}

/**
 * Builds the bar chart. Uses nested tables (not divs) for Outlook/Gmail compat.
 * Bars are rendered as stacked <td> cells with explicit heights.
 */
function buildBarChart(aptRows) {
  if (!aptRows.length) return ''

  const maxTotal   = Math.max(...aptRows.map(r => r.total))
  const BAR_HEIGHT = 56

  const bars = aptRows.map((apt) => {
    const totalH = maxTotal > 0 ? Math.max(4, Math.round((apt.total / maxTotal) * BAR_HEIGHT)) : 4
    const wH     = apt.total > 0 ? Math.max(2, Math.round((apt.wCost / apt.total) * totalH)) : Math.floor(totalH / 2)
    const gH     = Math.max(0, totalH - wH)
    const spacer = BAR_HEIGHT - totalH
    const label  = String(apt.num).slice(0, 4)

    return `
      <td align="center" valign="bottom" style="padding:0 4px;vertical-align:bottom;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr><td style="height:${spacer}px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#3b82f6;width:16px;height:${wH}px;border-radius:2px 2px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#f97316;width:16px;height:${gH}px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
        <div style="font-size:9px;color:#94a3b8;margin-top:4px;font-weight:600;text-align:center;">${label}</div>
      </td>`
  }).join('')

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
    <tr><td style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.1em;text-transform:uppercase;padding-bottom:14px;">Consumo por apartamento</td></tr>
    <tr>
      <td>
        <table cellpadding="0" cellspacing="0"><tr valign="bottom">${bars}</tr></table>
      </td>
    </tr>
    <tr>
      <td style="padding-top:12px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:4px;"><div style="width:10px;height:10px;background:#3b82f6;border-radius:2px;"></div></td>
          <td style="font-size:11px;color:#64748b;padding-right:16px;">Água</td>
          <td style="padding-right:4px;"><div style="width:10px;height:10px;background:#f97316;border-radius:2px;"></div></td>
          <td style="font-size:11px;color:#64748b;">Gás</td>
        </tr></table>
      </td>
    </tr>
  </table>`
}

/**
 * Builds the full HTML email.
 * Designed to render correctly in Gmail, Outlook 2016+, Apple Mail, and mobile clients.
 *
 * Sections:
 *  1. Preheader (hidden preview text)
 *  2. Hero header  — dark brand band with logo wordmark + period badge
 *  3. Meta strip   — síndico · período · unidades · gerado em
 *  4. Intro text
 *  5. KPI cards    — Água / Gás / Total  (3-column)
 *  6. Bar chart    — per-apartment consumption (table-based)
 *  7. Detail table — full breakdown with mini spark bars
 *  8. Totals row
 *  9. Insight strip — maior / menor / média
 * 10. Footer
 */
function buildEmailHtml({
  condName,
  managerName,
  monthName,
  year,
  generatedAt,
  totals,
  aptRows,
}) {
  const { agua, gas, geral, m3Agua, m3Gas, numApts } = totals

  // ── Derived stats ──────────────────────────────────────────────────────────
  const avgPerApt    = numApts > 0 ? geral / numApts : 0
  const maxApt       = aptRows.length > 0 ? aptRows[0] : null
  const minApt       = aptRows.length > 0 ? aptRows[aptRows.length - 1] : null
  const aguaPct      = geral > 0 ? Math.round((agua / geral) * 100) : 0
  const gasPct       = 100 - aguaPct

  // ── Apartment rows ─────────────────────────────────────────────────────────
  const maxTotal     = aptRows.length > 0 ? aptRows[0].total : 0
  const aptRowsHtml  = aptRows.length > 0
    ? aptRows.map((apt, i) => buildApartmentRow(apt, i, maxTotal)).join('')
    : null

  // ── Bar chart ──────────────────────────────────────────────────────────────
  const barChart = buildBarChart(aptRows)

  // ── Progress bar for água/gás split ───────────────────────────────────────
  const splitBar = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
      <tr>
        <td style="height:6px;background:#3b82f6;width:${aguaPct}%;border-radius:3px 0 0 3px;"></td>
        <td style="height:6px;background:#f97316;width:${gasPct}%;border-radius:0 3px 3px 0;"></td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:10px;color:#3b82f6;font-weight:700;">${aguaPct}% água</td>
        <td align="right" style="font-size:10px;color:#f97316;font-weight:700;">${gasPct}% gás</td>
      </tr>
    </table>`

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--<![endif]-->
  <title>Relatório ${monthName}/${year} — ${condName}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    /* Reset */
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    body { margin:0!important; padding:0!important; width:100%!important; }

    /* Responsive */
    @media screen and (max-width:620px) {
      .email-container { width:100%!important; }
      .fluid { width:100%!important; max-width:100%!important; height:auto!important; }
      .kpi-td { display:block!important; width:100%!important; padding:6px 0!important; }
      .stack-column, .stack-column-center { display:block!important; width:100%!important; max-width:100%!important; direction:ltr!important; }
      .hero-pad { padding:28px 20px!important; }
      .body-pad { padding:24px 20px!important; }
      .meta-pad { padding:14px 20px!important; }
      .footer-pad { padding:16px 20px!important; }
      .hide-mobile { display:none!important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;word-break:break-word;">

  <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td><![endif]-->

  <!-- ════════════════════════════════════════════════════════════════════
       PREHEADER — hidden preview text (up to ~140 chars)
       ════════════════════════════════════════════════════════════════════ -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;font-family:sans-serif;">
    ${condName} · Relatório de consumo ${monthName}/${year} · Total ${formatBRLPlain(geral)} · ${numApts} apartamentos · Água ${formatBRLPlain(agua)} · Gás ${formatBRLPlain(gas)}
    &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <!-- OUTER WRAPPER -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2f7;">
    <tr>
      <td align="center" style="padding:32px 12px 40px;">

        <!-- EMAIL CONTAINER (600px) -->
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;margin:0 auto;">


          <!-- ══════════════════════════════════════════════════════════════
               SECTION 1 · HERO HEADER
               Dark background, wordmark left, month badge right, accent bar bottom
               ══════════════════════════════════════════════════════════════ -->
          <tr>
            <td class="hero-pad" style="background:#0b1120;border-radius:16px 16px 0 0;padding:36px 44px 30px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <!-- Logo + wordmark -->
                  <td valign="middle">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <!-- Icon box -->
                        <td valign="middle" style="padding-right:14px;">
                          <div style="width:42px;height:42px;background:linear-gradient(135deg,#1e40af 0%,#0ea5e9 100%);border-radius:10px;text-align:center;line-height:42px;font-size:20px;">
                            💧
                          </div>
                        </td>
                        <!-- Text -->
                        <td valign="middle">
                          <div style="font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-0.03em;line-height:1;">HidroGás</div>
                          <div style="font-size:10px;color:#475569;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;margin-top:3px;">Gestão de Consumo</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Month / Year badge -->
                  <td align="right" valign="middle">
                    <div style="display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px 16px;text-align:center;">
                      <div style="font-size:10px;color:#64748b;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Referência</div>
                      <div style="font-size:15px;color:#e2e8f0;font-weight:800;margin-top:2px;letter-spacing:-0.02em;">${monthName}&nbsp;${year}</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Big title row -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px;">
                <tr>
                  <td>
                    <div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:8px;">Relatório Mensal de Consumo</div>
                    <div style="font-size:38px;font-weight:900;color:#f1f5f9;letter-spacing:-0.04em;line-height:1.05;">
                      ${monthName}&nbsp;<span style="color:#38bdf8;">${year}</span>
                    </div>
                    <div style="font-size:14px;color:#64748b;margin-top:8px;font-weight:500;">${condName}</div>
                  </td>
                </tr>
              </table>

              <!-- Accent rule -->
              <div style="height:1px;background:linear-gradient(90deg,#1e40af 0%,#38bdf8 40%,#f97316 70%,transparent 100%);margin-top:28px;border-radius:1px;"></div>
            </td>
          </tr>


          <!-- ══════════════════════════════════════════════════════════════
               SECTION 2 · META STRIP
               Síndico · Período · Apartamentos · Gerado em
               ══════════════════════════════════════════════════════════════ -->
          <tr>
            <td class="meta-pad" style="background:#0f172a;padding:0 44px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding:14px 0;border-top:1px solid #1e293b;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <!-- Síndico -->
                        <td style="padding-right:16px;">
                          <div style="font-size:9px;font-weight:700;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px;">Síndico</div>
                          <div style="font-size:12px;color:#cbd5e1;font-weight:600;">${managerName}</div>
                        </td>
                        <!-- Período -->
                        <td style="padding-right:16px;">
                          <div style="font-size:9px;font-weight:700;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px;">Período</div>
                          <div style="font-size:12px;color:#cbd5e1;font-weight:600;">01–último/${monthName}</div>
                        </td>
                        <!-- Aptos -->
                        <td style="padding-right:16px;">
                          <div style="font-size:9px;font-weight:700;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px;">Apartamentos</div>
                          <div style="font-size:12px;color:#cbd5e1;font-weight:600;">${numApts}&nbsp;unidade${numApts !== 1 ? 's' : ''}</div>
                        </td>
                        <!-- Gerado -->
                        <td align="right">
                          <div style="font-size:9px;font-weight:700;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px;">Gerado em</div>
                          <div style="font-size:12px;color:#cbd5e1;font-weight:600;">${generatedAt}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>


          <!-- ══════════════════════════════════════════════════════════════
               SECTION 3 · INTRO TEXT
               ══════════════════════════════════════════════════════════════ -->
          <tr>
            <td class="body-pad" style="background:#ffffff;padding:36px 44px 0;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <p style="margin:0 0 0;font-size:15px;color:#334155;line-height:1.75;">
                Olá, <strong style="color:#0f172a;">${managerName}</strong>. Segue o relatório de consumo de água e gás referente a
                <strong style="color:#0f172a;">${monthName}&nbsp;de&nbsp;${year}</strong>.
                Todas as leituras abaixo foram encerradas e validadas pelo sistema.
                Em caso de dúvidas, consulte diretamente o painel administrativo.
              </p>
            </td>
          </tr>


          <!-- ══════════════════════════════════════════════════════════════
               SECTION 4 · KPI CARDS  (Água · Gás · Total)
               ══════════════════════════════════════════════════════════════ -->
          <tr>
            <td class="body-pad" style="background:#ffffff;padding:28px 44px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

              <!-- Section heading -->
              <div style="font-size:9px;font-weight:800;color:#94a3b8;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:16px;">
                Resumo do período
              </div>

              <!-- KPI 3-column -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>

                  <!-- KPI: ÁGUA -->
                  <td class="kpi-td" valign="top" width="33%" style="padding-right:8px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px 16px 16px;text-align:center;">
                          <!-- Icon row -->
                          <div style="width:36px;height:36px;background:#dbeafe;border-radius:50%;margin:0 auto 10px;text-align:center;line-height:36px;font-size:16px;">💧</div>
                          <div style="font-size:9px;font-weight:800;color:#1e40af;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px;">Água</div>
                          <div style="font-size:22px;font-weight:900;color:#1e40af;letter-spacing:-0.04em;line-height:1;font-family:'Courier New',Courier,monospace;">${formatBRL(agua)}</div>
                          <div style="font-size:11px;color:#60a5fa;margin-top:6px;font-family:'Courier New',Courier,monospace;">${formatM3(m3Agua)}&nbsp;consumidos</div>
                          <div style="font-size:10px;color:#93c5fd;margin-top:3px;">Tarifa R$&nbsp;0,00/m³</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- KPI: GÁS -->
                  <td class="kpi-td" valign="top" width="33%" style="padding-right:8px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:18px 16px 16px;text-align:center;">
                          <div style="width:36px;height:36px;background:#ffedd5;border-radius:50%;margin:0 auto 10px;text-align:center;line-height:36px;font-size:16px;">🔥</div>
                          <div style="font-size:9px;font-weight:800;color:#c2410c;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px;">Gás</div>
                          <div style="font-size:22px;font-weight:900;color:#c2410c;letter-spacing:-0.04em;line-height:1;font-family:'Courier New',Courier,monospace;">${formatBRL(gas)}</div>
                          <div style="font-size:11px;color:#fb923c;margin-top:6px;font-family:'Courier New',Courier,monospace;">${formatM3(m3Gas)}&nbsp;consumidos</div>
                          <div style="font-size:10px;color:#fdba74;margin-top:3px;">Tarifa R$&nbsp;0,00/m³</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- KPI: TOTAL -->
                  <td class="kpi-td" valign="top" width="33%">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:18px 16px 16px;text-align:center;">
                          <div style="width:36px;height:36px;background:#1e293b;border-radius:50%;margin:0 auto 10px;text-align:center;line-height:36px;font-size:16px;">💰</div>
                          <div style="font-size:9px;font-weight:800;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px;">Total</div>
                          <div style="font-size:22px;font-weight:900;color:#f1f5f9;letter-spacing:-0.04em;line-height:1;font-family:'Courier New',Courier,monospace;">${formatBRL(geral)}</div>
                          <div style="font-size:11px;color:#64748b;margin-top:6px;">${numApts}&nbsp;apto${numApts !== 1 ? 's' : ''}&nbsp;em&nbsp;total</div>
                          <div style="font-size:10px;color:#475569;margin-top:3px;">Média por unidade&nbsp;${formatBRL(avgPerApt)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                </tr>
              </table>

              <!-- Split progress bar -->
              <div style="margin-top:20px;">
                ${splitBar}
              </div>

            </td>
          </tr>


          <!-- ══════════════════════════════════════════════════════════════
               SECTION 5 · BAR CHART  (per-apartment visual)
               ══════════════════════════════════════════════════════════════ -->
          ${aptRows.length > 0 ? `
          <tr>
            <td class="body-pad" style="background:#ffffff;padding:0 44px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <!-- Divider -->
              <div style="height:1px;background:#f1f5f9;margin-bottom:24px;"></div>
              ${barChart}
            </td>
          </tr>` : ''}


          <!-- ══════════════════════════════════════════════════════════════
               SECTION 6 · DETAIL TABLE
               ══════════════════════════════════════════════════════════════ -->
          <tr>
            <td class="body-pad" style="background:#ffffff;padding:0 44px 36px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

              <!-- Section heading -->
              <div style="font-size:9px;font-weight:800;color:#94a3b8;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:14px;">
                Detalhamento por apartamento
              </div>

              ${aptRowsHtml ? `
              <!-- Table border wrapper -->
              <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <!-- Header -->
                  <thead>
                    <tr style="background:#f8fafc;">
                      <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:800;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Apto</th>
                      <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:800;color:#1d4ed8;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Água m³</th>
                      <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:800;color:#b45309;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Gás m³</th>
                      <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:800;color:#1d4ed8;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">R$ Água</th>
                      <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:800;color:#b45309;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">R$ Gás</th>
                      <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:800;color:#0f172a;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Total</th>
                    </tr>
                  </thead>
                  <!-- Body rows -->
                  <tbody>
                    ${aptRowsHtml}
                    <!-- TOTALS ROW -->
                    <tr style="background:#0f172a;">
                      <td style="padding:12px 12px;border-top:2px solid #1e293b;"><span style="font-size:11px;font-weight:800;color:#f1f5f9;letter-spacing:0.05em;text-transform:uppercase;">Total</span></td>
                      <td style="padding:12px 12px;border-top:2px solid #1e293b;"><span style="font-size:12px;font-weight:700;color:#93c5fd;">${formatM3(m3Agua)}</span></td>
                      <td style="padding:12px 12px;border-top:2px solid #1e293b;"><span style="font-size:12px;font-weight:700;color:#fdba74;">${formatM3(m3Gas)}</span></td>
                      <td style="padding:12px 12px;border-top:2px solid #1e293b;"><span style="font-size:12px;font-weight:700;color:#93c5fd;">${formatBRL(agua)}</span></td>
                      <td style="padding:12px 12px;border-top:2px solid #1e293b;"><span style="font-size:12px;font-weight:700;color:#fdba74;">${formatBRL(gas)}</span></td>
                      <td style="padding:12px 12px;border-top:2px solid #1e293b;"><span style="font-size:14px;font-weight:900;color:#f1f5f9;">${formatBRL(geral)}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>` : `
              <!-- Empty state -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="text-align:center;padding:48px 24px;background:#f8fafc;border-radius:10px;border:1px dashed #cbd5e1;">
                    <div style="font-size:36px;margin-bottom:12px;">📭</div>
                    <div style="font-size:14px;color:#94a3b8;font-weight:500;">Nenhuma leitura fechada em ${monthName}/${year}.</div>
                    <div style="font-size:12px;color:#cbd5e1;margin-top:6px;">As leituras aparecerão aqui quando forem encerradas.</div>
                  </td>
                </tr>
              </table>`}

            </td>
          </tr>


          <!-- ══════════════════════════════════════════════════════════════
               SECTION 7 · INSIGHT STRIP  (maior · menor · média)
               ══════════════════════════════════════════════════════════════ -->
          ${(maxApt && minApt) ? `
          <tr>
            <td style="background:#f8fafc;padding:0 44px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <div style="height:1px;background:#e2e8f0;"></div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:20px 0;">
                <tr>
                  <td style="padding:0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <!-- Maior consumidor -->
                        <td width="33%" style="padding-right:8px;">
                          <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;">
                            <div style="font-size:9px;font-weight:800;color:#92400e;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Maior consumidor</div>
                            <div style="font-size:13px;font-weight:800;color:#78350f;">Ap.&nbsp;${maxApt.num}</div>
                            <div style="font-size:11px;color:#b45309;margin-top:2px;">${formatBRL(maxApt.total)}</div>
                          </div>
                        </td>
                        <!-- Menor consumidor -->
                        <td width="33%" style="padding-right:8px;">
                          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;">
                            <div style="font-size:9px;font-weight:800;color:#14532d;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Menor consumidor</div>
                            <div style="font-size:13px;font-weight:800;color:#15803d;">Ap.&nbsp;${minApt.num}</div>
                            <div style="font-size:11px;color:#16a34a;margin-top:2px;">${formatBRL(minApt.total)}</div>
                          </div>
                        </td>
                        <!-- Média por unidade -->
                        <td width="33%">
                          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 14px;">
                            <div style="font-size:9px;font-weight:800;color:#0c4a6e;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Média por unidade</div>
                            <div style="font-size:13px;font-weight:800;color:#0369a1;">${formatBRL(avgPerApt)}</div>
                            <div style="font-size:10px;color:#7dd3fc;margin-top:2px;">${numApts}&nbsp;aptos&nbsp;no&nbsp;total</div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}


          <!-- ══════════════════════════════════════════════════════════════
               SECTION 8 · FOOTER
               ══════════════════════════════════════════════════════════════ -->
          <tr>
            <td class="footer-pad" style="background:#0b1120;border-radius:0 0 16px 16px;padding:24px 44px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <!-- Left: system info -->
                  <td valign="middle">
                    <!-- Logo small -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
                      <tr>
                        <td style="padding-right:8px;">
                          <div style="width:28px;height:28px;background:linear-gradient(135deg,#1e40af 0%,#0ea5e9 100%);border-radius:6px;text-align:center;line-height:28px;font-size:13px;">💧</div>
                        </td>
                        <td valign="middle">
                          <div style="font-size:13px;font-weight:800;color:#e2e8f0;letter-spacing:-0.02em;">HidroGás</div>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0;font-size:11px;color:#475569;line-height:1.7;">
                      Gerado automaticamente em <strong style="color:#64748b;">${generatedAt}</strong>.<br>
                      Este é um e-mail automático — não responda.<br>
                      Painel admin · Suporte
                    </p>
                  </td>

                  <!-- Right: badge -->
                  <td align="right" valign="bottom">
                    <div style="display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 16px;text-align:center;">
                      <div style="font-size:9px;font-weight:700;color:#475569;letter-spacing:0.12em;text-transform:uppercase;">Sistema</div>
                      <div style="font-size:13px;font-weight:900;color:#e2e8f0;letter-spacing:0.05em;margin-top:2px;">HIDROGÁS</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Bottom rule -->
              <div style="height:1px;background:linear-gradient(90deg,#1e40af 0%,#0ea5e9 50%,transparent 100%);margin-top:20px;border-radius:1px;"></div>
              <p style="margin:12px 0 0;font-size:10px;color:#334155;text-align:center;">
                © ${year} HidroGás · Todos os direitos reservados
              </p>
            </td>
          </tr>


        </table>
        <!-- / EMAIL CONTAINER -->

      </td>
    </tr>
  </table>
  <!-- / OUTER WRAPPER -->

  <!--[if mso | IE]></td></tr></table><![endif]-->
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

    // ── Texto plano (fallback para clientes sem HTML) ──────────────────────
    const text = [
      `════════════════════════════════════════`,
      `  HidroGás — Relatório ${monthName} ${refYear}`,
      `════════════════════════════════════════`,
      condName,
      '',
      `  Síndico:         ${managerName}`,
      `  Apartamentos:    ${totals.numApts}`,
      `  Água:            ${formatBRLPlain(totals.agua)} (${formatM3Plain(totals.m3Agua)})`,
      `  Gás:             ${formatBRLPlain(totals.gas)} (${formatM3Plain(totals.m3Gas)})`,
      `  TOTAL GERAL:     ${formatBRLPlain(totals.geral)}`,
      '',
      `────────────────────────────────────────`,
      `  DETALHAMENTO POR APARTAMENTO`,
      `────────────────────────────────────────`,
      ...aptRows.map((a, i) =>
        `  ${i === 0 ? '★' : ' '} Ap. ${String(a.num).padEnd(5)} ` +
        `Água ${formatBRLPlain(a.wCost).padStart(10)} | ` +
        `Gás ${formatBRLPlain(a.gCost).padStart(10)} | ` +
        `Total ${formatBRLPlain(a.total).padStart(10)}`
      ),
      '',
      `════════════════════════════════════════`,
      `  Gerado automaticamente em ${generatedAt}.`,
      `  Este é um e-mail automático — não responda.`,
      `════════════════════════════════════════`,
    ].join('\n')

    // ── HTML ──────────────────────────────────────────────────────────────
    const html = buildEmailHtml({
      condName,
      managerName,
      monthName,
      year: refYear,
      generatedAt,
      totals,
      aptRows,
    })

    // ── Envio ─────────────────────────────────────────────────────────────
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
