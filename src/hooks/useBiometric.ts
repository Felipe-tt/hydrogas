/**
 * useBiometric — WebAuthn (Passkey) hook para o HidroGás PWA
 *
 * Arquitetura de segurança:
 * ─────────────────────────────────────────────────────────────────────────────
 *  REGISTRO (só após login com senha bem-sucedido):
 *    1. getBiometricRegisterChallenge → challenge assinado com HMAC pelo servidor
 *    2. navigator.credentials.create() → secure enclave gera par de chaves
 *       (Touch ID / Face ID / Windows Hello — chave privada NUNCA sai do dispositivo)
 *    3. registerBiometric → servidor valida origin, rpId, challenge e salva chave pública
 *    4. localStorage recebe apenas o credentialId (público por design WebAuthn)
 *
 *  AUTENTICAÇÃO (substitui senha completamente):
 *    1. getBiometricAuthChallenge → challenge único, TTL 2 min, destruído após uso
 *    2. navigator.credentials.get() → secure enclave assina o challenge com chave privada
 *    3. verifyBiometric → servidor verifica assinatura ECDSA com chave pública armazenada
 *    4. Em sucesso → Custom Token Firebase emitido (mesmo mecanismo do adminLogin)
 *
 *  PROTEÇÕES:
 *    - Replay attack: challenge de uso único deletado no servidor após verificação
 *    - Phishing: rpId e origin validados criptograficamente pelo servidor
 *    - Força bruta: rate limit por IP em todas as Cloud Functions
 *    - userVerification: 'required' → biometria obrigatória (não só toque)
 *    - Credencial órfã: sobrescrita automática no re-enroll
 *    - Nada sensível em localStorage: apenas credentialId (não é segredo)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from 'react'
import { httpsCallable, getFunctions } from 'firebase/functions'
import { signInWithCustomToken } from 'firebase/auth'
import { app, auth } from '../infrastructure/firebase'

// ── Chaves do localStorage (valores não são segredos) ─────────────────────────
const LS_CREDENTIAL_ID = 'hg_bio_cred_id'
const LS_ENROLLED      = 'hg_bio_enrolled'

// ── Tipos das Cloud Functions ─────────────────────────────────────────────────

interface RegisterChallengeResponse {
  challenge: string  // base64url — challenge assinado completo (random.timestamp.hmac)
  random:    string  // base64url — bytes aleatórios puros para o WebAuthn
  rpId:      string
  userId:    string
}

interface VerifyRegistrationPayload {
  credentialId:      string
  clientDataJSON:    string
  attestationObject: string
  signedChallenge:   string  // challenge assinado completo (random.timestamp.hmac)
}

interface AuthChallengeResponse {
  challenge: string  // base64url — string assinada completa (random.timestamp.hmac)
  random:    string  // base64url — bytes puros para o WebAuthn
}

interface VerifyAuthPayload {
  credentialId:      string
  clientDataJSON:    string
  authenticatorData: string
  signature:         string
  signedChallenge:   string  // challenge assinado completo (random.timestamp.hmac)
}

interface VerifyAuthResponse {
  token: string
}

// ── Helpers de encoding ───────────────────────────────────────────────────────

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  bytes.forEach(b => { str += String.fromCharCode(b) })
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlToBuffer(b64url: string): ArrayBuffer {
  const b64     = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded  = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=')
  const binary  = atob(padded)
  const bytes   = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// ── Verificação de suporte ────────────────────────────────────────────────────

export function isBiometricSupported(): boolean {
  return (
    window.isSecureContext &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get    === 'function'
  )
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isBiometricSupported()) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// ── Hook principal ────────────────────────────────────────────────────────────

export type BiometricState =
  | 'idle'
  | 'enrolling'
  | 'authenticating'
  | 'success'
  | 'error'

export interface UseBiometricReturn {
  state:           BiometricState
  error:           string
  isEnrolled:      () => boolean
  getCredentialId: () => string | null
  enroll:          () => Promise<boolean>
  authenticate:    () => Promise<boolean>
  revoke:          () => void
}

export function useBiometric(): UseBiometricReturn {
  const [state, setState] = useState<BiometricState>('idle')
  const [error, setError] = useState('')

  const functions = getFunctions(app, 'us-central1')

  const isEnrolled = useCallback((): boolean => {
    return (
      localStorage.getItem(LS_ENROLLED)      === 'true' &&
      localStorage.getItem(LS_CREDENTIAL_ID) !== null
    )
  }, [])

  const getCredentialId = useCallback((): string | null => {
    return localStorage.getItem(LS_CREDENTIAL_ID)
  }, [])

  const revoke = useCallback((): void => {
    localStorage.removeItem(LS_ENROLLED)
    localStorage.removeItem(LS_CREDENTIAL_ID)
  }, [])

  // ── Enroll ─────────────────────────────────────────────────────────────────

  const enroll = useCallback(async (): Promise<boolean> => {
    setState('enrolling')
    setError('')

    try {
      const currentUser = auth.currentUser
      if (!currentUser) {
        setError('Sessão expirada. Faça login com senha primeiro.')
        setState('error')
        return false
      }
      await currentUser.getIdToken()

      const getChallenge = httpsCallable<void, RegisterChallengeResponse>(
        functions, 'getBiometricRegisterChallenge'
      )
      const { data } = await getChallenge()

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: base64urlToBuffer(data.random),
          rp: {
            id:   data.rpId,
            name: 'HidroGás',
          },
          user: {
            id:          base64urlToBuffer(data.userId),
            name:        'admin',
            displayName: 'Administrador HidroGás',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7   },
            { type: 'public-key', alg: -257  },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification:        'required',
            residentKey:             'preferred',
          },
          timeout:     60_000,
          attestation: 'none',
        },
      }) as PublicKeyCredential | null

      if (!credential) {
        setError('Operação cancelada.')
        setState('error')
        return false
      }

      const response = credential.response as AuthenticatorAttestationResponse

      const register = httpsCallable<VerifyRegistrationPayload, { ok: boolean }>(
        functions, 'registerBiometric'
      )
      await register({
        credentialId:      bufferToBase64url(credential.rawId),
        clientDataJSON:    bufferToBase64url(response.clientDataJSON),
        attestationObject: bufferToBase64url(response.attestationObject),
        signedChallenge:   data.challenge,  // ← CORRIGIDO
      })

      localStorage.setItem(LS_CREDENTIAL_ID, bufferToBase64url(credential.rawId))
      localStorage.setItem(LS_ENROLLED, 'true')

      setState('success')
      return true

    } catch (err: any) {
      const errDetail = `name=${err?.name} code=${err?.code} msg=${err?.message}`
      if (err?.name === 'NotAllowedError') {
        setError('Registro cancelado. ' + errDetail)
        setState('idle')
      } else if (err?.code === 'functions/unauthenticated') {
        setError('Sessão expirada. ' + errDetail)
        revoke()
        setState('error')
      } else if (err?.code === 'functions/resource-exhausted') {
        setError('Muitas tentativas. Aguarde 15 minutos.')
        setState('error')
      } else if (err?.code === 'functions/invalid-argument') {
        setError('Servidor rejeitou: ' + err?.message)
        setState('error')
      } else {
        setError('Erro: ' + errDetail)
        setState('error')
      }
      return false
    }
  }, [functions, revoke])

  // ── Authenticate ───────────────────────────────────────────────────────────

  const authenticate = useCallback(async (): Promise<boolean> => {
    setState('authenticating')
    setError('')

    const credentialId = getCredentialId()
    if (!credentialId) {
      setError('Biometria não registrada.')
      setState('error')
      return false
    }

    try {
      const getChallenge = httpsCallable<void, AuthChallengeResponse>(
        functions, 'getBiometricAuthChallenge'
      )
      const { data } = await getChallenge()

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge:        base64urlToBuffer(data.random),
          rpId:             window.location.hostname,
          timeout:          60_000,
          userVerification: 'required',
          allowCredentials: [{
            type: 'public-key',
            id:   base64urlToBuffer(credentialId),
          }],
        },
      }) as PublicKeyCredential | null

      if (!assertion) {
        setError('Autenticação cancelada.')
        setState('idle')
        return false
      }

      const response = assertion.response as AuthenticatorAssertionResponse

      const verify = httpsCallable<VerifyAuthPayload, VerifyAuthResponse>(
        functions, 'verifyBiometric'
      )
      const { data: verifyData } = await verify({
        credentialId:      bufferToBase64url(assertion.rawId),
        clientDataJSON:    bufferToBase64url(response.clientDataJSON),
        authenticatorData: bufferToBase64url(response.authenticatorData),
        signature:         bufferToBase64url(response.signature),
        signedChallenge:   data.challenge,  // ← CORRIGIDO
      })

      await signInWithCustomToken(auth, verifyData.token)

      setState('success')
      return true

    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setState('idle')
        return false
      } else if (err?.code === 'functions/not-found') {
        setError('Biometria não encontrada. Faça login com senha para reativar.')
        revoke()
        setState('error')
      } else if (err?.code === 'functions/unauthenticated') {
        setError('Biometria inválida. Faça login com senha para reativar.')
        revoke()
        setState('error')
      } else if (err?.code === 'functions/resource-exhausted') {
        setError('Muitas tentativas. Aguarde 15 minutos.')
        setState('error')
      } else {
        setError('Falha na autenticação. Tente novamente.')
        setState('error')
      }
      return false
    }
  }, [functions, getCredentialId, revoke])

  return { state, error, isEnrolled, getCredentialId, enroll, authenticate, revoke }
}
