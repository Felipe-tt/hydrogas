/**
 * HidroGás — Firebase Cloud Functions
 *
 * adminLogin:            Login do síndico com Argon2id + Custom Token
 * hashApartmentPassword: Gera hash Argon2id da senha do apartamento (chamada autenticada)
 * getPublicApartment:    Dados do apartamento para o morador (valida hash no servidor)
 */

const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https')
const { logger }        = require('firebase-functions')
const argon2            = require('argon2')
const { initializeApp } = require('firebase-admin/app')
const { getAuth }       = require('firebase-admin/auth')
const { getDatabase }   = require('firebase-admin/database')

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
// Funciona em múltiplas instâncias de Cloud Functions (produção-safe).
//
// Estrutura no RTDB:
//   _rateLimit/
//     {sanitizedKey}/
//       count:   <number>
//       resetAt: <timestamp ms>
//
// A chave é sanitizada porque o RTDB não permite '.' '/' '#' '$' '[' ']'

const MAX_TRIES = 5
const WINDOW_MS = 15 * 60 * 1000   // 15 minutos

/**
 * Remove caracteres inválidos para chaves do RTDB e trunca para 100 chars.
 * Caracteres proibidos: . / # $ [ ]
 */
function sanitizeKey(raw) {
  return raw.replace(/[./#$[\]]/g, '_').slice(0, 100)
}

/**
 * Verifica (e incrementa) o rate limit para uma chave arbitrária.
 * Usa uma transação RTDB para garantir consistência entre instâncias.
 *
 * @param {string} key  — chave semântica, ex: "ip:192.168.1.1" ou "apt:abc123"
 * @returns {Promise<boolean>}  true = bloqueado, false = permitido
 */
async function isRateLimited(key) {
  const db      = getDatabase()
  const safeKey = sanitizeKey(key)
  const ref     = db.ref(`_rateLimit/${safeKey}`)
  const now     = Date.now()

  let blocked = false

  await ref.transaction((current) => {
    // Nó não existe ainda → primeira tentativa
    if (!current) {
      return { count: 1, resetAt: now + WINDOW_MS }
    }

    // Janela expirou → reinicia contagem
    if (current.resetAt < now) {
      return { count: 1, resetAt: now + WINDOW_MS }
    }

    // Já atingiu o limite → bloqueia sem incrementar
    if (current.count >= MAX_TRIES) {
      blocked = true
      return current   // retorna o valor atual sem alterar (aborta se retornar undefined)
    }

    // Dentro da janela e abaixo do limite → incrementa
    return { count: current.count + 1, resetAt: current.resetAt }
  })

  return blocked
}

/**
 * Remove o registro de tentativas após login bem-sucedido.
 */
async function clearRateLimit(key) {
  const db      = getDatabase()
  const safeKey = sanitizeKey(key)
  await getDatabase().ref(`_rateLimit/${safeKey}`).remove()
}

// Cloud Functions no GCP recebem o IP real no primeiro valor de X-Forwarded-For.
// O cabeçalho pode ter múltiplos IPs quando há proxies intermediários; o GCP
// injeta o IP real como primeiro elemento, mas um cliente malicioso pode tentar
// forjar IPs adicionais. Usamos o primeiro IP, que é o mais confiável no GCP.
// Para proteção extra, considere Firebase App Check em conjunto.
function getIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
  const firstIp   = forwarded.split(',')[0].trim()
  return 'ip:' + (firstIp || req.ip || 'unknown')
}

// ── adminLogin ────────────────────────────────────────────────────────────────
exports.adminLogin = onRequest(
  {
    secrets:        ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'DATABASE_URL'],
    timeoutSeconds: 30,
    memory:         '512MiB',
    region:         'us-central1',
  },
  async (req, res) => {
    setCorsHeaders(req, res)
    if (req.method === 'OPTIONS') return res.status(204).send('')
    if (req.method !== 'POST')
      return res.status(405).json({ error: 'Método não permitido.' })

    const ipKey = getIp(req)
    if (await isRateLimited(ipKey))
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' })

    const { username, password } = req.body || {}
    if (!username || !password)
      return res.status(400).json({ error: 'Dados inválidos.' })

    const expectedUsername = process.env.ADMIN_USERNAME      || 'admin'
    const passwordHash     = process.env.ADMIN_PASSWORD_HASH

    if (!passwordHash) {
      logger.error('ADMIN_PASSWORD_HASH secret não configurado!')
      return res.status(500).json({ error: 'Servidor mal configurado. Contate o administrador.' })
    }

    const usernameOk = username === expectedUsername
    let passwordOk   = false
    try {
      passwordOk = await argon2.verify(passwordHash, password, { type: argon2.argon2id })
    } catch (err) {
      logger.error('Erro ao verificar senha:', err)
      return res.status(500).json({ error: 'Erro interno ao verificar senha.' })
    }

    if (!usernameOk || !passwordOk)
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' })

    await clearRateLimit(ipKey)

    try {
      const token = await getAuth().createCustomToken(ADMIN_UID, { role: 'admin' })
      return res.status(200).json({ token })
    } catch (err) {
      logger.error('Erro ao criar custom token:', err)
      return res.status(500).json({
        error: err?.message || err?.toString?.() || 'unknown error',
      })
    }
  }
)

