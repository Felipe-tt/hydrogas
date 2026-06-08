import { Modal } from './Modal'

interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function ConfirmDialog({ message, onConfirm, onCancel, loading }: Props) {
  return (
    <Modal title="Confirmar ação" onClose={onCancel}>
      <p className="confirm-dialog-message">{message}</p>
      <div className="confirm-dialog-actions">
        <button className="btn-secondary" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button className="btn-danger" onClick={onConfirm} disabled={loading}>
          {loading ? 'Removendo...' : 'Confirmar'}
        </button>
      </div>
    </Modal>
  )
}
