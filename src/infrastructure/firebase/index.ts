import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { initializeApp }    from 'firebase/app'
import { getDatabase, ref, push, set, get, update, remove, onValue, off, query, orderByChild, equalTo } from 'firebase/database'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { IApartmentRepository, IReadingRepository, IConfigRepository } from '../../domain/ports'
import type { Apartment, Config, Reading } from '../../domain/entities'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY                       ,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN                   ,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL                  ,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID                    ,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET                ,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID           ,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID                        ,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const app       = initializeApp(firebaseConfig)
export const db        = getDatabase(app)
export const auth      = getAuth(app)
export const functions = getFunctions(app, 'us-central1')

// App Check: só inicializa se a chave reCAPTCHA estiver configurada.
// Sem isso, a ausência da variável causa erro silencioso que bloqueia
// todas as Cloud Functions com enforceAppCheck: true.
if (import.meta.env.VITE_RECAPTCHA_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function snap<T>(snapshot: any): T[] {
  if (!snapshot.exists()) return []
  const val = snapshot.val()
  return Object.entries(val).map(([id, data]) => ({
    ...(data as any),
    id,
  })) as T[]
}

// ── Escreve/apaga o nó público de um apartamento em /public/{token} ───────────
// Contém apenas: número, bloco, responsável e leituras fechadas.
// Qualquer pessoa com o token pode ler; só autenticados podem escrever.
// ── Sync do nó público via Cloud Function (escrita server-side apenas) ────────
const _syncPublicNodeFn   = httpsCallable<{ apartmentId: string }, void>(functions, 'syncPublicNode')
const _deletePublicNodeFn = httpsCallable<{ token: string }, void>(functions, 'deletePublicNode')

export async function syncPublicNode(apt: Apartment): Promise<void> {
  if (!apt.publicToken) return
  await _syncPublicNodeFn({ apartmentId: apt.id })
}

export async function deletePublicNode(token: string): Promise<void> {
  await _deletePublicNodeFn({ token })
}
}

// ─────────────────────────────────────────────────────────────────────────────
// APARTMENTS
// ─────────────────────────────────────────────────────────────────────────────
export class FirebaseApartmentRepository implements IApartmentRepository {
  private path = 'apartments'

