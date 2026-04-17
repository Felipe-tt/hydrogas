import { useState }        from 'react'
import { Plus, Pencil, Trash2, Building2, User, FileText, Link2, Copy, Check, RefreshCw, ExternalLink, QrCode, KeyRound, ShieldCheck } from 'lucide-react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../infrastructure/firebase'
import { useAppStore }     from '../store'
import { apartmentRepo }   from '../lib/container'
import { useToast }        from '../components/ui/Toast'
import { Modal }           from '../components/ui/Modal'
import { ConfirmDialog }   from '../components/ui/ConfirmDialog'
import { QRCodeModal }     from '../components/ui/QRCodeModal'
import { friendlyError }   from '../lib/friendlyError'
import { Spinner, ApartmentCardSkeleton } from '../components/ui/Skeleton'
import type { Apartment }  from '../domain/entities'

const empty = { number: '', block: '', responsible: '', observation: '' }

function generateToken(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
}

function generatePlainPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem O, 0, I, 1 pra evitar confusão
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => chars[b % chars.length])
    .join('')
}

async function hashPassword(plain: string): Promise<string> {
  try {
    const fns    = getFunctions(app, 'us-central1')
    const hashFn = httpsCallable<{ password: string }, { hash: string }>(fns, 'hashApartmentPassword')
    const result = await hashFn({ password: plain })
    return result.data.hash
  } catch (e: unknown) {
    throw new Error(friendlyError(e))
  }
}

function getPublicLink(token: string): string {
  return `${window.location.origin}/apt/${token}`
}

// ── Modal de senha one-time com loading no botão de confirmação ───────────────

