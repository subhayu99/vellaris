/**
 * Notice — consistent inline status/feedback box.
 *
 * Replaces the four-token-deep `border-danger/40 bg-danger/10 text-danger
 * rounded-lg border px-4 py-3 text-[13px]` block that was duplicated
 * across dashboard, doc-detail, upload, and settings. One component, four
 * variants (error / success / warn / info), so adding a new state means
 * a one-line tweak instead of grepping for "rgba(215,122,106…)".
 *
 * Variants:
 *   - error   → danger color (red-orange, used for HTTP / decrypt failures)
 *   - success → ok color     (green, for share/revoke/keyblob notices)
 *   - warn    → warn color   (gold, for "replacing existing key" warnings)
 *   - info    → fg-2 / line  (neutral, for empty / loading states)
 *
 * The visible role for assistive tech is `status` for success/info and
 * `alert` for error/warn so they get announced when they appear.
 */

import type { ReactNode } from 'react'

export type NoticeVariant = 'error' | 'success' | 'warn' | 'info'

export interface NoticeProps {
  variant?: NoticeVariant
  children: ReactNode
  /** Optional title rendered as a heading inside the notice. */
  title?: ReactNode
  className?: string
  'data-testid'?: string
}

const VARIANT_CLASS: Record<NoticeVariant, string> = {
  error: 'border-danger/40 bg-danger/10 text-danger',
  success: 'border-ok/40 bg-ok/10 text-ok',
  warn: 'border-warn/40 bg-warn/8 text-fg',
  info: 'border-line bg-bg-card text-fg-2',
}

const ROLE: Record<NoticeVariant, 'alert' | 'status'> = {
  error: 'alert',
  warn: 'alert',
  success: 'status',
  info: 'status',
}

export function Notice({
  variant = 'info',
  children,
  title,
  className = '',
  'data-testid': testId,
}: NoticeProps) {
  const classes = [
    'rounded-lg border px-4 py-3 text-[13px] leading-relaxed',
    VARIANT_CLASS[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes} role={ROLE[variant]} data-testid={testId}>
      {title ? <div className="mb-1 font-semibold">{title}</div> : null}
      {children}
    </div>
  )
}
