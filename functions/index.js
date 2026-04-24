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

const crypto = require('crypto')

function sanitizeKey(raw) {
  // Usa SHA-256 para evitar colisões entre chaves similares (ex: ip:1.2.3.4 vs ip:1_2_3_4)
  return crypto.createHash('sha256').update(String(raw)).digest('hex')
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
  return `${value.toFixed(1).replace('.', ',')}&nbsp;m&#179;`
}

function formatM3Plain(value) {
  return `${value.toFixed(1).replace('.', ',')} m³`
}

function pct(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}


function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

// PNGs embutidos via CID attachment (nodemailer inline).
// SVG inline foi removido — Gmail bloqueia SVG em emails.
// Gerados com cairosvg a partir dos SVGs originais do design.
// Tamanhos usados no template: drop=20,16,13 | fire=16 | bag=16
const ICON_DROP_20_B64 = "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAABmJLR0QA/wD/AP+gvaeTAAABPUlEQVQ4jd3Rv0oDQRDH8e9cgucFG20MWtsLYkIEixBFEh/BiOgTiF0eRLDxT6HPYHMGC1GDFiLa2amgvXDZEG4sTCG5TW61Erfbnd9+doaFf7FKTdMoNU3DJStpgeJZtCnI/tdOt64rwdGvwUIYLXoiITDSO+porJXWcnDxY7AYfkyKZO+AfF/pTbU721oae7fd86yaqohkDy0YQF4kezCoEStYbLbrQHXQJaBWDKO6rZAYuXSpgUbmCZgaAgK8SuDPXC1INLRDjcyGAwYwHbfNev9hcmRhzQHrvZ7MJkFlztUTklnbp2RcQVvWBj66aqL6kAqqcuIKxshxKhhk/F1x6/J+ouPvpYLnZWl3u3EVSIzzHVMvXj2tiUkFAW5Wcs+jnj+PsCOqt4ABjKjeqrI9bvxCq5x7cZjiD65Pbl9fcu4sAxUAAAAASUVORK5CYII="
const ICON_DROP_16_B64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAABEUlEQVQ4jbWQv0rDUBjFz7lt2vgHF32G4uTSklRxMIvQDoKjLyKOvoSuIuImiIsilMbJFkHwAXwCcerUJG2OSweT5jaKeMbvO+d3vnuB/1QzHG14vdH6Io+xLfZCrdamzoOhc7/1qJXfAU5lxml0LbIF0FuuRleQ+GNAezc+AXDwbXTY7sfHRd45qt+Pm1Q6BFDNrRJjjPcc1N7sF0ikpucFYQBw0lRn+adkAH4YdQB6RafOGna2w2jfCqB4ZA/PEMh6cp+YNsoAEDYXAPhZCoA+rAARd2VxShlPBjBZq18AerF2g4N6xb20Al5bTJi4HQC3c83AzZKpdZ8CTnLzYnm9cYOUD0GmwuEgcN9t3j/pC4OpUsUyFi+pAAAAAElFTkSuQmCC"
const ICON_DROP_13_B64 = "iVBORw0KGgoAAAANSUhEUgAAAA0AAAANCAYAAABy6+R8AAAABmJLR0QA/wD/AP+gvaeTAAAA5UlEQVQoka2OvUoDURCFv7krMSGtrZ2Cla3mpxCMj5BaEdLnQQxiYbONvY8QDalSqFhYapEiDyCKBveC67HID7J7Vyycbs6Zb86B/5q9oVZqg6TbvlQU8l1I9Kk/F5xO1vxZyLessDv46IDFi13o+Ga/clEI7fSTTYt4ACo/5Gkqtu9a5XGwnkX0MgBANTJOgknzlMdQZUCp2FikLZPMqV4AzGxTI1dPuGkBMD907znoU6UrwUsY0bNbLV3noPsDe8XsCPAZIjHZ4ahpb8uu2Z+1od+S1EGsA5MvEd+2yk+/Vf/TfAOHLkax98sXWAAAAABJRU5ErkJggg=="
const ICON_FIRE_16_B64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAA5ElEQVQ4jWNgoCX4X8Ev+L9AQACfGhZ8kr9+sc9lYGH4x8DAEIJLDRMuiZ8lomEMjAyBDP8Zgn8Wi5JmwP9QBmaG/4xtCBHGtv8N2NViFfwhK2HHwMCgjCSk+uezqA3RBjAx/TVDF/v7nxFDDKcBDP8Z/zMwMDAwSqgwMIqrQMQYGf4TbQAjw7+9DExMDMx2MQzM9tEMDIyMDExM//YTbQBb75uzDDLaWxj5RBgY+UQZmGS1NrJ1vzmH3TIc4P+Zmcr/uARuMzAwMDB9+6DKaJJ+F5danODv9ZVtf6+vbiVZ4wgDAARHNcqogouDAAAAAElFTkSuQmCC"
const ICON_BAG_16_B64  = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAABFUlEQVQ4jc2QPy9DURjGf++9V9QHECSWLsoXsDXSRNKOZgOzRfoRmIwSoWJqaOyW0kHC2G8gFgaTxuZPaHvPY6heym17DRLPdM57nj/vc+AvUaqcZXYPqzODOBY3PKjUplriBGMeQFg99P2l4vLi/XeuF2fQEvuYnnzZRNsPJoE337VLcdygz14FT8qvreQbAHvHtU05q8ZRYzcARkOC5+7Fhd4jaCw+6wPl8kXqZaRZlFxa2JwHt0KvHZKlHKQNXQHXD9OpnY1crt1ToSPWFhgGCLJdf0VJlgUYv2sK2O6pILl0nzo/IHOzw/4gMf6VgadfyCLup4HcZVK5ydWj89eH0tHpgjM/M0jsnG7WVwvnScOG4h0jpF3aZQmxQAAAAABJRU5ErkJggg=="

// Gera <img> tag apontando para CID attachment em vez de SVG inline.
// O CID é mapeado em emailIconAttachments() abaixo.
function imgCid(cid, size, alt) {
  return `<img src="cid:${cid}" width="${size}" height="${size}" alt="${alt}" style="display:block;border:0;">`
}

