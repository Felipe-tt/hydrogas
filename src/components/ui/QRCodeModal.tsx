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
        dotsOptions: { type: 'rounded', color: qrDotColor },
        backgroundOptions: { color: 'transparent' },
        cornersSquareOptions: { type: 'extra-rounded', color: qrDotColor },
        cornersDotOptions: { type: 'dot', color: qrAccentColor },
      })

      qr.append(qrRef.current)
      qrInstance.current = qr
    } catch (_err) {
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

  // Corner bracket positions
  const corners = [
    { top: 8,    left: 8,  borderTopWidth: '2.5px',    borderLeftWidth: '2.5px',   borderRadius: '4px 0 0 0' },
    { top: 8,    right: 8, borderTopWidth: '2.5px',    borderRightWidth: '2.5px',  borderRadius: '0 4px 0 0' },
    { bottom: 8, left: 8,  borderBottomWidth: '2.5px', borderLeftWidth: '2.5px',   borderRadius: '0 0 0 4px' },
    { bottom: 8, right: 8, borderBottomWidth: '2.5px', borderRightWidth: '2.5px',  borderRadius: '0 0 4px 0' },
  ] as React.CSSProperties[]

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

        .qr-backdrop {
          background: rgba(2, 6, 23, 0.75);
        }
        :root[data-theme="light"] .qr-backdrop,
        .light .qr-backdrop {
          background: rgba(15, 23, 42, 0.5);
        }

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

        .qr-logo-ring {
          background: var(--sidebar-bg);
          border: 3px solid #ffffff;
        }

        .qr-url-strip {
          background: var(--surface-2);
          border: 1px solid var(--border);
        }

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

      {/* Backdrop */}
      <div
        className="qr-backdrop qr-backdrop-base"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* Card */}
        <div className="qr-card qr-card-base">

          {/* Accent bar */}
          <div className="qr-accent-bar" />

          {/* Header */}
          <div className="qr-header">
            <div className="qr-header-left">
              <div className="qr-header-icon">
                <Wifi size={18} color="#2563eb" />
              </div>
              <div>
                <div className="qr-header-title">
                  Ap. {apt.number}{apt.block ? ` · Bloco ${apt.block}` : ''}
                </div>
                <div className="qr-header-sub">Acesso via QR Code</div>
              </div>
            </div>

            <button className="qr-close-btn qr-copy-btn-inner" onClick={onClose}>
              <X size={15} />
            </button>
          </div>

          {/* QR display */}
          <div className="qr-display-area">
            <div className="qr-frame qr-frame-wrap">

              {/* Live dot */}
              <div className="qr-live-dot-wrap">
                <div className="qr-live-dot-ring" />
                <div className="qr-live-dot-core" />
              </div>

              {/* Corner brackets */}
              {corners.map((s, i) => (
                <div key={i} className="qr-corner-bracket" style={s} />
              ))}

              {error ? (
                <div className="qr-error-state">{error}</div>
              ) : (
                <div ref={qrRef} />
              )}

              {/* Logo */}
              <div className="qr-logo-ring qr-logo-ring-wrap">
                <img src="/favicon.svg" className="qr-logo-img" alt="" />
              </div>
            </div>
          </div>

          {/* URL row */}
          <div className="qr-url-row">
            <div className="qr-url-strip qr-url-inner">
              <span className="qr-url-text">{url || '—'}</span>
              <button
                className={`qr-copy-btn qr-copy-btn-inner${copied ? ' copied' : ''}`}
                onClick={handleCopy}
                title="Copiar link"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Download */}
          <div className="qr-download-row">
            <button
              className="qr-download-btn qr-download-btn-inner"
              onClick={handleDownload}
              disabled={downloading || !url}
            >
              {downloading ? (
                <>
                  <span className="qr-spin-indicator" />
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