function OneTimePasswordModal({
  password,
  onConfirm,
  onCancel,
}: {
  password: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [copied, setCopied]   = useState(false)
  const [saving, setSaving]   = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Senha gerada — copie agora!" onClose={saving ? undefined : onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fefce8', border: '1px solid #fde047', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#854d0e' }}>
          <ShieldCheck size={15} style={{ flexShrink: 0 }} />
          ⚠️ Esta senha será mostrada apenas UMA vez. Copie agora e entregue ao morador — depois não será mais possível ver a senha original.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
          <span style={{ flex: 1, fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 700, letterSpacing: 3, color: 'var(--text)' }}>
            {password}
          </span>
          <button
            onClick={copy}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: copied ? '#dcfce7' : 'var(--water-light)', border: `1px solid ${copied ? '#86efac' : 'var(--water)'}`, borderRadius: 6, padding: '7px 12px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: copied ? '#16a34a' : 'var(--water)', whiteSpace: 'nowrap', opacity: saving ? 0.6 : 1 }}
          >
            {copied ? <><Check size={13} /> Copiada!</> : <><Copy size={13} /> Copiar</>}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            className="btn-secondary"
            onClick={onCancel}
            disabled={saving}
            style={{ opacity: saving ? 0.5 : 1 }}
          >
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190 }}
          >
            {saving ? (
              <>
                <Spinner size={14} color="white" />
                Salvando com segurança...
              </>
            ) : (
              'Já copiei — salvar senha'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ApartmentCard({
  apt,
  onEdit,
  onDelete,
}: {
  apt: Apartment
  onEdit: (a: Apartment) => void
  onDelete: (a: Apartment) => void
}) {
  const [copiedLink, setCopiedLink]           = useState(false)
  const [regenerating, setRegenerating]       = useState(false)
  const [showQR, setShowQR]                   = useState(false)
  const [pendingPassword, setPendingPassword]  = useState<string | null>(null)
  const [confirmRegenLink, setConfirmRegenLink] = useState(false)
  const [confirmRegenPass, setConfirmRegenPass] = useState(false)
  const { toast } = useToast()

  const copyLink = () => {
    if (!apt.publicToken) return
    navigator.clipboard.writeText(getPublicLink(apt.publicToken)).then(() => {
      setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000)
    }).catch(() => toast('Erro ao copiar link', 'error'))
  }

  const regenerateToken = async () => {
    setConfirmRegenLink(false)
    setRegenerating(true)
    try {
      await apartmentRepo.update(apt.id, { publicToken: generateToken() } as any)
      toast('Novo link gerado!')
    } catch (e: any) { toast(friendlyError(e), 'error') }
    setRegenerating(false)
  }

  const startPasswordRegenerate = () => {
    setConfirmRegenPass(false)
    setPendingPassword(generatePlainPassword())
  }

  // Retorna uma Promise para que o modal possa controlar o loading
  const confirmPasswordRegenerate = async () => {
    if (!pendingPassword) return
    const hash = await hashPassword(pendingPassword)
    await apartmentRepo.update(apt.id, { accessPasswordHash: hash } as any)
    toast('Nova senha salva com segurança!')
    setPendingPassword(null)
  }

  const link = apt.publicToken ? getPublicLink(apt.publicToken) : null

  return (
    <>
      <div className="card fade-up" style={{ 
        padding: 20, 
        display: 'flex', 
        flexDirection: 'column',
        height: '100%',
        minHeight: 0
      }}>
        {/* Header row - fixo no topo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--water-light)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Building2 size={18} color="var(--water)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Ap. {apt.number}</div>
              {apt.block && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Bloco {apt.block}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onEdit(apt)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: 8, cursor: 'pointer', color: 'var(--text-2)' }} title="Editar"><Pencil size={14} /></button>
            <button onClick={() => onDelete(apt)} style={{ background: 'none', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 6, padding: 8, cursor: 'pointer', color: '#dc2626' }} title="Remover"><Trash2 size={14} /></button>
          </div>
        </div>

        {/* Conteúdo principal - flexível */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {/* Info - opcional */}
          {(apt.responsible || apt.observation) && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              {apt.responsible && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}><User size={13} color="var(--text-3)" />{apt.responsible}</div>}
              {apt.observation && <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--text-2)' }}><FileText size={13} color="var(--text-3)" style={{ marginTop: 2 }} />{apt.observation}</div>}
            </div>
          )}

          {/* ── Senha de acesso ── */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <KeyRound size={13} color="var(--text-3)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: 0.3 }}>SENHA DO MORADOR</span>
            </div>

            {apt.accessPasswordHash ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 12px' }}>
                  <ShieldCheck size={13} color="var(--water)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Senha protegida</span>
                </div>
                <button
                  onClick={() => setConfirmRegenPass(true)}
                  title="Gerar nova senha"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-3)' }}
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={startPasswordRegenerate}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--water-light)', border: '1px dashed var(--water)', borderRadius: 7, padding: '7px 12px', cursor: 'pointer', color: 'var(--water)', fontSize: 12, fontWeight: 600, width: '100%', justifyContent: 'center' }}
              >
                <KeyRound size={13} />Gerar senha de acesso
              </button>
            )}
          </div>

          {/* ── Link do morador ── */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Link2 size={13} color="var(--text-3)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: 0.3 }}>LINK DO MORADOR</span>
            </div>

            {link ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={copyLink} title="Clique para copiar" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, background: copiedLink ? '#dcfce7' : 'var(--surface-2)', border: `1px solid ${copiedLink ? '#86efac' : 'var(--border)'}`, borderRadius: 7, padding: '7px 10px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' }}>
                  {copiedLink ? <Check size={13} color="#16a34a" style={{ flexShrink: 0 }} /> : <Copy size={13} color="var(--text-3)" style={{ flexShrink: 0 }} />}
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: copiedLink ? '#16a34a' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {copiedLink ? 'Copiado!' : link}
                  </span>
                </button>
                <button onClick={() => setShowQR(true)} title="Ver QR Code" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-3)' }}>
                  <QrCode size={13} />
                </button>
                <a href={link} target="_blank" rel="noopener noreferrer" title="Abrir link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-3)', textDecoration: 'none' }}>
                  <ExternalLink size={13} />
                </a>
                <button onClick={() => setConfirmRegenLink(true)} disabled={regenerating} title="Gerar novo link (invalida o anterior)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-3)' }}>
                  <RefreshCw size={13} style={{ animation: regenerating ? 'spin 1s linear infinite' : 'none' }} />
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmRegenLink(true)} disabled={regenerating} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--water-light)', border: '1px dashed var(--water)', borderRadius: 7, padding: '7px 12px', cursor: 'pointer', color: 'var(--water)', fontSize: 12, fontWeight: 600, width: '100%', justifyContent: 'center' }}>
                <Link2 size={13} />{regenerating ? 'Gerando...' : 'Gerar link de acesso'}
              </button>
            )}
          </div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Modals... */}
      {showQR && <QRCodeModal apt={apt} onClose={() => setShowQR(false)} />}

      {pendingPassword && (
        <OneTimePasswordModal
          password={pendingPassword}
          onConfirm={confirmPasswordRegenerate}
          onCancel={() => setPendingPassword(null)}
        />
      )}

      {confirmRegenLink && (
        <ConfirmDialog
          message={`Gerar um novo link para o Ap. ${apt.number}? O link atual deixará de funcionar imediatamente.`}
          onConfirm={regenerateToken}
          onCancel={() => setConfirmRegenLink(false)}
        />
      )}

      {confirmRegenPass && (
        <ConfirmDialog
          message={`Gerar uma nova senha para o Ap. ${apt.number}? A senha atual do morador deixará de funcionar.`}
          onConfirm={startPasswordRegenerate}
          onCancel={() => setConfirmRegenPass(false)}
        />
      )}
    </>
  )
}