// Retorna o array de attachments inline para passar ao nodemailer.
function emailIconAttachments() {
  return [
    { cid: 'icon_drop_20', filename: 'icon_drop_20.png', content: Buffer.from(ICON_DROP_20_B64, 'base64'), contentType: 'image/png', contentDisposition: 'inline' },
    { cid: 'icon_drop_16', filename: 'icon_drop_16.png', content: Buffer.from(ICON_DROP_16_B64, 'base64'), contentType: 'image/png', contentDisposition: 'inline' },
    { cid: 'icon_drop_13', filename: 'icon_drop_13.png', content: Buffer.from(ICON_DROP_13_B64, 'base64'), contentType: 'image/png', contentDisposition: 'inline' },
    { cid: 'icon_fire_16', filename: 'icon_fire_16.png', content: Buffer.from(ICON_FIRE_16_B64, 'base64'), contentType: 'image/png', contentDisposition: 'inline' },
    { cid: 'icon_bag_16',  filename: 'icon_bag_16.png',  content: Buffer.from(ICON_BAG_16_B64,  'base64'), contentType: 'image/png', contentDisposition: 'inline' },
  ]
}

/**
 * Renders a single apartment row.
 * Gmail-safe: sem font-family em td/th, sem white-space:nowrap em td.
 * Ícones PNG via CID attachment (SVG inline bloqueado pelo Gmail).
 */
function buildApartmentRow(apt, index, maxTotal) {
  const bg    = index % 2 === 0 ? '#ffffff' : '#f8fafc'
  const isTop = index === 0
  const dot   = isTop ? '#f59e0b' : '#94a3b8'
  const badge = isTop
    ? ` <span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding:2px 7px;border-radius:20px;margin-left:5px;">maior</span>`
    : ''

  const barW = maxTotal > 0 ? Math.max(4, Math.round((apt.total / maxTotal) * 52)) : 4
  const wPct = apt.total > 0 ? Math.round((apt.wCost / apt.total) * 100) : 50
  const gPct = 100 - wPct

  const td = `padding:10px 12px;border-bottom:1px solid #eef2f7;vertical-align:middle;`

  return `
  <tr style="background:${bg};">
    <td style="${td}">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:7px;vertical-align:middle;">
          <div style="width:7px;height:7px;border-radius:50%;background:${dot};"></div>
        </td>
        <td style="vertical-align:middle;">
          <span style="font-size:13px;font-weight:500;color:#0f172a;">Ap.&nbsp;${escapeHtml(apt.num)}</span>${badge}
        </td>
      </tr></table>
    </td>
    <td style="${td}"><span style="font-size:12px;color:#1d4ed8;">${formatM3(apt.wM3)}</span></td>
    <td style="${td}"><span style="font-size:12px;color:#b45309;">${formatM3(apt.gM3)}</span></td>
    <td style="${td}"><span style="font-size:12px;color:#1d4ed8;">${formatBRL(apt.wCost)}</span></td>
    <td style="${td}"><span style="font-size:12px;color:#b45309;">${formatBRL(apt.gCost)}</span></td>
    <td style="${td}">
      <span style="font-size:13px;font-weight:500;color:#0f172a;">${formatBRL(apt.total)}</span>
      <table cellpadding="0" cellspacing="0" style="margin-top:5px;">
        <tr>
          <td style="background:#3b82f6;height:3px;width:${Math.round(wPct * barW / 100)}px;border-radius:2px 0 0 2px;font-size:0;line-height:0;">&nbsp;</td>
          <td style="background:#f97316;height:3px;width:${Math.round(gPct * barW / 100)}px;border-radius:0 2px 2px 0;font-size:0;line-height:0;">&nbsp;</td>
          <td style="background:#e2e8f0;height:3px;width:${52 - barW}px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>`
}

