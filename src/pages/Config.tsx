import { useState, useEffect } from 'react'
import { Save, Droplets, Flame, Building2, Moon, Sun, Info, Calculator, Shield, Bell, Phone, User, MapPin, AlertCircle, Mail, Calendar, LogOut } from 'lucide-react'
import { useAppStore, useUIStore } from '../store'
import { configRepo } from '../lib/container'
import { useToast } from '../components/ui/Toast'
import { friendlyError } from '../lib/friendlyError'
import { ConfigSkeleton, Spinner } from '../components/ui/Skeleton'
import { auth } from '../infrastructure/firebase'
import { signOut } from 'firebase/auth'

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2)  return digits.length ? `(${digits}` : ''
  if (digits.length <= 6)  return `(${digits.slice(0,2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
}

function maskRate(value: string): string {
  return value.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./, '$1')
}

interface FormErrors {
  condominiumName?: string
  managerPhone?: string
  managerEmail?: string
  waterRate?: string
  gasRate?: string
  reportDay?: string
}

export function Config() {
  const { config, readings, apartments } = useAppStore()
  const { toast } = useToast()
  const { darkMode, setDarkMode } = useUIStore()
  const [form, setForm] = useState({
    waterRate: '0.033',
    gasRate: '0.033',
    condominiumName: '',
    managerName: '',
    managerPhone: '',
    managerEmail: '',
    address: '',
    reportDay: '1',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)

  async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
      const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
      const data = await res.json()
      if (data.length > 0) return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) }
    } catch {}
    return null
  }

  useEffect(() => {
    if (config) setForm({
      waterRate:    config.waterRate.toString(),
      gasRate:      config.gasRate.toString(),
      condominiumName: config.condominiumName,
      managerName:  config.managerName  ?? '',
      managerPhone: config.managerPhone ?? '',
      managerEmail: config.managerEmail ?? '',
      address:      config.address      ?? '',
      reportDay:    String(config.reportDay ?? 1),
    })
  }, [config])

  if (!config) return <ConfigSkeleton />

  function validate(): FormErrors {
    const errs: FormErrors = {}
    if (!form.condominiumName.trim()) errs.condominiumName = 'Nome do condomínio é obrigatório'
    const phone = form.managerPhone.replace(/\D/g, '')
    if (phone && phone.length < 10) errs.managerPhone = 'Telefone incompleto (mín. 10 dígitos)'
    if (form.managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.managerEmail))
      errs.managerEmail = 'Email inválido'
    const wr = parseFloat(form.waterRate)
    if (!form.waterRate || isNaN(wr) || wr <= 0) errs.waterRate = 'Informe um valor maior que zero'
    const gr = parseFloat(form.gasRate)
    if (!form.gasRate || isNaN(gr) || gr <= 0) errs.gasRate = 'Informe um valor maior que zero'
    const rd = parseInt(form.reportDay)
    if (isNaN(rd) || rd < 1 || rd > 28) errs.reportDay = 'Informe um dia entre 1 e 28'
    return errs
  }

  const save = async () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    const waterRate = parseFloat(form.waterRate)
    const gasRate   = parseFloat(form.gasRate)
    const reportDay = parseInt(form.reportDay)
    setLoading(true)
    try {
      let coords: { latitude: number; longitude: number } | null = null
      if (form.address.trim()) {
        setGeocoding(true)
        coords = await geocodeAddress(form.address.trim())
        setGeocoding(false)
      }
      await configRepo.update({
        waterRate, gasRate, condominiumName: form.condominiumName.trim(), reportDay,
        ...(form.managerName.trim()  && { managerName:  form.managerName.trim() }),
        ...(form.managerPhone.trim() && { managerPhone: form.managerPhone.trim() }),
        ...(form.managerEmail.trim() && { managerEmail: form.managerEmail.trim() }),
        ...(form.address.trim()      && { address:      form.address.trim() }),
        ...(coords && { latitude: coords.latitude, longitude: coords.longitude }),
      })
      toast('Configurações salvas!')
    } catch (e: any) { toast(friendlyError(e), 'error') }
    setLoading(false)
  }

  const waterPreview = (10 * parseFloat(form.waterRate || '0')).toFixed(2)
  const gasPreview   = (10 * parseFloat(form.gasRate   || '0')).toFixed(2)
  const waterRate    = parseFloat(form.waterRate || '0')
  const gasRate      = parseFloat(form.gasRate   || '0')

  const closedReadings  = readings.filter(r => r.closedAt)
  const totalWaterCost  = closedReadings.filter(r => r.type === 'water').reduce((a, r) => a + (r.totalCost ?? 0), 0)
  const totalGasCost    = closedReadings.filter(r => r.type === 'gas').reduce((a, r) => a + (r.totalCost ?? 0), 0)
  const totalWaterM3    = closedReadings.filter(r => r.type === 'water').reduce((a, r) => a + (r.consumption ?? 0), 0)
  const totalGasM3      = closedReadings.filter(r => r.type === 'gas').reduce((a, r) => a + (r.consumption ?? 0), 0)
  const activeApts      = apartments.filter(a => a.active).length

  return (
    <div className="page">

      {/* ── Page header ── */}
      <div className="config-page-header">
        <h1 className="page-title">Configurações</h1>
        <p className="page-subtitle">Gerencie as tarifas e preferências do sistema</p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="config-layout">

        {/* ── LEFT: forms ── */}
        <div className="config-left-col">

          {/* Condomínio */}
          <Section
            icon={<Building2 size={16} color="#7c3aed" />}
            iconBg="rgba(124,58,237,0.1)"
            title="Condomínio"
            description="Dados gerais do condomínio"
          >
            <div className="config-form-col">
              <div>
                <label className="label">Nome do condomínio <span className="config-required-star">*</span></label>
                <input
                  className="input"
                  value={form.condominiumName}
                  onChange={e => { setForm(f => ({ ...f, condominiumName: e.target.value })); setErrors(v => ({ ...v, condominiumName: undefined })) }}
                  placeholder="Ex: Condomínio Residencial das Flores"
                  style={errors.condominiumName ? { borderColor: '#dc2626' } : {}}
                />
                {errors.condominiumName && <FieldError msg={errors.condominiumName} />}
              </div>
              <div className="config-grid-auto">
                <div>
                  <label className="label">Nome do síndico</label>
                  <div className="config-input-icon-wrap">
                    <User size={13} className="config-input-icon config-input-icon-center" />
                    <input
                      className="input config-input-pl"
                      value={form.managerName}
                      onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))}
                      placeholder="Nome completo"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Telefone</label>
                  <div className="config-input-icon-wrap">
                    <Phone size={13} className={`config-input-icon ${errors.managerPhone ? 'config-input-icon-top' : 'config-input-icon-center'}`} />
                    <input
                      className="input config-input-pl"
                      value={form.managerPhone}
                      onChange={e => { setForm(f => ({ ...f, managerPhone: maskPhone(e.target.value) })); setErrors(v => ({ ...v, managerPhone: undefined })) }}
                      placeholder="(47) 99999-9999"
                      inputMode="tel"
                      style={errors.managerPhone ? { borderColor: '#dc2626' } : {}}
                    />
                  </div>
                  {errors.managerPhone && <FieldError msg={errors.managerPhone} />}
                </div>
              </div>
              <div>
                <label className="label">Endereço</label>
                <div className="config-input-icon-wrap">
                  <MapPin size={13} className="config-input-icon config-input-icon-top" />
                  <input
                    className="input config-input-pl"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="R. Orestes Figueiredo, 110 — Balneário Piçarras, SC"
                  />
                </div>
              </div>
            </div>
          </Section>

          <Divider />

          {/* Relatório mensal */}
          <Section
            icon={<Mail size={16} color="#10b981" />}
            iconBg="rgba(16,185,129,0.1)"
            title="Relatório mensal"
            description="Receba um resumo de consumo por e-mail todo mês"
          >
            <div className="config-form-col">
              <div>
                <label className="label">E-mail do síndico</label>
                <div className="config-input-icon-wrap">
                  <Mail size={13} className={`config-input-icon ${errors.managerEmail ? 'config-input-icon-top' : 'config-input-icon-center'}`} />
                  <input
                    className="input config-input-pl"
                    type="email"
                    inputMode="email"
                    value={form.managerEmail}
                    onChange={e => { setForm(f => ({ ...f, managerEmail: e.target.value })); setErrors(v => ({ ...v, managerEmail: undefined })) }}
                    placeholder="sindico@email.com"
                    style={errors.managerEmail ? { borderColor: '#dc2626' } : {}}
                  />
                </div>
                {errors.managerEmail && <FieldError msg={errors.managerEmail} />}
              </div>
              <div>
                <label className="label">
                  Dia do envio{' '}
                  <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(1–28 de cada mês)</span>
                </label>
                <div className="config-input-icon-wrap">
                  <Calendar size={13} className={`config-input-icon ${errors.reportDay ? 'config-input-icon-top' : 'config-input-icon-center'}`} />
                  <input
                    className="input config-input-pl"
                    type="number"
                    inputMode="numeric"
                    min={1} max={28}
                    value={form.reportDay}
                    onChange={e => { setForm(f => ({ ...f, reportDay: e.target.value })); setErrors(v => ({ ...v, reportDay: undefined })) }}
                    style={{ maxWidth: 120, ...(errors.reportDay ? { borderColor: '#dc2626' } : {}) }}
                  />
                </div>
                {errors.reportDay && <FieldError msg={errors.reportDay} />}
                <div className="config-report-hint" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                  O relatório do mês anterior será enviado todo dia{' '}
                  <strong style={{ color: '#10b981' }}>{form.reportDay || '1'}</strong> às 08h00 (horário de Brasília).
                </div>
              </div>
            </div>
          </Section>

          <Divider />

          {/* Tarifas */}
          <Section
            icon={<Droplets size={16} color="var(--water)" />}
            iconBg="var(--water-light)"
            title="Tarifas"
            description="Custo por m³ para cada serviço"
          >
            <div className="config-form-col">
              <div className="config-tariff-grid">

                {/* Água */}
                <div>
                  <div className="config-tariff-header">
                    <div className="config-tariff-icon" style={{ background: 'var(--water-light)' }}>
                      <Droplets size={12} color="var(--water)" />
                    </div>
                    <span className="config-tariff-name">Água</span>
                  </div>
                  <label className="label">Valor por m³ (R$)</label>
                  <input
                    className="input"
                    type="text" inputMode="decimal"
                    value={form.waterRate}
                    onChange={e => { setForm(f => ({ ...f, waterRate: maskRate(e.target.value) })); setErrors(v => ({ ...v, waterRate: undefined })) }}
                    style={errors.waterRate ? { borderColor: '#dc2626' } : {}}
                  />
                  {errors.waterRate && <FieldError msg={errors.waterRate} />}
                  <PreviewBadge color="var(--water)" bg="var(--water-light)" preview={waterPreview} rate={form.waterRate} />
                </div>

                {/* Gás */}
                <div>
                  <div className="config-tariff-header">
                    <div className="config-tariff-icon" style={{ background: 'var(--gas-light)' }}>
                      <Flame size={12} color="var(--gas)" />
                    </div>
                    <span className="config-tariff-name">Gás</span>
                  </div>
                  <label className="label">Valor por m³ (R$)</label>
                  <input
                    className="input"
                    type="text" inputMode="decimal"
                    value={form.gasRate}
                    onChange={e => { setForm(f => ({ ...f, gasRate: maskRate(e.target.value) })); setErrors(v => ({ ...v, gasRate: undefined })) }}
                    style={errors.gasRate ? { borderColor: '#dc2626' } : {}}
                  />
                  {errors.gasRate && <FieldError msg={errors.gasRate} />}
                  <PreviewBadge color="var(--gas)" bg="var(--gas-light)" preview={gasPreview} rate={form.gasRate} />
                </div>
              </div>

              {/* Fórmula hint */}
              <div className="config-formula-hint">
                <Info size={13} color="var(--text-3)" className="config-formula-hint-icon" />
                <span>
                  <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Cálculo:</strong>{' '}
                  Consumo = Leitura final − Leitura inicial &nbsp;·&nbsp; Custo = Consumo × Tarifa
                </span>
              </div>
            </div>
          </Section>

          <Divider />

          {/* Aparência */}
          <Section
            icon={darkMode ? <Moon size={16} color="#818cf8" /> : <Sun size={16} color="#f59e0b" />}
            iconBg={darkMode ? 'rgba(129,140,248,0.15)' : 'rgba(245,158,11,0.12)'}
            title="Aparência"
            description="Tema visual da interface"
          >
            <div className="config-appearance-row">
              <div>
                <div className="config-appearance-label">
                  {darkMode ? 'Modo escuro' : 'Modo claro'}
                </div>
                <div className="config-appearance-sub">
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

          {/* Save */}
          <div className="config-save-wrap">
            <button className="btn-primary config-save-btn" onClick={save} disabled={loading}>
              {loading ? (
                <><Spinner size={15} color="white" />{geocoding ? 'Buscando localização...' : 'Salvando...'}</>
              ) : (
                <><Save size={15} />Salvar configurações</>
              )}
            </button>
          </div>

          {/* Logout — visível apenas no mobile (sidebar já tem no desktop) */}
          <div className="show-on-mobile config-logout-mobile-wrap">
            <button
              className="config-logout-mobile-btn"
              onClick={() => signOut(auth)}
            >
              <LogOut size={13} />
              Sair da conta
            </button>
          </div>

        </div>

        {/* ── RIGHT: info panels ── */}
        <div className="config-right-col">

          {/* Simulador */}
          <div className="card config-info-card">
            <div className="config-info-card-header">
              <div className="config-info-card-icon" style={{ background: 'rgba(8,145,178,0.1)' }}>
                <Calculator size={15} color="#0891b2" />
              </div>
              <span className="config-info-card-title">Simulador de tarifa</span>
            </div>
            <div className="config-sim-list">
              {[5, 10, 20, 50].map(m3 => (
                <div key={m3} className="config-sim-row">
                  <span className="config-sim-m3">{m3} m³</span>
                  <div className="config-sim-prices">
                    <span className="config-sim-water">💧 R$ {(m3 * waterRate).toFixed(2)}</span>
                    <span className="config-sim-gas">🔥 R$ {(m3 * gasRate).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumo do sistema */}
          <div className="card config-info-card">
            <div className="config-info-card-header">
              <div className="config-info-card-icon" style={{ background: 'rgba(124,58,237,0.1)' }}>
                <Shield size={15} color="#7c3aed" />
              </div>
              <span className="config-info-card-title">Resumo do sistema</span>
            </div>
            <div className="config-summary-list">
              {[
                { label: 'Apartamentos ativos', value: String(activeApts), color: 'var(--text)' },
                { label: 'Total leituras', value: String(closedReadings.length), color: 'var(--text)' },
                { label: 'Volume água (total)', value: `${totalWaterM3.toFixed(1)} m³`, color: 'var(--water)' },
                { label: 'Volume gás (total)', value: `${totalGasM3.toFixed(1)} m³`, color: 'var(--gas)' },
                { label: 'Faturado água', value: `R$ ${totalWaterCost.toFixed(2)}`, color: 'var(--water)' },
                { label: 'Faturado gás', value: `R$ ${totalGasCost.toFixed(2)}`, color: 'var(--gas)' },
                { label: 'Total geral', value: `R$ ${(totalWaterCost + totalGasCost).toFixed(2)}`, color: 'var(--text)' },
              ].map(({ label, value, color }) => (
                <div key={label} className="config-summary-row">
                  <span className="config-summary-label">{label}</span>
                  <span className="config-summary-value" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tarifas salvas */}
          <div className="card config-info-card">
            <div className="config-info-card-header">
              <div className="config-info-card-icon" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <Bell size={15} color="#10b981" />
              </div>
              <span className="config-info-card-title">Tarifas salvas</span>
            </div>
            <div className="config-rates-row">
              <div className="config-rate-card config-rate-card-water">
                <div className="config-rate-header">
                  <Droplets size={13} color="var(--water)" />
                  <span className="config-rate-label" style={{ color: 'var(--water)' }}>Água</span>
                </div>
                <div className="config-rate-value" style={{ color: 'var(--water)' }}>
                  R$ {config.waterRate.toFixed(4)}
                </div>
                <div className="config-rate-unit" style={{ color: 'var(--water)' }}>por m³</div>
              </div>
              <div className="config-rate-card config-rate-card-gas">
                <div className="config-rate-header">
                  <Flame size={13} color="var(--gas)" />
                  <span className="config-rate-label" style={{ color: 'var(--gas)' }}>Gás</span>
                </div>
                <div className="config-rate-value" style={{ color: 'var(--gas)' }}>
                  R$ {config.gasRate.toFixed(4)}
                </div>
                <div className="config-rate-unit" style={{ color: 'var(--gas)' }}>por m³</div>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg: string }) {
  return (
    <div className="config-field-error">
      <AlertCircle size={11} />
      <span>{msg}</span>
    </div>
  )
}

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
    <div className="config-section-row config-section-row-inner">
      <div>
        <div className="config-section-title-row">
          <div className="config-section-icon-wrap" style={{ background: iconBg }}>
            {icon}
          </div>
          <span className="config-section-title-text">{title}</span>
        </div>
        <p className="config-section-description">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}

function Divider() {
  return <div className="config-divider" />
}

function PreviewBadge({ color, bg, preview, rate }: { color: string; bg: string; preview: string; rate: string }) {
  return (
    <div className="config-preview-badge" style={{ background: bg }}>
      Exemplo: 10 m³ × R$ {rate || '0'}/m³ ={' '}
      <strong style={{ color, fontWeight: 700 }}>R$ {preview}</strong>
    </div>
  )
}
