import { useState, useEffect } from 'react'
import { Save, Droplets, Flame, Building2, Moon, Sun, Info, Calculator, Shield, Bell, Phone, User, MapPin, AlertCircle, Mail, Calendar } from 'lucide-react'
import { useAppStore, useUIStore } from '../store'
import { configRepo } from '../lib/container'
import { useToast } from '../components/ui/Toast'
import { friendlyError } from '../lib/friendlyError'
import { ConfigSkeleton, Spinner } from '../components/ui/Skeleton'

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2)  return digits.length ? `(${digits}` : ''
  if (digits.length <= 6)  return `(${digits.slice(0,2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
}

function maskRate(value: string): string {
  return value.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
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
    latitude: '',
    longitude: '',
    reportDay: '1',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (config) setForm({
      waterRate:    config.waterRate.toString(),
      gasRate:      config.gasRate.toString(),
      condominiumName: config.condominiumName,
      managerName:  config.managerName  ?? '',
      managerPhone: config.managerPhone ?? '',
      managerEmail: config.managerEmail ?? '',
      address:      config.address      ?? '',
      latitude:     config.latitude  != null ? String(config.latitude)  : '',
      longitude:    config.longitude != null ? String(config.longitude) : '',
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
      await configRepo.update({
        waterRate,
        gasRate,
        condominiumName: form.condominiumName.trim(),
        reportDay,
        ...(form.managerName.trim()  && { managerName:  form.managerName.trim() }),
        ...(form.managerPhone.trim() && { managerPhone: form.managerPhone.trim() }),
        ...(form.managerEmail.trim() && { managerEmail: form.managerEmail.trim() }),
        ...(form.address.trim()      && { address:      form.address.trim() }),
        ...(form.latitude.trim()  && !isNaN(parseFloat(form.latitude))  && { latitude:  parseFloat(form.latitude) }),
        ...(form.longitude.trim() && !isNaN(parseFloat(form.longitude)) && { longitude: parseFloat(form.longitude) }),
      })
      toast('Configurações salvas!')
    } catch (e: any) { toast(friendlyError(e), 'error') }
    setLoading(false)
  }

  const waterPreview  = (10 * parseFloat(form.waterRate || '0')).toFixed(2)
  const gasPreview    = (10 * parseFloat(form.gasRate   || '0')).toFixed(2)
  const waterRate     = parseFloat(form.waterRate || '0')
  const gasRate       = parseFloat(form.gasRate   || '0')

  const closedReadings   = readings.filter(r => r.closedAt)
  const totalWaterCost   = closedReadings.filter(r => r.type === 'water').reduce((a, r) => a + (r.totalCost ?? 0), 0)
  const totalGasCost     = closedReadings.filter(r => r.type === 'gas').reduce((a, r) => a + (r.totalCost ?? 0), 0)
  const totalWaterM3     = closedReadings.filter(r => r.type === 'water').reduce((a, r) => a + (r.consumption ?? 0), 0)
  const totalGasM3       = closedReadings.filter(r => r.type === 'gas').reduce((a, r) => a + (r.consumption ?? 0), 0)
  const activeApts       = apartments.filter(a => a.active).length

  return (
    <div className="page">

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Configurações</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-2)', fontSize: 14 }}>
          Gerencie as tarifas e preferências do sistema
        </p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="config-layout">

        {/* ── LEFT: forms ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Condomínio */}
          <Section
            icon={<Building2 size={16} color="#7c3aed" />}
            iconBg="rgba(124,58,237,0.1)"
            title="Condomínio"
            description="Dados gerais do condomínio"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Nome do condomínio <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  className="input"
                  value={form.condominiumName}
                  onChange={e => { setForm(f => ({ ...f, condominiumName: e.target.value })); setErrors(v => ({ ...v, condominiumName: undefined })) }}
                  placeholder="Ex: Condomínio Residencial das Flores"
                  style={errors.condominiumName ? { borderColor: '#dc2626' } : {}}
                />
                {errors.condominiumName && <FieldError msg={errors.condominiumName} />}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div>
                  <label className="label">Nome do síndico</label>
                  <div style={{ position: 'relative' }}>
                    <User size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input
                      className="input"
                      value={form.managerName}
                      onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))}
                      placeholder="Nome completo"
                      style={{ paddingLeft: 32 }}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Telefone</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={13} style={{ position: 'absolute', left: 11, top: errors.managerPhone ? 13 : '50%', transform: errors.managerPhone ? 'none' : 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input
                      className="input"
                      value={form.managerPhone}
                      onChange={e => { setForm(f => ({ ...f, managerPhone: maskPhone(e.target.value) })); setErrors(v => ({ ...v, managerPhone: undefined })) }}
                      placeholder="(47) 99999-9999"
                      inputMode="tel"
                      style={{ paddingLeft: 32, ...(errors.managerPhone ? { borderColor: '#dc2626' } : {}) }}
                    />
                  </div>
                  {errors.managerPhone && <FieldError msg={errors.managerPhone} />}
                </div>
              </div>
              <div>
                <label className="label">Endereço</label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={13} style={{ position: 'absolute', left: 11, top: 13, color: 'var(--text-3)', pointerEvents: 'none' }} />
                  <input
                    className="input"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="R. Orestes Figueiredo, 110 — Balneário Piçarras, SC"
                    style={{ paddingLeft: 32 }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="label">Latitude</label>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                    placeholder="-26.763457"
                  />
                </div>
                <div>
                  <label className="label">Longitude</label>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                    placeholder="-48.674538"
                  />
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
                Coordenadas usadas no mapa da área do morador. Obtenha em{' '}
                <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--water)' }}>maps.google.com</a>
                {' '}clicando com botão direito no local.
              </p>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">E-mail do síndico</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={13} style={{ position: 'absolute', left: 11, top: errors.managerEmail ? 13 : '50%', transform: errors.managerEmail ? 'none' : 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                  <input
                    className="input"
                    type="email"
                    inputMode="email"
                    value={form.managerEmail}
                    onChange={e => { setForm(f => ({ ...f, managerEmail: e.target.value })); setErrors(v => ({ ...v, managerEmail: undefined })) }}
                    placeholder="sindico@email.com"
                    style={{ paddingLeft: 32, ...(errors.managerEmail ? { borderColor: '#dc2626' } : {}) }}
                  />
                </div>
                {errors.managerEmail && <FieldError msg={errors.managerEmail} />}
              </div>
              <div>
                <label className="label">Dia do envio <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(1–28 de cada mês)</span></label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={13} style={{ position: 'absolute', left: 11, top: errors.reportDay ? 13 : '50%', transform: errors.reportDay ? 'none' : 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={1} max={28}
                    value={form.reportDay}
                    onChange={e => { setForm(f => ({ ...f, reportDay: e.target.value })); setErrors(v => ({ ...v, reportDay: undefined })) }}
                    style={{ paddingLeft: 32, maxWidth: 120, ...(errors.reportDay ? { borderColor: '#dc2626' } : {}) }}
                  />
                </div>
                {errors.reportDay && <FieldError msg={errors.reportDay} />}
                <div style={{ marginTop: 9, padding: '8px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, border: '1px solid rgba(16,185,129,0.15)' }}>
                  O relatório do mês anterior será enviado todo dia <strong style={{ color: '#10b981' }}>{form.reportDay || '1'}</strong> às 08h00 (horário de Brasília).
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--gas-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Flame size={12} color="var(--gas)" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Gás</span>
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
              <div style={{
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

          {/* Save */}
          <div style={{ paddingTop: 4, paddingBottom: 8 }}>
            <button
              className="btn-primary"
              onClick={save}
              disabled={loading}
              style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center', minHeight: 42 }}
            >
              {loading ? (
                <><Spinner size={15} color="white" />Salvando...</>
              ) : (
                <><Save size={15} />Salvar configurações</>
              )}
            </button>
          </div>
        </div>

        {/* ── RIGHT: info panels ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Sistema */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(8,145,178,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calculator size={15} color="#0891b2" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Simulador de tarifa</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[5, 10, 20, 50].map(m3 => (
                <div key={m3} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{m3} m³</span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--water)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
                      💧 R$ {(m3 * waterRate).toFixed(2)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--gas)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
                      🔥 R$ {(m3 * gasRate).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumo do sistema */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={15} color="#7c3aed" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Resumo do sistema</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Apartamentos ativos', value: String(activeApts), color: 'var(--text)' },
                { label: 'Total leituras', value: String(closedReadings.length), color: 'var(--text)' },
                { label: 'Volume água (total)', value: `${totalWaterM3.toFixed(1)} m³`, color: 'var(--water)' },
                { label: 'Volume gás (total)', value: `${totalGasM3.toFixed(1)} m³`, color: 'var(--gas)' },
                { label: 'Faturado água', value: `R$ ${totalWaterCost.toFixed(2)}`, color: 'var(--water)' },
                { label: 'Faturado gás', value: `R$ ${totalGasCost.toFixed(2)}`, color: 'var(--gas)' },
                { label: 'Total geral', value: `R$ ${(totalWaterCost + totalGasCost).toFixed(2)}`, color: 'var(--text)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 13, color, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tarifas atuais */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={15} color="#10b981" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Tarifas salvas</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, padding: '12px 14px', background: 'var(--water-light)', borderRadius: 10, border: '1px solid rgba(37,99,235,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <Droplets size={13} color="var(--water)" />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--water)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Água</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--water)', fontFamily: 'DM Mono, monospace' }}>
                  R$ {config.waterRate.toFixed(4)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--water)', opacity: 0.7, marginTop: 2 }}>por m³</div>
              </div>
              <div style={{ flex: 1, padding: '12px 14px', background: 'var(--gas-light)', borderRadius: 10, border: '1px solid rgba(234,88,12,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <Flame size={13} color="var(--gas)" />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gas)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gás</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gas)', fontFamily: 'DM Mono, monospace' }}>
                  R$ {config.gasRate.toFixed(4)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gas)', opacity: 0.7, marginTop: 2 }}>por m³</div>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 12, color: '#dc2626' }}>
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
    <div className="config-section-row" style={{ padding: '4px 0' }}>
      <div style={{ paddingTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {icon}
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        </div>
        <p style={{ margin: '0 0 0 37px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{description}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '24px 0' }} />
}

function PreviewBadge({ color, bg, preview, rate }: { color: string; bg: string; preview: string; rate: string }) {
  return (
    <div style={{ marginTop: 9, padding: '8px 12px', background: bg, borderRadius: 8, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
      Exemplo: 10 m³ × R$ {rate || '0'}/m³ ={' '}
      <strong style={{ color, fontWeight: 700 }}>R$ {preview}</strong>
    </div>
  )
}