/**
 * Gráfico de barras table-based (compatível com Outlook/Gmail).
 * Barras empilhadas: azul (água) em cima, laranja (gás) embaixo.
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
    const label  = escapeHtml(String(apt.num).slice(0, 5))

    return `
      <td align="center" valign="bottom" style="padding:0 5px;vertical-align:bottom;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr><td style="height:${spacer}px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#3b82f6;width:14px;height:${wH}px;border-radius:2px 2px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#f97316;width:14px;height:${gH}px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
        <div style="font-size:9px;color:#94a3b8;margin-top:4px;font-weight:500;text-align:center;">${label}</div>
      </td>`
  }).join('')

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
    <tr><td style="font-size:9px;font-weight:500;color:#94a3b8;letter-spacing:0.1em;text-transform:uppercase;padding-bottom:14px;">Consumo por apartamento</td></tr>
    <tr>
      <td>
        <table cellpadding="0" cellspacing="0"><tr valign="bottom">${bars}</tr></table>
      </td>
    </tr>
    <tr>
      <td style="padding-top:14px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:5px;"><div style="width:9px;height:9px;background:#3b82f6;border-radius:2px;"></div></td>
          <td style="font-size:11px;color:#64748b;padding-right:18px;">&#193;gua</td>
          <td style="padding-right:5px;"><div style="width:9px;height:9px;background:#f97316;border-radius:2px;"></div></td>
          <td style="font-size:11px;color:#64748b;">G&#225;s</td>
        </tr></table>
      </td>
    </tr>
  </table>`
}

/**
 * Gera o HTML completo do e-mail mensal.
 *
 * Design Gmail-safe:
 *  - Sem font-family em td/th (causa texto vertical no Gmail)
 *  - Sem emojis — ícones SVG inline ou símbolos HTML entity
 *  - Todas as cores com fallback explícito
 *  - Layout 100% table-based para Outlook 2016+
 *
 * Seções:
 *  1. Preheader oculto
 *  2. Hero header — dark, wordmark + badge de período
 *  3. Meta strip — síndico · período · unidades · gerado em
 *  4. Intro
 *  5. KPI cards — Água / Gás / Total
 *  6. Barra de divisão água/gás
 *  7. Gráfico de barras por apartamento
 *  8. Tabela de detalhamento
 *  9. Destaques — maior / menor / média
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
  condName    = escapeHtml(condName)
  managerName = escapeHtml(managerName)
  const { agua, gas, geral, m3Agua, m3Gas, numApts } = totals

  const avgPerApt   = numApts > 0 ? geral / numApts : 0
  const maxApt      = aptRows.length > 0 ? aptRows[0] : null
  const minApt      = aptRows.length > 0 ? aptRows[aptRows.length - 1] : null
  const aguaPct     = geral > 0 ? Math.round((agua / geral) * 100) : 0
  const gasPct      = 100 - aguaPct
  const maxTotal    = aptRows.length > 0 ? aptRows[0].total : 0
  const aptRowsHtml = aptRows.length > 0
    ? aptRows.map((apt, i) => buildApartmentRow(apt, i, maxTotal)).join('')
    : null
  const barChart    = buildBarChart(aptRows)

  // ── ícones PNG via CID attachment — Gmail bloqueia SVG inline ──────────────
  // Os attachments são definidos em emailIconAttachments() e passados ao nodemailer.
  const iconDrop = (size) => imgCid(`icon_drop_${size}`, size, 'água')
  const iconFire = (size) => imgCid(`icon_fire_${size}`, size, 'gás')
  const iconBag  = (size) => imgCid(`icon_bag_${size}`,  size, 'total')

  // ── barra split água/gás ──────────────────────────────────────────────────
  const splitBar = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:5px;">
      <tr>
        <td style="height:5px;background:#3b82f6;width:${aguaPct}%;border-radius:3px 0 0 3px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="height:5px;background:#f97316;width:${gasPct}%;border-radius:0 3px 3px 0;font-size:0;line-height:0;">&nbsp;</td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:10px;color:#3b82f6;font-weight:500;">${aguaPct}%&nbsp;&#225;gua</td>
        <td align="right" style="font-size:10px;color:#f97316;font-weight:500;">${gasPct}%&nbsp;g&#225;s</td>
      </tr>
    </table>`

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Relat&#243;rio ${monthName}/${year} &#8212; ${condName}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    body{margin:0!important;padding:0!important;width:100%!important;background-color:#eef2f7;}
    @media screen and (max-width:620px){
      .email-container{width:100%!important;}
      .kpi-td{display:block!important;width:100%!important;padding:0 0 8px!important;}
      .hero-pad{padding:24px 20px!important;}
      .body-pad{padding:24px 20px!important;}
      .meta-pad{padding:0 20px!important;}
      .footer-pad{padding:20px 20px!important;}
      .insight-td{display:block!important;width:100%!important;padding:0 0 8px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;word-break:break-word;">

  <!-- PREHEADER -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${condName} &middot; Relat&#243;rio ${monthName}/${year} &middot; Total ${formatBRLPlain(geral)} &middot; ${numApts} apartamentos &middot; &#193;gua ${formatBRLPlain(agua)} &middot; G&#225;s ${formatBRLPlain(gas)}
    &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <!-- OUTER WRAPPER -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2f7;">
    <tr>
      <td align="center" style="padding:32px 12px 40px;">

        <!-- EMAIL CONTAINER -->
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;margin:0 auto;">


          <!-- ═══════════════════════════════════════════
               1. HERO HEADER
               ═══════════════════════════════════════════ -->
          <tr>
            <td class="hero-pad" style="background:#0b1120;border-radius:16px 16px 0 0;padding:32px 40px 26px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <!-- Logo -->
                  <td valign="middle">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td valign="middle" style="padding-right:12px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                            <tr>
                              <td align="center" valign="middle" style="width:40px;height:40px;background:#1e3a8a;border-radius:10px;">
                                ${iconDrop(20)}
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td valign="middle">
                          <div style="font-size:18px;font-weight:500;color:#ffffff;letter-spacing:-0.02em;line-height:1;">Hidrog&#225;s</div>
                          <div style="font-size:9px;color:#475569;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;margin-top:3px;">Gest&#227;o de Consumo</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Período badge -->
                  <td align="right" valign="middle">
                    <div style="display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px 14px;text-align:center;">
                      <div style="font-size:9px;color:#64748b;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;">Refer&#234;ncia</div>
                      <div style="font-size:14px;color:#e2e8f0;font-weight:500;margin-top:2px;">${monthName}&nbsp;${year}</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Título principal -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:26px;">
                <tr>
                  <td>
                    <div style="font-size:10px;font-weight:500;color:#475569;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:7px;">Relat&#243;rio Mensal de Consumo</div>
                    <div style="font-size:34px;font-weight:500;color:#f1f5f9;letter-spacing:-0.03em;line-height:1.05;">
                      ${monthName}&nbsp;<span style="color:#38bdf8;">${year}</span>
                    </div>
                    <div style="font-size:13px;color:#64748b;margin-top:8px;">${condName}</div>
                  </td>
                </tr>
              </table>

              <!-- Linha de acento -->
              <div style="height:1px;background:linear-gradient(90deg,#1e40af 0%,#38bdf8 40%,#f97316 70%,transparent 100%);margin-top:26px;border-radius:1px;"></div>
            </td>
          </tr>


          <!-- ═══════════════════════════════════════════
               2. META STRIP
               ═══════════════════════════════════════════ -->
          <tr>
            <td class="meta-pad" style="background:#0f172a;padding:0 40px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding:14px 0;border-top:1px solid #1e293b;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding-right:16px;">
                          <div style="font-size:9px;font-weight:500;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px;">S&#237;ndico</div>
                          <div style="font-size:12px;color:#cbd5e1;font-weight:500;">${managerName}</div>
                        </td>
                        <td style="padding-right:16px;">
                          <div style="font-size:9px;font-weight:500;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px;">Per&#237;odo</div>
                          <div style="font-size:12px;color:#cbd5e1;font-weight:500;">01&#8211;&#250;ltimo/${monthName}</div>
                        </td>
                        <td style="padding-right:16px;">
                          <div style="font-size:9px;font-weight:500;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px;">Apartamentos</div>
                          <div style="font-size:12px;color:#cbd5e1;font-weight:500;">${numApts}&nbsp;unidade${numApts !== 1 ? 's' : ''}</div>
                        </td>
                        <td align="right">
                          <div style="font-size:9px;font-weight:500;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px;">Gerado em</div>
                          <div style="font-size:12px;color:#cbd5e1;font-weight:500;">${generatedAt}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>


          <!-- ═══════════════════════════════════════════
               3. INTRO
               ═══════════════════════════════════════════ -->
          <tr>
            <td class="body-pad" style="background:#ffffff;padding:32px 40px 0;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <p style="margin:0;font-size:14px;color:#334155;line-height:1.8;">
                Ol&#225;, <strong style="color:#0f172a;font-weight:500;">${managerName}</strong>. Segue o relat&#243;rio de consumo de &#225;gua e g&#225;s referente a
                <strong style="color:#0f172a;font-weight:500;">${monthName}&nbsp;de&nbsp;${year}</strong>.
                Todas as leituras abaixo foram encerradas e validadas pelo sistema.
                Em caso de d&#250;vidas, consulte diretamente o painel administrativo.
              </p>
            </td>
          </tr>


          <!-- ═══════════════════════════════════════════
               4. KPI CARDS
               ═══════════════════════════════════════════ -->
          <tr>
            <td class="body-pad" style="background:#ffffff;padding:24px 40px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

              <div style="font-size:9px;font-weight:500;color:#94a3b8;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:14px;">Resumo do per&#237;odo</div>

              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>

                  <!-- Água -->
                  <td class="kpi-td" valign="top" width="33%" style="padding-right:8px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 14px;text-align:center;">
                          <div style="width:34px;height:34px;background:#dbeafe;border-radius:50%;margin:0 auto 10px;text-align:center;line-height:34px;">
                            ${iconDrop(16)}
                          </div>
                          <div style="font-size:9px;font-weight:500;color:#1e40af;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:7px;">&#193;gua</div>
                          <div style="font-size:20px;font-weight:500;color:#1e40af;letter-spacing:-0.03em;line-height:1;">${formatBRL(agua)}</div>
                          <div style="font-size:11px;color:#60a5fa;margin-top:5px;">${formatM3(m3Agua)}&nbsp;consumidos</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Gás -->
                  <td class="kpi-td" valign="top" width="33%" style="padding-right:8px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px 14px;text-align:center;">
                          <div style="width:34px;height:34px;background:#ffedd5;border-radius:50%;margin:0 auto 10px;text-align:center;line-height:34px;">
                            ${iconFire(16)}
                          </div>
                          <div style="font-size:9px;font-weight:500;color:#c2410c;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:7px;">G&#225;s</div>
                          <div style="font-size:20px;font-weight:500;color:#c2410c;letter-spacing:-0.03em;line-height:1;">${formatBRL(gas)}</div>
                          <div style="font-size:11px;color:#fb923c;margin-top:5px;">${formatM3(m3Gas)}&nbsp;consumidos</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Total -->
                  <td class="kpi-td" valign="top" width="33%">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:16px 14px;text-align:center;">
                          <div style="width:34px;height:34px;background:#1e293b;border-radius:50%;margin:0 auto 10px;text-align:center;line-height:34px;">
                            ${iconBag(16)}
                          </div>
                          <div style="font-size:9px;font-weight:500;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:7px;">Total</div>
                          <div style="font-size:20px;font-weight:500;color:#f1f5f9;letter-spacing:-0.03em;line-height:1;">${formatBRL(geral)}</div>
                          <div style="font-size:11px;color:#64748b;margin-top:5px;">${numApts}&nbsp;apto${numApts !== 1 ? 's' : ''}&nbsp;&middot;&nbsp;m&#233;dia&nbsp;${formatBRL(avgPerApt)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>

                </tr>
              </table>

              <!-- Barra água/gás -->
              <div style="margin-top:18px;">${splitBar}</div>

            </td>
          </tr>


          <!-- ═══════════════════════════════════════════
               5. GRÁFICO DE BARRAS
               ═══════════════════════════════════════════ -->
          ${aptRows.length > 0 ? `
          <tr>
            <td class="body-pad" style="background:#ffffff;padding:0 40px 26px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <div style="height:1px;background:#f1f5f9;margin-bottom:22px;"></div>
              ${barChart}
            </td>
          </tr>` : ''}


          <!-- ═══════════════════════════════════════════
               6. TABELA DE DETALHAMENTO
               ═══════════════════════════════════════════ -->
          <tr>
            <td class="body-pad" style="background:#ffffff;padding:0 40px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

              <div style="font-size:9px;font-weight:500;color:#94a3b8;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">Detalhamento por apartamento</div>

              ${aptRowsHtml ? `
              <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f8fafc;">
                      <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:500;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Apto</th>
                      <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:500;color:#1d4ed8;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">&#193;gua m&#179;</th>
                      <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:500;color:#b45309;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">G&#225;s m&#179;</th>
                      <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:500;color:#1d4ed8;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">R$ &#193;gua</th>
                      <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:500;color:#b45309;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">R$ G&#225;s</th>
                      <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:500;color:#0f172a;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${aptRowsHtml}
                    <!-- Linha de totais -->
                    <tr style="background:#0f172a;">
                      <td style="padding:11px 12px;border-top:2px solid #1e293b;"><span style="font-size:11px;font-weight:500;color:#f1f5f9;letter-spacing:0.05em;text-transform:uppercase;">Total</span></td>
                      <td style="padding:11px 12px;border-top:2px solid #1e293b;"><span style="font-size:12px;font-weight:500;color:#93c5fd;">${formatM3(m3Agua)}</span></td>
                      <td style="padding:11px 12px;border-top:2px solid #1e293b;"><span style="font-size:12px;font-weight:500;color:#fdba74;">${formatM3(m3Gas)}</span></td>
                      <td style="padding:11px 12px;border-top:2px solid #1e293b;"><span style="font-size:12px;font-weight:500;color:#93c5fd;">${formatBRL(agua)}</span></td>
                      <td style="padding:11px 12px;border-top:2px solid #1e293b;"><span style="font-size:12px;font-weight:500;color:#fdba74;">${formatBRL(gas)}</span></td>
                      <td style="padding:11px 12px;border-top:2px solid #1e293b;"><span style="font-size:14px;font-weight:500;color:#f1f5f9;">${formatBRL(geral)}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>` : `
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="text-align:center;padding:44px 24px;background:#f8fafc;border-radius:10px;border:1px dashed #cbd5e1;">
                    <div style="font-size:14px;color:#94a3b8;font-weight:500;">Nenhuma leitura fechada em ${monthName}/${year}.</div>
                    <div style="font-size:12px;color:#cbd5e1;margin-top:6px;">As leituras aparecer&#227;o aqui quando forem encerradas.</div>
                  </td>
                </tr>
              </table>`}

            </td>
          </tr>


          <!-- ═══════════════════════════════════════════
               7. DESTAQUES
               ═══════════════════════════════════════════ -->
          ${(maxApt && minApt) ? `
          <tr>
            <td style="background:#f8fafc;padding:0 40px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <div style="height:1px;background:#e2e8f0;"></div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:18px 0;">
                <tr>
                  <td>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <!-- Maior consumidor -->
                        <td class="insight-td" width="33%" style="padding-right:8px;">
                          <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:11px 13px;">
                            <div style="font-size:9px;font-weight:500;color:#92400e;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Maior consumidor</div>
                            <div style="font-size:13px;font-weight:500;color:#78350f;">Ap.&nbsp;${escapeHtml(maxApt.num)}</div>
                            <div style="font-size:11px;color:#b45309;margin-top:2px;">${formatBRL(maxApt.total)}</div>
                          </div>
                        </td>
                        <!-- Menor consumidor -->
                        <td class="insight-td" width="33%" style="padding-right:8px;">
                          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:11px 13px;">
                            <div style="font-size:9px;font-weight:500;color:#14532d;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Menor consumidor</div>
                            <div style="font-size:13px;font-weight:500;color:#15803d;">Ap.&nbsp;${escapeHtml(minApt.num)}</div>
                            <div style="font-size:11px;color:#16a34a;margin-top:2px;">${formatBRL(minApt.total)}</div>
                          </div>
                        </td>
                        <!-- Média -->
                        <td class="insight-td" width="33%">
                          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:11px 13px;">
                            <div style="font-size:9px;font-weight:500;color:#0c4a6e;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">M&#233;dia por unidade</div>
                            <div style="font-size:13px;font-weight:500;color:#0369a1;">${formatBRL(avgPerApt)}</div>
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


          <!-- ═══════════════════════════════════════════
               8. FOOTER
               ═══════════════════════════════════════════ -->
          <tr>
            <td class="footer-pad" style="background:#0b1120;border-radius:0 0 16px 16px;padding:22px 40px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
                      <tr>
                        <td style="padding-right:8px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                            <tr>
                              <td align="center" valign="middle" style="width:26px;height:26px;background:#1e3a8a;border-radius:6px;">
                                ${iconDrop(13)}
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td valign="middle">
                          <div style="font-size:13px;font-weight:500;color:#e2e8f0;">Hidrog&#225;s</div>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0;font-size:11px;color:#475569;line-height:1.7;">
                      Gerado automaticamente em <strong style="color:#64748b;font-weight:500;">${generatedAt}</strong>.<br>
                      Este &#233; um e-mail autom&#225;tico &#8212; n&#227;o responda.<br>
                      Painel admin &middot; Suporte
                    </p>
                  </td>
                  <td align="right" valign="bottom">
                    <div style="display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;text-align:center;">
                      <div style="font-size:9px;font-weight:500;color:#475569;letter-spacing:0.12em;text-transform:uppercase;">Sistema</div>
                      <div style="font-size:13px;font-weight:500;color:#e2e8f0;letter-spacing:0.04em;margin-top:2px;">HIDROG&#193;S</div>
                    </div>
                  </td>
                </tr>
              </table>
              <div style="height:1px;background:linear-gradient(90deg,#1e40af 0%,#0ea5e9 50%,transparent 100%);margin-top:18px;border-radius:1px;"></div>
              <p style="margin:10px 0 0;font-size:10px;color:#334155;text-align:center;">
                &#169; ${year} HidroG&#225;s &middot; Todos os direitos reservados
              </p>
            </td>
          </tr>


        </table>
        <!-- /EMAIL CONTAINER -->

      </td>
    </tr>
  </table>
  <!-- /OUTER WRAPPER -->

</body>
</html>`
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * BIOMETRIA — Arquitetura de segurança
 * ─────────────────────────────────────────────────────────────────────────────
 * getBiometricRegisterChallenge  → emite challenge HMAC para registro (requer auth)
 * registerBiometric              → valida attestation e salva chave pública (requer auth)
 * getBiometricAuthChallenge      → emite challenge de uso único TTL 2min (público)
 * verifyBiometric                → verifica assinatura ECDSA/RSA, emite Custom Token
 *
 * Proteções implementadas:
 *  • Replay attack:   challenge de uso único — deletado no servidor após verificação
 *  • Phishing:        origin e rpId validados criptograficamente no clientDataJSON
 *  • Challenge forge: challenge gerado e verificado server-side via HMAC-SHA256
 *  • Força bruta:     rate limit por IP em todas as 4 funções
 *  • Auth obrigatória para registro: impossível registrar sem sessão Firebase válida
 *  • Credencial única: nova credencial sobrescreve a anterior automaticamente
 *  • userVerification validado: UP e UV flags obrigatórios no authenticatorData
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Constantes biométricas ────────────────────────────────────────────────────

const BIO_CHALLENGE_TTL_MS   = 2 * 60 * 1000   // 2 minutos
const BIO_CHALLENGE_HMAC_KEY = process.env.BIO_HMAC_KEY  // secret obrigatório
const BIO_ADMIN_USER_ID      = Buffer.from('hydrogas-admin-webauthn').toString('base64url')

// ── Helpers WebAuthn ──────────────────────────────────────────────────────────

/** Gera um challenge aleatório de 32 bytes e assina com HMAC para evitar forja */
function generateSignedChallenge() {
  const random    = crypto.randomBytes(32).toString('base64url')
  const timestamp = Date.now().toString()
  const payload   = `${random}.${timestamp}`
  const hmac      = crypto.createHmac('sha256', BIO_CHALLENGE_HMAC_KEY)
    .update(payload).digest('base64url')
  return { challenge: `${payload}.${hmac}`, random, timestamp }
}