  async getAll(): Promise<Apartment[]> {
    const s = await get(ref(db, this.path))
    return snap<Apartment>(s).sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true })
    )
  }

  async getById(id: string): Promise<Apartment | null> {
    const s = await get(ref(db, `${this.path}/${id}`))
    return s.exists() ? { ...s.val(), id } : null
  }

  async create(data: Omit<Apartment, 'id' | 'createdAt'>): Promise<Apartment> {
    const r   = push(ref(db, this.path))
    const apt: Apartment = { ...data, id: r.key!, createdAt: Date.now() }
    await set(r, apt)
    // Publica nó público inicial (sem leituras ainda)
    await syncPublicNode(apt)
    return apt
  }

  async update(id: string, data: Partial<Apartment>): Promise<void> {
    // Se o token está sendo regenerado, apaga o nó público antigo
    if (data.publicToken) {
      const current = await this.getById(id)
      if (current?.publicToken && current.publicToken !== data.publicToken) {
        await deletePublicNode(current.publicToken)
      }
    }
    await update(ref(db, `${this.path}/${id}`), data)
    // Re-sincroniza o nó público com os dados atualizados
    const updated = await this.getById(id)
    if (updated) await syncPublicNode(updated)
  }

  async delete(id: string): Promise<void> {
    const apt = await this.getById(id)
    if (apt?.publicToken) await deletePublicNode(apt.publicToken)
    await remove(ref(db, `${this.path}/${id}`))
  }

  subscribe(cb: (apartments: Apartment[]) => void): () => void {
    const r = ref(db, this.path)
    let unsubDb: any = null

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return
      unsubDb = onValue(r, snap => {
        const list = snap.exists()
          ? Object.entries(snap.val()).map(([id, v]) => ({ ...(v as any), id })) as Apartment[]
          : []
        cb(list.sort((a, b) =>
          a.number.localeCompare(b.number, undefined, { numeric: true })
        ))
      })
    })

    return () => {
      if (unsubDb) off(r)
      unsubAuth()
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// READINGS
// ─────────────────────────────────────────────────────────────────────────────
export class FirebaseReadingRepository implements IReadingRepository {
  private path = 'readings'

  async getAll(): Promise<Reading[]> {
    const s = await get(ref(db, this.path))
    return snap<Reading>(s)
  }

  async getByApartment(apartmentId: string): Promise<Reading[]> {
    const q = query(
      ref(db, this.path),
      orderByChild('apartmentId'),
      equalTo(apartmentId),
    )
    const s = await get(q)
    return snap<Reading>(s)
  }

  async getByMonthYear(month: number, year: number): Promise<Reading[]> {
    const all = await this.getAll()
    return all.filter(r => r.month === month && r.year === year)
  }

  async create(data: Omit<Reading, 'id' | 'createdAt'>): Promise<Reading> {
    const r       = push(ref(db, this.path))
    const reading: Reading = { ...data, id: r.key!, createdAt: Date.now() }
    await set(r, reading)
    return reading
  }

  async update(id: string, data: Partial<Reading>): Promise<void> {
    await update(ref(db, `${this.path}/${id}`), data)
    // Se a leitura foi fechada (closedAt adicionado), re-sincroniza o nó público
    if (data.closedAt) {
      const snap     = await get(ref(db, `${this.path}/${id}`))
      const reading  = snap.exists() ? { ...snap.val(), id } as Reading : null
      if (reading?.apartmentId) {
        const aptSnap = await get(ref(db, `apartments/${reading.apartmentId}`))
        if (aptSnap.exists()) {
          await syncPublicNode({ ...aptSnap.val(), id: reading.apartmentId })
        }
      }
    }
  }

  async delete(id: string): Promise<void> {
    // Captura o apartmentId antes de deletar para re-sincronizar
    const snap    = await get(ref(db, `${this.path}/${id}`))
    const reading = snap.exists() ? { ...snap.val(), id } as Reading : null
    await remove(ref(db, `${this.path}/${id}`))
    if (reading?.apartmentId) {
      const aptSnap = await get(ref(db, `apartments/${reading.apartmentId}`))
      if (aptSnap.exists()) {
        await syncPublicNode({ ...aptSnap.val(), id: reading.apartmentId })
      }
    }
  }

  subscribe(cb: (readings: Reading[]) => void): () => void {
    const r = ref(db, this.path)
    let unsubDb: any = null

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return
      unsubDb = onValue(r, snap => {
        const list = snap.exists()
          ? Object.entries(snap.val()).map(([id, v]) => ({ ...(v as any), id })) as Reading[]
          : []
        cb(list)
      })
    })

    return () => {
      if (unsubDb) off(r)
      unsubAuth()
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG: Config = {
  waterRate:       0.033,
  gasRate:         0.033,
  condominiumName: 'Meu Condomínio',
  updatedAt:       Date.now(),
}

export class FirebaseConfigRepository implements IConfigRepository {
  private path = 'config'

  async get(): Promise<Config> {
    const s = await get(ref(db, this.path))
    return s.exists() ? s.val() : DEFAULT_CONFIG
  }

  async update(data: Partial<Config>): Promise<void> {
    await update(ref(db, this.path), {
      ...data,
      updatedAt: Date.now(),
    })
    // Re-sincroniza todos os nós públicos para atualizar condoInfo
    const aptsSnap = await get(ref(db, 'apartments'))
    if (aptsSnap.exists()) {
      const apts = Object.entries(aptsSnap.val())
        .map(([id, v]) => ({ ...(v as any), id }))
        .filter((a: any) => a.publicToken)
      await Promise.all(apts.map((a: any) => syncPublicNode(a)))
    }
  }

  subscribe(cb: (config: Config) => void): () => void {
    const r = ref(db, this.path)
    let unsubDb: any = null

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return
      unsubDb = onValue(r, snap => {
        cb(snap.exists() ? snap.val() : DEFAULT_CONFIG)
      })
    })

    return () => {
      if (unsubDb) off(r)
      unsubAuth()
    }
  }
}
