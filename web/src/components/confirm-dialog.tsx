/**
 * ConfirmDialog — a small modal for destructive confirmations.
 *
 * Replaces `window.confirm()` for actions like deleting a document or
 * wiping the server-side wrapped key. Renders a backdrop + a card with
 * a title, body, and Cancel / confirm buttons. The confirm button uses
 * the danger variant; pass `confirmVariant="primary"` for non-destructive
 * confirmations.
 *
 * The dialog is mounted in-place (no portal). It traps body scroll while
 * open and closes on Escape. Focus moves to the confirm button on open
 * so the user can press Enter to commit or Escape to bail.
 */

import { useEffect, type ReactNode } from 'react'

import { Button } from './button.tsx'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  body: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'danger' | 'primary'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Optional data-testid prefix for the buttons. */
  testIdPrefix?: string
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  busy = false,
  onConfirm,
  onCancel,
  testIdPrefix,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <div
        className="border-line bg-bg-card relative w-full max-w-md rounded-t-xl border-x border-t p-5 sm:rounded-xl sm:border"
        data-testid={testIdPrefix}
      >
        <h2 id="confirm-dialog-title" className="text-fg font-serif text-lg tracking-tight">
          {title}
        </h2>
        <div className="text-fg-2 mt-2 text-[13px] leading-relaxed">{body}</div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
            fullWidth
            className="sm:w-auto"
            data-testid={testIdPrefix ? `${testIdPrefix}-cancel` : undefined}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            fullWidth
            className="sm:w-auto"
            data-testid={testIdPrefix ? `${testIdPrefix}-confirm` : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