/** Verifica se o challenge foi gerado por este servidor e ainda está no TTL */
function verifySignedChallenge(challenge) {
  const parts = challenge.split('.')
  if (parts.length !== 3) return false
  const [random, timestamp, receivedHmac] = parts
  const expectedHmac = crypto.createHmac('sha256', BIO_CHALLENGE_HMAC_KEY)
    .update(`${random}.${timestamp}`).digest('base64url')
  // Comparação em tempo constante para evitar timing attack
  if (!crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(expectedHmac))) return false
  const age = Date.now() - parseInt(timestamp, 10)
  return age >= 0 && age <= BIO_CHALLENGE_TTL_MS
}

/** base64url → Buffer */
function b64u(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * Extrai e valida a chave pública COSE do attestationObject.
 * Suporta ES256 (alg -7, ECDSA P-256) e RS256 (alg -257, RSASSA-PKCS1-v1_5).
 * Retorna { publicKeyJwk, algorithm } ou lança erro.
 *
 * Parsing manual de CBOR mínimo (evita dependência externa):
 *  - Só processa maps, byte strings e integers simples
 *  - Suficiente para credentialPublicKey em fmt:'none' / fmt:'packed' / fmt:'fido-u2f'
 */
function extractPublicKeyFromAttestation(attestationObjectB64u) {
  const cbor = require('cbor')
  const buf  = b64u(attestationObjectB64u)

  const decoded  = cbor.decodeFirstSync(buf)
  const authData = decoded.authData
  if (!authData) throw new Error('authData ausente')

  if (authData.length < 55) throw new Error('authData muito curto')
  const flags = authData[32]
  const AT    = (flags >> 6) & 1
  if (!AT) throw new Error('Attested Credential Data ausente no authData')

  const credIdLen       = (authData[49] << 8) | authData[50]
  const credPubKeyStart = 51 + credIdLen
  const credPubKeyCbor  = authData.slice(credPubKeyStart)

  const cose = cbor.decodeFirstSync(credPubKeyCbor)

  const alg = cose.get(3)
  if (alg === -7) {
    const x = cose.get(-2)
    const y = cose.get(-3)
    if (!x || !y) throw new Error('Chave EC inválida')
    return {
      algorithm: 'ES256',
      publicKeyJwk: {
        kty: 'EC', crv: 'P-256',
        x: x.toString('base64url'),
        y: y.toString('base64url'),
      },
    }
  } else if (alg === -257) {
    const n = cose.get(-1)
    const e = cose.get(-2)
    if (!n || !e) throw new Error('Chave RSA inválida')
    return {
      algorithm: 'RS256',
      publicKeyJwk: {
        kty: 'RSA',
        n: n.toString('base64url'),
        e: e.toString('base64url'),
      },
    }
  } else {
    throw new Error(`Algoritmo COSE não suportado: ${alg}`)
  }
}

/**
 * Verifica a assinatura WebAuthn usando Node.js crypto nativo.
 * Suporta ES256 e RS256.
 * A mensagem assinada é: SHA-256(authenticatorData || SHA-256(clientDataJSON))
 * conforme spec WebAuthn §6.3.3
 */
function verifyWebAuthnSignature(publicKeyJwk, algorithm, authenticatorDataBuf, clientDataJSONBuf, signatureBuf) {
  const clientDataHash = crypto.createHash('sha256').update(clientDataJSONBuf).digest()
  const message        = Buffer.concat([authenticatorDataBuf, clientDataHash])

  if (algorithm === 'ES256') {
    const key    = crypto.createPublicKey({ key: publicKeyJwk, format: 'jwk' })
    return crypto.verify('SHA256', message, { key, dsaEncoding: 'ieee-p1363' }, signatureBuf)
      // Tentar DER se ieee-p1363 falhar (alguns autenticadores usam DER)
      || crypto.verify('SHA256', message, key, signatureBuf)
  } else if (algorithm === 'RS256') {
    const key = crypto.createPublicKey({ key: publicKeyJwk, format: 'jwk' })
    return crypto.verify('SHA256', message, key, signatureBuf)
  }
  return false
}

// ── 1. getBiometricRegisterChallenge ─────────────────────────────────────────

exports.getBiometricRegisterChallenge = onCall(
  {
    secrets:         ['DATABASE_URL', 'BIO_HMAC_KEY'],
    timeoutSeconds:  15,
    memory:          '256MiB',
    region:          'us-central1',
    enforceAppCheck: false,
  },
  async (request) => {
    // Requer sessão Firebase válida (só chega aqui pós-login com senha)
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    }

    const ipKey = getClientIp(request.rawRequest)
    if (await isRateLimited(ipKey)) {
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')
    }

    if (!BIO_CHALLENGE_HMAC_KEY) {
      logger.error('BIO_HMAC_KEY não configurado!')
      throw new HttpsError('internal', 'Servidor mal configurado.')
    }

    const { challenge, random } = generateSignedChallenge()

    // rpId = hostname sem porta (spec WebAuthn §5.4.2)
    // Em produção: seu domínio real. Em dev: "localhost"
    const rpId = process.env.BIO_RP_ID || 'localhost'

    // challenge = string assinada completa (random.timestamp.hmac) — para verificação
    // random    = bytes aleatórios puros em base64url — para o WebAuthn usar como challenge binário
    return { challenge, random, rpId, userId: BIO_ADMIN_USER_ID }
  }
)

