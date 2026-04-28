/**
 * useSessionRenewal — HidroGás
 *
 * Mantém a sessão Firebase viva durante o uso contínuo do app.
 *
 * Problema:
 *   Custom Tokens do Firebase expiram em 1 hora. O Firebase SDK usa um
 *   refresh token para renovar o ID Token (que dura 1h), mas o Custom Token
 *   em si não tem refresh token nativo — quando o ID Token expira, o Firebase
 *   não consegue renová-lo e descarta a sessão.
 *
 * Solução:
 *   Guardamos username + password em memória (nunca em disco) após o login.
 *   Usamos onIdTokenChanged para detectar quando o Firebase renova (ou falha
 *   ao renovar) o ID Token. Quando o token está perto de expirar (~5min antes),
 *   chamamos adminLogin silenciosamente e fazemos signInWithCustomToken de novo.
 *
 * Garantias de segurança:
 *   - Credenciais ficam apenas em memória (nunca localStorage/sessionStorage)
 *   - F5 ou fechar aba limpa tudo → pede login novamente (comportamento correto)
 *   - Renovação é silenciosa, sem interromper o síndico
 *   - Se a renovação falhar (senha alterada, servidor offline), faz logout limpo
 */

import { useEffect, useRef, useCallback } from 'react'
import { onIdTokenChanged, signInWithCustomToken, signOut } from 'firebase/auth'
import { httpsCallable, getFunctions }                      from 'firebase/functions'
import { auth, app }                                        from '../infrastructure/firebase'

// ── Armazena credenciais em memória (módulo-level, não persiste no disco) ─────
// Escopo de módulo garante que sobrevive a re-renders mas é limpo no F5.
let _username: string | null = null
let _password: string | null = null

export function storeCredentials(username: string, password: string) {
  _username = username
  _password = password
}

export function clearCredentials() {
  _username = null
  _password = null
}

// Quantos ms antes da expiração devemos renovar (5 minutos)
const RENEW_BEFORE_MS = 5 * 60 * 1000

// ─────────────────────────────────────────────────────────────────────────────

export function useSessionRenewal() {
  const renewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renewingRef   = useRef(false)

  const clearTimer = () => {
    if (renewTimerRef.current) {
      clearTimeout(renewTimerRef.current)
      renewTimerRef.current = null
    }
  }

  const renewSession = useCallback(async () => {
    if (renewingRef.current) return
    if (!_username || !_password) {
      // Sem credenciais em memória → não consegue renovar → logout limpo
      clearCredentials()
      await signOut(auth)
      return
    }

    renewingRef.current = true
    try {
      const functions  = getFunctions(app, 'us-central1')
      const adminLogin = httpsCallable<
        { username: string; password: string },
        { token: string }
      >(functions, 'adminLogin')

      const result = await adminLogin({
        username: _username,
        password: _password,
      })

      await signInWithCustomToken(auth, result.data.token)
      // onIdTokenChanged vai disparar novamente e agendar o próximo ciclo
    } catch {
      // Falha na renovação (senha mudou, servidor offline, rate limit etc.)
      // Faz logout limpo — o usuário verá a tela de login
      clearCredentials()
      await signOut(auth)
    } finally {
      renewingRef.current = false
    }
  }, [])

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      clearTimer()

      if (!user) {
        // Sessão encerrada (logout ou expiração sem credenciais) → nada a fazer
        return
      }

      // Pega o tempo de expiração do ID Token atual
      try {
        const idTokenResult = await user.getIdTokenResult()
        const expiresAt     = new Date(idTokenResult.expirationTime).getTime()
        const now           = Date.now()
        const msUntilExpiry = expiresAt - now

        if (msUntilExpiry <= RENEW_BEFORE_MS) {
          // Já estamos dentro da janela de renovação → renova imediatamente
          await renewSession()
        } else {
          // Agenda renovação para RENEW_BEFORE_MS antes do vencimento
          const delay = msUntilExpiry - RENEW_BEFORE_MS
          renewTimerRef.current = setTimeout(renewSession, delay)
        }
      } catch {
        // Não conseguiu inspecionar o token — força renovação imediata
        await renewSession()
      }
    })

    return () => {
      unsub()
      clearTimer()
    }
  }, [renewSession])
}