export function Apartments() {
  const { apartments } = useAppStore()
  const { toast } = useToast()
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<Apartment | null>(null)
  const [deleting, setDeleting]     = useState<Apartment | null>(null)
  const [form, setForm]             = useState(empty)
  const [loading, setLoading]       = useState(false)
  // Senha plain text gerada para novo apartamento (exibida uma vez)
  const [newAptPassword, setNewAptPassword] = useState<string | null>(null)
  const [pendingAptData, setPendingAptData] = useState<any | null>(null)

  const openCreate = () => { setForm(empty); setEditing(null); setShowForm(true) }
  const openEdit = (apt: Apartment) => {
    setForm({ number: apt.number, block: apt.block ?? '', responsible: apt.responsible ?? '', observation: apt.observation ?? '' })
    setEditing(apt); setShowForm(true)
  }

  const sanitize = (obj: Record<string, any>) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''))

  const save = async () => {
    if (!form.number.trim()) { toast('Número do apartamento obrigatório', 'error'); return }
    setLoading(true)
    try {
      if (editing) {
        await apartmentRepo.update(editing.id, sanitize({ number: form.number.trim(), block: form.block || null, responsible: form.responsible || null, observation: form.observation || null }) as any)
        toast('Apartamento atualizado!')
        setShowForm(false)
      } else {
        // Para criação: gera senha plain text, guarda estado e mostra modal one-time
        const plain = generatePlainPassword()
        const baseData = sanitize({ number: form.number.trim(), block: form.block || null, responsible: form.responsible || null, observation: form.observation || null, active: true, publicToken: generateToken() })
        setNewAptPassword(plain)
        setPendingAptData(baseData)
        setShowForm(false)
      }
    } catch (e: any) { toast(friendlyError(e), 'error') }
    setLoading(false)
  }

  // Após síndico copiar a senha e confirmar: faz hash e salva
  // Agora retorna Promise para que o modal possa controlar o loading
  const confirmNewApartment = async () => {
    if (!newAptPassword || !pendingAptData) return
    const hash = await hashPassword(newAptPassword)
    await apartmentRepo.create({ ...pendingAptData, accessPasswordHash: hash })
    toast('Apartamento cadastrado!')
    setNewAptPassword(null)
    setPendingAptData(null)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try { await apartmentRepo.delete(deleting.id); toast('Apartamento removido') }
    catch (e: any) { toast(friendlyError(e), 'error') }
    setDeleting(null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Apartamentos</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-2)', fontSize: 14 }}>{apartments.length} unidade(s)</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary hide-on-mobile" onClick={openCreate}><Plus size={16} /> Novo Apartamento</button>
        </div>
      </div>

      <button className="fab" onClick={openCreate}><Plus size={22} /></button>

      {apartments.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Building2 size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3, color: 'var(--text-3)' }} />
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-2)' }}>Nenhum apartamento cadastrado</div>
          <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Toque no + para adicionar</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
          gap: 20,
          alignItems: 'start'
        }}>
          {apartments.map(apt => <ApartmentCard key={apt.id} apt={apt} onEdit={openEdit} onDelete={setDeleting} />)}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? 'Editar Apartamento' : 'Novo Apartamento'} onClose={() => setShowForm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Número *</label><input className="input" placeholder="101" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} /></div>
              <div><label className="label">Bloco (opcional)</label><input className="input" placeholder="A" value={form.block} onChange={e => setForm(f => ({ ...f, block: e.target.value }))} /></div>
            </div>
            <div><label className="label">Responsável (opcional)</label><input className="input" placeholder="Nome do morador" value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} /></div>
            <div><label className="label">Observação (opcional)</label><textarea className="input" placeholder="Notas..." rows={3} value={form.observation} onChange={e => setForm(f => ({ ...f, observation: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            {!editing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--water-light)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--water)' }}>
                <ShieldCheck size={14} />Senha gerada e protegida — você a verá uma única vez.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn-primary" onClick={save} disabled={loading}>
                {loading
                  ? <><Spinner size={14} color="white" />{editing ? 'Atualizando...' : 'Cadastrando...'}</>
                  : editing ? 'Atualizar' : 'Cadastrar'
                }
              </button>
            </div>
          </div>
        </Modal>
      )}

      {newAptPassword && pendingAptData && (
        <OneTimePasswordModal
          password={newAptPassword}
          onConfirm={confirmNewApartment}
          onCancel={() => { setNewAptPassword(null); setPendingAptData(null) }}
        />
      )}

      {deleting && (
        <ConfirmDialog message={`Remover o apartamento ${deleting.number}? Esta ação não pode ser desfeita.`} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
      )}
    </div>
  )
}