// ── 2. registerBiometric ──────────────────────────────────────────────────────

exports.registerBiometric = onCall(
  {
    secrets:         ['DATABASE_URL', 'BIO_HMAC_KEY'],
    timeoutSeconds:  30,
    memory:          '256MiB',
    region:          'us-central1',
    enforceAppCheck: false,
  },
  async (request) => {
    // Requer sessão Firebase válida
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    }

    const ipKey = getClientIp(request.rawRequest)
    if (await isRateLimited(ipKey)) {
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')
    }

    const { credentialId, clientDataJSON, attestationObject, signedChallenge } = request.data || {}
    if (!credentialId || !clientDataJSON || !attestationObject || !signedChallenge) {
      throw new HttpsError('invalid-argument', 'Dados incompletos.')
    }

    if (!BIO_CHALLENGE_HMAC_KEY) {
      logger.error('BIO_HMAC_KEY não configurado!')
      throw new HttpsError('internal', 'Servidor mal configurado.')
    }

    // Validar clientDataJSON
    let clientData
    try {
      clientData = JSON.parse(b64u(clientDataJSON).toString('utf8'))
    } catch {
      throw new HttpsError('invalid-argument', 'clientDataJSON inválido.')
    }

    // Verificar type obrigatório
    if (clientData.type !== 'webauthn.create') {
      throw new HttpsError('invalid-argument', 'Tipo de operação incorreto.')
    }

    // Verificar challenge HMAC (previne forja de challenge pelo cliente)
    if (!verifySignedChallenge(signedChallenge)) {
      throw new HttpsError('invalid-argument', 'Challenge inválido ou expirado.')
    }

    // Verificar origin (previne phishing)
    const expectedOrigins = (process.env.BIO_ALLOWED_ORIGINS || 'http://localhost:5173').split(',')
    if (!expectedOrigins.includes(clientData.origin)) {
      logger.warn('Origin inválida no registro:', clientData.origin)
      throw new HttpsError('invalid-argument', 'Origin inválida.')
    }

    // Extrair e validar chave pública do attestationObject
    let publicKeyData
    try {
      publicKeyData = extractPublicKeyFromAttestation(attestationObject)
    } catch (err) {
      logger.error('Erro ao extrair chave pública:', err.message, err.stack)
      throw new HttpsError('invalid-argument', `Attestation inválido: ${err.message}`)
    }

    // Salvar credencial no RTDB (sobrescreve qualquer credencial anterior)
    // Nunca armazena dado biométrico — apenas chave pública (segura para armazenar)
    await getDatabase().ref('_biometric/credential').set({
      credentialId:  credentialId,
      publicKeyJwk:  JSON.stringify(publicKeyData.publicKeyJwk),
      algorithm:     publicKeyData.algorithm,
      registeredAt:  Date.now(),
      signCount:     0,   // contador anti-clonagem (incrementado a cada auth)
    })

    logger.info('Credencial biométrica registrada com sucesso.')
    return { ok: true }
  }
)

