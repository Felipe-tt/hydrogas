import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface Toast { id: string; message: string; type: 'success' | 'error' | 'info' }
interface ToastCtx { toast: (msg: string, type?: Toast['type']) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const colors = { success: '#16a34a', error: '#dc2626', info: 'var(--water)' }
  const icons  = { success: '✓', error: '✕', info: 'ℹ' }

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div
            key={t.id}
            className="toast-enter toast-item"
            style={{
              border: `1px solid ${colors[t.type]}40`,
              borderLeft: `4px solid ${colors[t.type]}`,
            }}
          >
            <span className="toast-icon" style={{ color: colors[t.type] }}>{icons[t.type]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
