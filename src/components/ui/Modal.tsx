import { ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  maxWidth?: number
}

export function Modal({ title, onClose, children, maxWidth = 480 }: Props) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        {/* Handle bar — só aparece em mobile via CSS */}
        <div className="modal-handle" />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface-2)',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-2)',
              width: 30, height: 30,
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