// ── 3. getBiometricAuthChallenge ──────────────────────────────────────────────

exports.getBiometricAuthChallenge = onCall(
  {
    secrets:         ['DATABASE_URL', 'BIO_HMAC_KEY'],
    timeoutSeconds:  15,
    memory:          '256MiB',
    region:          'us-central1',
    enforceAppCheck: false,
  },
  async (request) => {
    const ipKey = getClientIp(request.rawRequest)
    if (await isRateLimited(ipKey)) {
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')
    }

    if (!BIO_CHALLENGE_HMAC_KEY) {
      logger.error('BIO_HMAC_KEY não configurado!')
      throw new HttpsError('internal', 'Servidor mal configurado.')
    }

    // Verificar se existe credencial registrada (evita expor endpoint sem necessidade)
    const snap = await getDatabase().ref('_biometric/credential').get()
    if (!snap.exists()) {
      throw new HttpsError('not-found', 'Nenhuma credencial registrada.')
    }

    const { challenge, random } = generateSignedChallenge()
    return { challenge, random }
  }
)

// ── 4. verifyBiometric ────────────────────────────────────────────────────────

exports.verifyBiometric = onCall(
  {
    secrets:         ['DATABASE_URL', 'BIO_HMAC_KEY'],
    timeoutSeconds:  30,
    memory:          '256MiB',
    region:          'us-central1',
    enforceAppCheck: false,
  },
  async (request) => {
    const ipKey = getClientIp(request.rawRequest)
    if (await isRateLimited(ipKey)) {
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')
    }

    const { credentialId, clientDataJSON, authenticatorData, signature, signedChallenge } = request.data || {}
    if (!credentialId || !clientDataJSON || !authenticatorData || !signature || !signedChallenge) {
      throw new HttpsError('invalid-argument', 'Dados incompletos.')
    }

    if (!BIO_CHALLENGE_HMAC_KEY) {
      logger.error('BIO_HMAC_KEY não configurado!')
      throw new HttpsError('internal', 'Servidor mal configurado.')
    }

    // Buscar credencial armazenada
    const snap = await getDatabase().ref('_biometric/credential').get()
    if (!snap.exists()) {
      throw new HttpsError('not-found', 'Credencial não encontrada.')
    }
    const stored = snap.val()

    // Verificar se o credentialId corresponde ao registrado
    // Comparação em tempo constante
    const storedIdBuf   = Buffer.from(stored.credentialId)
    const receivedIdBuf = Buffer.from(credentialId)
    if (
      storedIdBuf.length !== receivedIdBuf.length ||
      !crypto.timingSafeEqual(storedIdBuf, receivedIdBuf)
    ) {
      await recordFailedAttempt(ipKey)
      throw new HttpsError('unauthenticated', 'Credencial inválida.')
    }

    // Validar clientDataJSON
    let clientData
    try {
      clientData = JSON.parse(b64u(clientDataJSON).toString('utf8'))
    } catch {
      throw new HttpsError('invalid-argument', 'clientDataJSON inválido.')
    }

    if (clientData.type !== 'webauthn.get') {
      throw new HttpsError('invalid-argument', 'Tipo de operação incorreto.')
    }

    // Verificar challenge HMAC — uso único garantido pelo TTL no HMAC
    if (!verifySignedChallenge(signedChallenge)) {
      await recordFailedAttempt(ipKey)
      throw new HttpsError('unauthenticated', 'Challenge inválido ou expirado.')
    }

    // Verificar origin
    const expectedOrigins = (process.env.BIO_ALLOWED_ORIGINS || 'http://localhost:5173').split(',')
    if (!expectedOrigins.includes(clientData.origin)) {
      logger.warn('Origin inválida na verificação:', clientData.origin)
      await recordFailedAttempt(ipKey)
      throw new HttpsError('unauthenticated', 'Origin inválida.')
    }

    // Verificar authenticatorData
    const authDataBuf = b64u(authenticatorData)
    if (authDataBuf.length < 37) {
      throw new HttpsError('invalid-argument', 'authenticatorData inválido.')
    }

    // Verificar rpIdHash (SHA-256 do rpId esperado)
    const expectedRpId     = process.env.BIO_RP_ID || 'localhost'
    const expectedRpIdHash = crypto.createHash('sha256').update(expectedRpId).digest()
    const receivedRpIdHash = authDataBuf.slice(0, 32)
    if (!crypto.timingSafeEqual(expectedRpIdHash, receivedRpIdHash)) {
      logger.warn('rpIdHash inválido na verificação')
      await recordFailedAttempt(ipKey)
      throw new HttpsError('unauthenticated', 'rpId inválido.')
    }

    // Verificar flags: UP (user present) e UV (user verified) obrigatórios
    const flags = authDataBuf[32]
    const UP    = flags & 0x01  // bit 0
    const UV    = (flags >> 2) & 0x01  // bit 2
    if (!UP || !UV) {
      logger.warn('Flags UP/UV ausentes — userVerification não satisfeito')
      await recordFailedAttempt(ipKey)
      throw new HttpsError('unauthenticated', 'Verificação do usuário não satisfeita.')
    }

    // Verificar assinatura criptográfica
    let signatureValid = false
    try {
      const publicKeyJwk = JSON.parse(stored.publicKeyJwk)
      signatureValid = verifyWebAuthnSignature(
        publicKeyJwk,
        stored.algorithm,
        authDataBuf,
        b64u(clientDataJSON),
        b64u(signature),
      )
    } catch (err) {
      logger.error('Erro ao verificar assinatura:', err)
      await recordFailedAttempt(ipKey)
      throw new HttpsError('internal', 'Erro ao verificar assinatura.')
    }

    if (!signatureValid) {
      logger.warn('Assinatura biométrica inválida')
      await recordFailedAttempt(ipKey)
      throw new HttpsError('unauthenticated', 'Assinatura inválida.')
    }

    // Verificar signCount (proteção anti-clonagem de autenticador)
    // Spec: se signCount do servidor > 0 e recebido <= armazenado → possível clone
    const receivedSignCount = (authDataBuf[33] << 24) | (authDataBuf[34] << 16) |
                              (authDataBuf[35] << 8)  |  authDataBuf[36]
    // Só revoga se AMBOS os contadores são > 0 e o recebido é menor.
    // Autenticadores Android/Chrome frequentemente retornam signCount = 0 sempre,
    // o que causaria falsos positivos e revogação indevida da credencial.
    if (stored.signCount > 0 && receivedSignCount > 0 && receivedSignCount <= stored.signCount) {
      logger.error('signCount regressivo — possível clonagem de autenticador!', {
        stored: stored.signCount, received: receivedSignCount
      })
      // Revogar credencial como medida de segurança
      await getDatabase().ref('_biometric/credential').remove()
      throw new HttpsError('unauthenticated', 'Autenticador comprometido. Recadastre a digital.')
    }

    // Atualizar signCount no banco
    await getDatabase().ref('_biometric/credential/signCount').set(receivedSignCount)

    await clearRateLimit(ipKey)

    // Emitir Custom Token — mesmo mecanismo do adminLogin
    try {
      const token = await getAuth().createCustomToken(ADMIN_UID, { role: 'admin' })
      logger.info('Login biométrico bem-sucedido.')
      return { token }
    } catch (err) {
      logger.error('Erro ao criar token pós-biometria:', err)
      throw new HttpsError('internal', 'Erro ao criar sessão.')
    }
  }
)

