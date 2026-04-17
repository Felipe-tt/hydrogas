import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Download, Copy, Check, Wifi } from 'lucide-react'
import QRCodeStyling from 'qr-code-styling'
import type { Apartment } from '../../domain/entities'

function getPublicLink(token: string): string {
  return `${window.location.origin}/apt/${token}`
}

interface Props {
  apt: Apartment
  onClose: () => void
}

export function QRCodeModal({ apt, onClose }: Props) {
  const qrRef = useRef<HTMLDivElement>(null)
  const qrInstance = useRef<QRCodeStyling | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const url = apt.publicToken ? getPublicLink(apt.publicToken) : ''

  // Detect active theme to colorize QR dots correctly
  const isDark =
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark')

  // ALTERADO: usa a variável CSS
  const qrDotColor = 'var(--qr-dot-color)'
  const qrAccentColor = '#2563eb'

  useEffect(() => {
    if (!url || !qrRef.current) return
    qrRef.current.innerHTML = ''

    try {
      const qr = new QRCodeStyling({
        width: 256,
        height: 256,
        data: url,
        margin: 0,
        qrOptions: { errorCorrectionLevel: 'H' },
        dotsOptions: {
          type: 'rounded',
          color: qrDotColor,
        },
        backgroundOptions: { color: 'transparent' },
        cornersSquareOptions: {
          type: 'extra-rounded',
          color: qrDotColor,
        },
        cornersDotOptions: {
          type: 'dot',
          color: qrAccentColor,
        },
      })

      qr.append(qrRef.current)
      qrInstance.current = qr
    } catch (err) {
      console.error(err)
      setError('Erro ao gerar QR Code')
    }
  }, [url, qrDotColor, qrAccentColor])

  const handleCopy = useCallback(async () => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [url])

  const handleDownload = useCallback(async () => {
    if (!qrInstance.current) return
    setDownloading(true)
    qrInstance.current.update({ width: 1200, height: 1200 })
    await new Promise(r => setTimeout(r, 300))
    await qrInstance.current.download({
      name: `qr-ap${apt.number}${apt.block ? `-bloco-${apt.block}` : ''}`,
      extension: 'png',
    })
    qrInstance.current.update({ width: 256, height: 256 })
    setDownloading(false)
  }, [apt])

  return (
    <>
      <style>{`
        @keyframes qr-fadeIn {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes qr-slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97) }
          to   { opacity: 1; transform: translateY(0)    scale(1)    }
        }
        @keyframes qr-shimmer {
          0%   { background-position: -400px 0 }
          100% { background-position:  400px 0 }
        }
        @keyframes qr-spin {
          to { transform: rotate(360deg) }
        }
        @keyframes qr-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.7 }
          100% { transform: scale(1.8); opacity: 0   }
        }

        /* ─── Backdrop ─── */
        .qr-backdrop {
          background: rgba(2, 6, 23, 0.75);
        }
        :root[data-theme="light"] .qr-backdrop,
        .light .qr-backdrop {
          background: rgba(15, 23, 42, 0.5);
        }

        /* ─── Card ─── */
        .qr-card {
          background: var(--sidebar-bg);
          border: 1px solid var(--border);
          box-shadow:
            0 40px 100px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.03);
        }
        :root[data-theme="light"] .qr-card,
        .light .qr-card {
          box-shadow:
            0 20px 60px rgba(0, 0, 0, 0.1),
            0 0 0 1px rgba(0, 0, 0, 0.05);
        }

        /* ─── QR frame (white card holding the code) ─── */
        .qr-frame {
          background: #ffffff;
          box-shadow:
            0 0 0 1px var(--border),
            0 16px 40px rgba(0, 0, 0, 0.2);
        }
        :root[data-theme="light"] .qr-frame,
        .light .qr-frame {
          box-shadow:
            0 0 0 1px var(--border),
            0 6px 20px rgba(0, 0, 0, 0.07);
        }

        /* ─── Center logo ring ─── */
        .qr-logo-ring {
          background: var(--sidebar-bg);
          border: 3px solid #ffffff;
        }

        /* ─── URL strip ─── */
        .qr-url-strip {
          background: var(--surface-2);
          border: 1px solid var(--border);
        }

        /* ─── Buttons ─── */
        .qr-close-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-2);
          transition: background 0.15s ease, color 0.15s ease;
        }
        .qr-close-btn:hover {
          background: var(--surface-2);
          color: var(--text);
        }

        .qr-copy-btn {
          background: var(--surface-2);
          border: 1px solid var(--border);
          color: var(--text-2);
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .qr-copy-btn:hover { color: var(--text); }
        .qr-copy-btn.copied {
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.35);
        }

        .qr-download-btn {
          background: #2563eb;
          border: none;
          color: #ffffff;
          box-shadow: 0 4px 18px rgba(37, 99, 235, 0.35);
          transition: background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
        }
        .qr-download-btn:hover:not(:disabled) {
          background: #1d4ed8;
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(37, 99, 235, 0.45);
        }
        .qr-download-btn:active:not(:disabled) { transform: translateY(0); }
        .qr-download-btn:disabled { opacity: 0.7; cursor: not-allowed; }
      `}</style>

      {/* ── Backdrop ── */}
      <div
        className="qr-backdrop"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          animation: 'qr-fadeIn 0.2s ease',
        }}
      >
        {/* ── Card ── */}
        <div
          className="qr-card"
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 24,
            overflow: 'hidden',
            animation: 'qr-slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* Accent bar */}
          <div style={{
            height: 3,
            background: 'linear-gradient(90deg, #2563eb, #06b6d4, #2563eb)',
            backgroundSize: '200% 100%',
            animation: 'qr-shimmer 2.5s linear infinite',
          }} />

          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '20px 22px 0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(37,99,235,0.12)',
                border: '1px solid rgba(37,99,235,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Wifi size={18} color="#2563eb" />
              </div>
              <div>
                {/* ALTERADO: usa a variável CSS para o texto principal */}
                <div style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--qr-text-primary)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                }}>
                  Ap. {apt.number}{apt.block ? ` · Bloco ${apt.block}` : ''}
                </div>
                {/* ALTERADO: usa a variável CSS para o texto secundário */}
                <div style={{ fontSize: 12, color: 'var(--qr-text-secondary)', marginTop: 2 }}>
                  Acesso via QR Code
                </div>
              </div>
            </div>

            <button
              className="qr-close-btn"
              onClick={onClose}
              style={{ borderRadius: 10, padding: 6, cursor: 'pointer', display: 'flex' }}
            >
              <X size={15} />
            </button>
          </div>

          {/* QR display */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '24px 22px 20px',
          }}>
            <div className="qr-frame" style={{ position: 'relative', borderRadius: 20, padding: 22 }}>

              {/* Live dot */}
              <div style={{ position: 'absolute', top: -5, right: -5, width: 14, height: 14 }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '50%',
                  background: '#22c55e',
                  animation: 'qr-pulse-ring 1.8s ease-out infinite',
                }} />
                <div style={{
                  position: 'absolute', inset: 3,
                  borderRadius: '50%',
                  background: '#22c55e',
                }} />
              </div>

              {/* Corner brackets */}
              {([
                { top: 8,    left: 8,  borderTopWidth: 2.5,    borderLeftWidth: 2.5,   borderRadius: '4px 0 0 0' },
                { top: 8,    right: 8, borderTopWidth: 2.5,    borderRightWidth: 2.5,  borderRadius: '0 4px 0 0' },
                { bottom: 8, left: 8,  borderBottomWidth: 2.5, borderLeftWidth: 2.5,   borderRadius: '0 0 0 4px' },
                { bottom: 8, right: 8, borderBottomWidth: 2.5, borderRightWidth: 2.5,  borderRadius: '0 0 4px 0' },
              ] as React.CSSProperties[]).map((s, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  width: 18, height: 18,
                  borderColor: '#2563eb',
                  borderStyle: 'solid',
                  borderWidth: 0,
                  ...s,
                }} />
              ))}

              {error ? (
                <div style={{
                  width: 256, height: 256,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#ef4444', fontSize: 13,
                }}>
                  {error}
                </div>
              ) : (
                <div ref={qrRef} />
              )}

              {/* Logo */}
              <div className="qr-logo-ring" style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 50, height: 50,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
              }}>
                <img src="/favicon.svg" style={{ width: 26, height: 26 }} alt="" />
              </div>
            </div>
          </div>

          {/* URL row */}
          <div style={{ padding: '0 22px 12px' }}>
            <div className="qr-url-strip" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              borderRadius: 10, padding: '8px 8px 8px 13px',
            }}>
              <span style={{
                flex: 1,
                fontFamily: '"DM Mono", "Fira Mono", monospace',
                fontSize: 11,
                color: 'var(--text-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {url || '—'}
              </span>
              <button
                className={`qr-copy-btn${copied ? ' copied' : ''}`}
                onClick={handleCopy}
                title="Copiar link"
                style={{
                  flexShrink: 0,
                  borderRadius: 7, padding: '4px 9px',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 500,
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Download */}
          <div style={{ padding: '0 22px 22px' }}>
            <button
              className="qr-download-btn"
              onClick={handleDownload}
              disabled={downloading || !url}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                borderRadius: 12, padding: '12px 16px',
                cursor: 'pointer',
                fontWeight: 600, fontSize: 13.5, letterSpacing: '-0.01em',
              }}
            >
              {downloading ? (
                <>
                  <span style={{
                    width: 14, height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'qr-spin 0.7s linear infinite',
                  }} />
                  Gerando…
                </>
              ) : (
                <>
                  <Download size={14} />
                  Baixar QR Code (PNG)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
