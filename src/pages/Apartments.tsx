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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
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

// ── Modal de senha one-time ────────────────────────────────────────────────────

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
    try { await onConfirm() } finally { setSaving(false) }
  }

  return (
    <Modal title="Senha gerada — copie agora!" onClose={saving ? undefined : onCancel}>
      <div className="modal-form">
        <div className="otp-warning">
          <ShieldCheck size={15} style={{ flexShrink: 0 }} />
          ⚠️ Esta senha será mostrada apenas UMA vez. Copie agora e entregue ao morador — depois não será mais possível ver a senha original.
        </div>

        <div className="otp-password-row">
          <span className="otp-password-text">{password}</span>
          <button
            onClick={copy}
            disabled={saving}
            className={`otp-copy-btn${copied ? ' copied' : ''}`}
          >
            {copied ? <><Check size={13} /> Copiada!</> : <><Copy size={13} /> Copiar</>}
          </button>
        </div>

        <div className="otp-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={saving}
            style={{ opacity: saving ? 0.5 : 1 }}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleConfirm} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190 }}>
            {saving ? (
              <><Spinner size={14} color="white" />Salvando com segurança...</>
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
  const [copiedLink, setCopiedLink]             = useState(false)
  const [regenerating, setRegenerating]         = useState(false)
  const [showQR, setShowQR]                     = useState(false)
  const [pendingPassword, setPendingPassword]   = useState<string | null>(null)
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
      <div className="card fade-up apt-card-body">
        {/* Header row */}
        <div className="apt-card-header-row">
          <div className="apt-card-header-left">
            <div className="apt-card-icon">
              <Building2 size={18} color="var(--water)" />
            </div>
            <div>
              <div className="apt-card-number">Ap. {apt.number}</div>
              {apt.block && <div className="apt-card-block">Bloco {apt.block}</div>}
            </div>
          </div>
          <div className="apt-card-actions-top">
            <button onClick={() => onEdit(apt)} className="apt-card-btn-edit" title="Editar"><Pencil size={14} /></button>
            <button onClick={() => onDelete(apt)} className="apt-card-btn-delete" title="Remover"><Trash2 size={14} /></button>
          </div>
        </div>

        {/* Conteúdo principal */}
        <div className="apt-card-content">
          {(apt.responsible || apt.observation) && (
            <div className="apt-card-info">
              {apt.responsible && (
                <div className="apt-card-info-row">
                  <User size={13} color="var(--text-3)" />{apt.responsible}
                </div>
              )}
              {apt.observation && (
                <div className="apt-card-info-obs">
                  <FileText size={13} color="var(--text-3)" style={{ marginTop: 2 }} />{apt.observation}
                </div>
              )}
            </div>
          )}

          {/* Senha de acesso */}
          <div className="apt-card-section">
            <div className="apt-card-section-label">
              <KeyRound size={13} color="var(--text-3)" />
              <span className="apt-card-section-label-text">SENHA DO MORADOR</span>
            </div>

            {apt.accessPasswordHash ? (
              <div className="apt-password-row">
                <div className="apt-password-protected">
                  <ShieldCheck size={13} color="var(--water)" style={{ flexShrink: 0 }} />
                  <span className="apt-password-protected-text">Senha protegida</span>
                </div>
                <button onClick={() => setConfirmRegenPass(true)} title="Gerar nova senha" className="apt-icon-btn">
                  <RefreshCw size={13} />
                </button>
              </div>
            ) : (
              <button onClick={startPasswordRegenerate} className="apt-generate-btn">
                <KeyRound size={13} />Gerar senha de acesso
              </button>
            )}
          </div>

          {/* Link do morador */}
          <div className="apt-card-section">
            <div className="apt-card-section-label">
              <Link2 size={13} color="var(--text-3)" />
              <span className="apt-card-section-label-text">LINK DO MORADOR</span>
            </div>

            {link ? (
              <div className="apt-link-row">
                <button onClick={copyLink} title="Clique para copiar"
                  className={`apt-link-copy-btn${copiedLink ? ' copied' : ''}`}>
                  {copiedLink
                    ? <Check size={13} color="#16a34a" style={{ flexShrink: 0 }} />
                    : <Copy size={13} color="var(--text-3)" style={{ flexShrink: 0 }} />}
                  <span className={`apt-link-text${copiedLink ? ' copied' : ''}`}>
                    {copiedLink ? 'Copiado!' : link}
                  </span>
                </button>
                <button onClick={() => setShowQR(true)} title="Ver QR Code" className="apt-icon-btn">
                  <QrCode size={13} />
                </button>
                <a href={link} target="_blank" rel="noopener noreferrer" title="Abrir link" className="apt-link-anchor">
                  <ExternalLink size={13} />
                </a>
                <button onClick={() => setConfirmRegenLink(true)} disabled={regenerating}
                  title="Gerar novo link (invalida o anterior)" className="apt-icon-btn">
                  <RefreshCw size={13} style={{ animation: regenerating ? 'spin 1s linear infinite' : 'none' }} />
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmRegenLink(true)} disabled={regenerating} className="apt-generate-btn">
                <Link2 size={13} />{regenerating ? 'Gerando...' : 'Gerar link de acesso'}
              </button>
            )}
          </div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

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
        const plain = generatePlainPassword()
        const baseData = sanitize({ number: form.number.trim(), block: form.block || null, responsible: form.responsible || null, observation: form.observation || null, active: true, publicToken: generateToken() })
        setNewAptPassword(plain)
        setPendingAptData(baseData)
        setShowForm(false)
      }
    } catch (e: any) { toast(friendlyError(e), 'error') }
    setLoading(false)
  }

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
      {/* FAB mobile */}
      <button className="fab" onClick={openCreate} aria-label="Novo Apartamento">
        <Plus size={22} />
      </button>

      <div className="page-header">
        <div>
          <h1 className="page-title">Apartamentos</h1>
          <p className="page-subtitle">{apartments.length} unidade(s)</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary hide-on-mobile" onClick={openCreate}>
            <Plus size={16} /> Novo Apartamento
          </button>
        </div>
      </div>

      {apartments.length === 0 ? (
        <div className="card apt-empty-state">
          <Building2 size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3, color: 'var(--text-3)' }} />
          <div className="apt-empty-title">Nenhum apartamento cadastrado</div>
          <div className="apt-empty-sub">Toque no + para adicionar</div>
        </div>
      ) : (
        <div className="apt-grid">
          {apartments.map(apt => <ApartmentCard key={apt.id} apt={apt} onEdit={openEdit} onDelete={setDeleting} />)}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? 'Editar Apartamento' : 'Novo Apartamento'} onClose={() => setShowForm(false)}>
          <div className="modal-form">
            <div className="modal-form-grid-2">
              <div><label className="label">Número *</label><input className="input" placeholder="101" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} /></div>
              <div><label className="label">Bloco (opcional)</label><input className="input" placeholder="A" value={form.block} onChange={e => setForm(f => ({ ...f, block: e.target.value }))} /></div>
            </div>
            <div><label className="label">Responsável (opcional)</label><input className="input" placeholder="Nome do morador" value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} /></div>
            <div><label className="label">Observação (opcional)</label><textarea className="input" placeholder="Notas..." rows={3} value={form.observation} onChange={e => setForm(f => ({ ...f, observation: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            {!editing && (
              <div className="modal-info-note">
                <ShieldCheck size={14} />Senha gerada e protegida — você a verá uma única vez.
              </div>
            )}
            <div className="modal-actions">
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