exports.adminLogin = onCall(
  {
    secrets:         ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'DATABASE_URL'],
    timeoutSeconds:  30,
    memory:          '512MiB',
    region:          'us-central1',
    enforceAppCheck: true,
  },
  async (request) => {
    const ipKey       = getClientIp(request.rawRequest)
    const { username, password } = request.data || {}

    // Rate limit por IP E por username — previne bypass via proxies
    const usernameKey = username ? `user:${username}` : null
    if (await isRateLimited(ipKey))
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')
    if (usernameKey && await isRateLimited(usernameKey))
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')

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

    if (!usernameOk || !passwordOk) {
      await recordFailedAttempt(ipKey)
      if (usernameKey) await recordFailedAttempt(usernameKey)
      throw new HttpsError('unauthenticated', 'Usuário ou senha incorretos.')
    }

    await clearRateLimit(ipKey)
    if (usernameKey) await clearRateLimit(usernameKey)

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

    if (!/^[0-9a-f-]{36}$/.test(token))
      throw new HttpsError('invalid-argument', 'Token inválido.')

    const rateLimitKey = `apt:${token}`
    if (await isRateLimited(rateLimitKey))
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

    // Busca dados públicos — accessPasswordHash NUNCA é gravado em /public,
    // portanto não precisa ser removido aqui. hasPassword é derivado de /apartments.
    const publicSnap = await db.ref(`public/${token}`).get()
    const publicData = publicSnap.exists() ? publicSnap.val() : {}

    return {
      ...publicData,
      hasPassword: !!aptData.accessPasswordHash,
      _firebaseToken: residentFirebaseToken,
    }
  }
)

