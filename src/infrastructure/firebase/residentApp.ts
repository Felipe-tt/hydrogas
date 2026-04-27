/**
 * Instância Firebase separada exclusiva para o morador.
 *
 * Por que isso existe:
 *   O Firebase Auth é por-app. Se o morador chamar signInWithCustomToken
 *   na instância principal (app/auth), ele sobrescreve a sessão do síndico.
 *   Com uma instância separada, as duas sessões coexistem sem interferência.
 *
 * App Check: cada instância Firebase nomeada precisa do seu próprio
 * initializeAppCheck — o token NÃO é compartilhado entre instâncias.
 * Usamos a mesma chave reCAPTCHA da instância principal.
 */
import { initializeApp, getApps }                  from 'firebase/app'
import { getAuth }                                 from 'firebase/auth'
import { getFunctions }                            from 'firebase/functions'
import { getDatabase }                             from 'firebase/database'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const RESIDENT_APP_NAME = 'resident'

const existingApp = getApps().find(a => a.name === RESIDENT_APP_NAME)
export const residentApp = existingApp ?? initializeApp(firebaseConfig, RESIDENT_APP_NAME)

// Inicializa App Check apenas na primeira vez (evita erro de dupla inicialização)
if (!existingApp && import.meta.env.VITE_RECAPTCHA_KEY) {
  initializeAppCheck(residentApp, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}

export const residentAuth      = getAuth(residentApp)
export const residentFunctions = getFunctions(residentApp, 'us-central1')
export const residentDb        = getDatabase(residentApp)
