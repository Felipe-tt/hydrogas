import { useState, useEffect } from 'react'
import { Save, Droplets, Flame, Building2, Moon, Sun, Info } from 'lucide-react'
import { useAppStore, useUIStore } from '../store'
import { configRepo } from '../lib/container'
import { useToast } from '../components/ui/Toast'
import { friendlyError } from '../lib/friendlyError'
import { ConfigSkeleton, Spinner } from '../components/ui/Skeleton'

export function Config() {
  const { config } = useAppStore()
  const { toast } = useToast()
  const { darkMode, setDarkMode } = useUIStore()
  const [form, setForm] = useState({ waterRate: '0.033', gasRate: '0.033', condominiumName: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (config) setForm({
      waterRate: config.waterRate.toString(),
      gasRate: config.gasRate.toString(),
      condominiumName: config.condominiumName,
    })
  }, [config])

  // Skeleton enquanto config ainda não chegou do Firebase
  if (!config) return <ConfigSkeleton />

  const save = async () => {
    const waterRate = parseFloat(form.waterRate)
    const gasRate   = parseFloat(form.gasRate)
    if (isNaN(waterRate) || waterRate <= 0) { toast('Tarifa de água inválida', 'error'); return }
    if (isNaN(gasRate)   || gasRate   <= 0) { toast('Tarifa de gás inválida', 'error');  return }
    if (!form.condominiumName.trim())        { toast('Nome do condomínio obrigatório', 'error'); return }
    setLoading(true)
    try {
      await configRepo.update({ waterRate, gasRate, condominiumName: form.condominiumName.trim() })
      toast('Configurações salvas!')
    } catch (e: any) { toast(friendlyError(e), 'error') }
    setLoading(false)
  }

  const waterPreview = (10 * parseFloat(form.waterRate || '0')).toFixed(2)
  const gasPreview   = (10 * parseFloat(form.gasRate   || '0')).toFixed(2)

  return (
    <div className="page" style={{ maxWidth: 720 }}>

      {/* ── Page header ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Configurações</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-2)', fontSize: 14 }}>
          Gerencie as tarifas e preferências do sistema
        </p>
      </div>

      {/* ── Section: Condomínio ───────────────────────────────────── */}
      <Section
        icon={<Building2 size={16} color="#7c3aed" />}
        iconBg="rgba(124,58,237,0.1)"
        title="Condomínio"
        description="Dados gerais do condomínio"
      >
        <div>
          <label className="label">Nome do condomínio</label>
          <input
            className="input"
            value={form.condominiumName}
            onChange={e => setForm(f => ({ ...f, condominiumName: e.target.value }))}
            placeholder="Ex: Condomínio Residencial das Flores"
          />
        </div>
      </Section>

      <Divider />

      {/* ── Section: Tarifas ─────────────────────────────────────── */}
      <Section
        icon={<Droplets size={16} color="var(--water)" />}
        iconBg="var(--water-light)"
        title="Tarifas"
        description="Custo por m³ para cada serviço"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>

          {/* Água */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--water-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Droplets size={12} color="var(--water)" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Água</span>
            </div>
            <label className="label">Valor por m³ (R$)</label>
            <input
              className="input"
              type="number" inputMode="decimal" step="0.0001" min="0"
              value={form.waterRate}
              onChange={e => setForm(f => ({ ...f, waterRate: e.target.value }))}
            />
            <PreviewBadge color="var(--water)" bg="var(--water-light)" preview={waterPreview} rate={form.waterRate} />
          </div>

          {/* Gás */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--gas-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Flame size={12} color="var(--gas)" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Gás</span>
            </div>
            <label className="label">Valor por m³ (R$)</label>
            <input
              className="input"
              type="number" inputMode="decimal" step="0.0001" min="0"
              value={form.gasRate}
              onChange={e => setForm(f => ({ ...f, gasRate: e.target.value }))}
            />
            <PreviewBadge color="var(--gas)" bg="var(--gas-light)" preview={gasPreview} rate={form.gasRate} />
          </div>
        </div>

        {/* Fórmula hint */}
        <div style={{
          marginTop: 14,
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '10px 13px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 9,
          fontSize: 12,
          color: 'var(--text-2)',
          lineHeight: 1.6,
        }}>
          <Info size={13} color="var(--text-3)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Cálculo:</strong>{' '}
            Consumo = Leitura final − Leitura inicial &nbsp;·&nbsp; Custo = Consumo × Tarifa
          </span>
        </div>
      </Section>

      <Divider />

      {/* ── Section: Aparência ───────────────────────────────────── */}
      <Section
        icon={darkMode ? <Moon size={16} color="#818cf8" /> : <Sun size={16} color="#f59e0b" />}
        iconBg={darkMode ? 'rgba(129,140,248,0.15)' : 'rgba(245,158,11,0.12)'}
        title="Aparência"
        description="Tema visual da interface"
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
              {darkMode ? 'Modo escuro' : 'Modo claro'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              {darkMode ? 'Interface com fundo escuro' : 'Interface com fundo claro'}
            </div>
          </div>
          <label className="dark-toggle" title="Alternar modo escuro">
            <input type="checkbox" checked={darkMode} onChange={e => setDarkMode(e.target.checked)} />
            <span className="dark-toggle-track" />
            <span className="dark-toggle-thumb" />
          </label>
        </div>
      </Section>

      <Divider />

      {/* ── Save bar ─────────────────────────────────────────────── */}
      <div style={{ paddingTop: 4, paddingBottom: 8, display: 'flex', justifyContent: 'center' }}>
        <button
          className="btn-primary"
          onClick={save}
          disabled={loading}
          style={{
            fontSize: 14,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: 'stretch',
            justifyContent: 'center',
            minHeight: 42,
          }}
        >
          {loading ? (
            <>
              <Spinner size={15} color="white" />
              Salvando...
            </>
          ) : (
            <>
              <Save size={15} />
              Salvar configurações
            </>
          )}
        </button>
      </div>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  icon, iconBg, title, description, children,
}: {
  icon: React.ReactNode
  iconBg: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, alignItems: 'start', padding: '4px 0' }}>

      {/* Left: label column */}
      <div style={{ paddingTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {icon}
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        </div>
        <p style={{ margin: '0 0 0 37px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{description}</p>
      </div>

      {/* Right: fields */}
      <div>{children}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '24px 0' }} />
}

function PreviewBadge({ color, bg, preview, rate }: { color: string; bg: string; preview: string; rate: string }) {
  return (
    <div style={{
      marginTop: 9,
      padding: '8px 12px',
      background: bg,
      borderRadius: 8,
      fontSize: 12,
      color: 'var(--text-2)',
      lineHeight: 1.5,
    }}>
      Exemplo: 10 m³ × R$ {rate || '0'}/m³ ={' '}
      <strong style={{ color, fontWeight: 700 }}>R$ {preview}</strong>
    </div>
  )
}