// ── hashApartmentPassword ─────────────────────────────────────────────────────
// Chamada autenticada: recebe a senha plain text, retorna o hash Argon2id.
// O frontend armazena APENAS o hash no Firebase — a senha plain text nunca persiste.
exports.hashApartmentPassword = onCall(
  { region: 'us-central1', secrets: ['DATABASE_URL'] },
  async (request) => {
    // Só admins autenticados podem chamar
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
// Verifica o rate limit SEM incrementar o contador.
// Usado para checar antes de operações que não devem consumir tentativas.
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
// Incrementa o contador SOMENTE em caso de falha de autenticação.
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
// Permite ao síndico desbloquear um apartamento que atingiu o rate limit.
// Requer autenticação como admin.
exports.resetApartmentRateLimit = onCall(
  { region: 'us-central1', secrets: ['DATABASE_URL'] },
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
// Rate limiting por token — SÓ incrementa em tentativas com senha errada,
// nunca em chamadas de leitura legítimas sem senha ou com sessão válida.
exports.getPublicApartment = onCall(
  { region: 'us-central1', secrets: ['DATABASE_URL'] },
  async (request) => {
    const { token, password } = request.data || {}

    if (!token) {
      throw new HttpsError('invalid-argument', 'Token obrigatório.')
    }

    const rateLimitKey = `apt:${token}`

    // Verifica se está bloqueado (read-only, não consome tentativas)
    if (await isRateLimitedReadOnly(rateLimitKey)) {
      throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde 15 minutos.')
    }

    const db = getDatabase()

    // Busca o apartamento pelo publicToken em /apartments via Admin SDK.
    // O hash fica em /apartments e nunca é exposto ao cliente.
    const aptSnap = await db.ref('apartments')
      .orderByChild('publicToken')
      .equalTo(token)
      .limitToFirst(1)
      .get()

    if (!aptSnap.exists()) {
      throw new HttpsError('not-found', 'Link inválido.')
    }

    const aptData = Object.values(aptSnap.val())[0]

    // Valida senha usando hash de /apartments — hash nunca sai do servidor
    if (aptData.accessPasswordHash) {
      if (!password) {
        // Sem senha fornecida — apenas retorna "unauthenticated" sem consumir tentativa
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

    // Gera Custom Token para o morador — permite sessão persistente no reload.
    // Usa instância Firebase separada no frontend (residentAuth), então não
    // interfere com a sessão do síndico.
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

    // Busca dados do nó público (leituras, número, responsável — nada sensível)
    const publicSnap = await db.ref(`public/${token}`).get()
    const publicData = publicSnap.exists() ? publicSnap.val() : {}

    // Remove campos sensíveis antes de retornar
    const { accessPasswordHash: _h, hasPassword: _hp, ...safeData } = publicData
    return { ...safeData, _firebaseToken: residentFirebaseToken }
  }
)