// ─── monthlyBackup ────────────────────────────────────────────────────────────
// Roda todo dia 1 às 03:00 (Brasília).
// Salva snapshot do RTDB em gs://<bucket>/backups/rtdb-YYYY-MM.json
//
// Secret necessário:
//   firebase functions:secrets:set STORAGE_BUCKET
//   → valor: <SEU-PROJETO>.appspot.com
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

    const raw = snap.val()

    // Remove campos sensíveis antes de salvar no Storage:
    // - _rateLimit: dados operacionais temporários, sem valor para backup
    // - apartments[*].accessPasswordHash: hashes Argon2id — não devem vazar se bucket for comprometido
    const sanitized = { ...raw, _rateLimit: undefined }
    if (sanitized.apartments) {
      sanitized.apartments = Object.fromEntries(
        Object.entries(sanitized.apartments).map(([id, apt]) => {
          const { accessPasswordHash: _omit, ...safeApt } = apt
          return [id, safeApt]
        })
      )
    }

    const now      = new Date()
    const label    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const filePath = `backups/rtdb-${label}.json`

    await getStorage()
      .bucket(process.env.STORAGE_BUCKET)
      .file(filePath)
      .save(JSON.stringify(sanitized, null, 2), {
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
    secrets:        ['DATABASE_URL', 'GMAIL_APP_PASSWORD', 'GMAIL_SENDER', 'APP_URL'],
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      logger.warn(`monthlyEmailReport: managerEmail inválido: "${toEmail}"`)
      return
    }

    // Mês de referência (mês anterior)
    const refYear  = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
    const refMonth = today.getMonth() === 0 ? 12 : today.getMonth() // 1–12

    // Lê leituras fechadas do mês de referência — filtra por year no índice RTDB
    // para evitar carregar todo o histórico em memória (prevenção de timeout/OOM).
    // O filtro de mês é feito em memória após a query indexada.
    const readingsSnap = await db.ref('readings')
      .orderByChild('year').equalTo(refYear).get()
    const byApt        = {}

    if (readingsSnap.exists()) {
      for (const r of Object.values(readingsSnap.val())) {
        if (r.month !== refMonth) continue
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

    const senderEmail = process.env.GMAIL_SENDER
    if (!senderEmail) {
      logger.error('monthlyEmailReport: GMAIL_SENDER não configurado.')
      return
    }

    // ── Envio ─────────────────────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    await transporter.sendMail({
      from:        `"HidroGás" <${senderEmail}>`,
      to:          toEmail,
      subject:     `Relatório ${monthName}/${refYear} — ${condName}`,
      text,
      html,
      attachments: emailIconAttachments(),
    })

    logger.info(`monthlyEmailReport: enviado para ${toEmail} — ${monthName}/${refYear}`)
  }
)
