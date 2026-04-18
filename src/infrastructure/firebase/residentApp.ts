/**
 * Instância Firebase separada exclusiva para o morador.
 *
 * Por que isso existe:
 *   O Firebase Auth é por-app. Se o morador chamar signInWithCustomToken
 *   na instância principal (app/auth), ele sobrescreve a sessão do síndico.
 *   Com uma instância separada, as duas sessões coexistem sem interferência.
 *
 * App Check NÃO é inicializado aqui — o token de App Check é por appId,
 * não por instância. A instância principal já registra o token que vale
 * para ambas. Inicializar duas vezes causa conflito.
 */
import { initializeApp, getApps } from 'firebase/app'
import { getAuth }                 from 'firebase/auth'
import { getFunctions }            from 'firebase/functions'
import { getDatabase }             from 'firebase/database'

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

export const residentApp = getApps().find(a => a.name === RESIDENT_APP_NAME)
                         ?? initializeApp(firebaseConfig, RESIDENT_APP_NAME)

export const residentAuth      = getAuth(residentApp)
export const residentFunctions = getFunctions(residentApp, 'us-central1')
export const residentDb        = getDatabase(residentApp)
