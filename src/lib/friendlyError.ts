/**
 * Traduz erros do Firebase Functions e erros genéricos para mensagens
 * amigáveis em português para o usuário.
 */
export function friendlyError(e: unknown): string {
  if (!e) return 'Erro desconhecido.'

  const msg: string =
    (e as any)?.message ??
    (e as any)?.code ??
    String(e)

  const code: string = (e as any)?.code ?? ''

  // ── Firebase Functions / CORS / rede ──────────────────────────────────────
  if (
    msg.includes('CORS') ||
    msg.includes('preflight') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('net::ERR') ||
    code === 'functions/unavailable'
  ) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão ou tente novamente em instantes.'
  }

  if (code === 'functions/unauthenticated' || msg.includes('unauthenticated')) {
    return 'Sua sessão expirou. Faça login novamente.'
  }

  if (code === 'functions/not-found' || msg.includes('NOT_FOUND')) {
    return 'Função não encontrada no servidor. Verifique se o deploy das Functions foi realizado.'
  }

  if (code === 'functions/permission-denied' || msg.includes('permission-denied')) {
    return 'Sem permissão para realizar esta operação.'
  }

  if (code === 'functions/resource-exhausted' || msg.includes('resource-exhausted')) {
    return 'Muitas tentativas. Aguarde 15 minutos e tente novamente.'
  }

  if (code === 'functions/internal' || msg.toLowerCase().includes('internal')) {
    return 'Erro interno no servidor. Tente novamente ou contate o suporte.'
  }

  if (code === 'functions/invalid-argument') {
    return 'Dados inválidos enviados ao servidor.'
  }

  // ── Firebase Auth ─────────────────────────────────────────────────────────
  if (code === 'auth/network-request-failed') {
    return 'Falha de rede. Verifique sua conexão.'
  }

  if (code === 'auth/user-not-found' || code === 'auth/wrong-password') {
    return 'Usuário ou senha incorretos.'
  }

  if (code === 'auth/too-many-requests') {
    return 'Conta temporariamente bloqueada. Tente novamente mais tarde.'
  }

  // ── Firebase Realtime Database ────────────────────────────────────────────
  if (msg.includes('permission_denied') || msg.includes('PERMISSION_DENIED')) {
    return 'Sem permissão para acessar o banco de dados. Verifique as regras do Firebase.'
  }

  // ── Mensagem original legível ─────────────────────────────────────────────
  // Se a mensagem parece ter vindo de um throw do próprio app (PT-BR), usa ela
  if (msg && msg.length < 120 && !/^firebase|^firestore|^functions\//i.test(msg)) {
    return msg
  }

  return 'Ocorreu um erro inesperado. Tente novamente.'
}
