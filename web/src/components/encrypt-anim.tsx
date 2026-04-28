/**
 * Champagne-thread progress indicator — locked variant from the JSX
 * prototype. Used during signup's RSA-keygen + Argon2id wrap, doc upload,
 * and any other "we're doing crypto on your device" moment.
 *
 * The thread is a 6px pill with a thin gold gradient swatch sliding
 * across it (1.6s loop). Indeterminate by design — the user shouldn't
 * tune their patience to a percentage they can't predict.
 *
 * Respects `prefers-reduced-motion` — the swatch parks at 30% with
 * reduced opacity rather than animating.
 */

export interface EncryptAnimProps {
  /** When false, the static "Encrypted on your device" headline is shown. */
  active?: boolean
  /** Headline override; defaults to active-aware text. */
  label?: string
  /** Sub-copy below the bar. */
  description?: string
}

export function EncryptAnim({
  active = true,
  label,
  description = 'Bytes are processed in this browser. Nothing leaves your machine until ciphertext is ready.',
}: EncryptAnimProps) {
  const headline = label ?? (active ? 'Encrypting on your device' : 'Encrypted on your device')
  return (
    <div className="vel-anim">
      <style>{ANIM_CSS}</style>
      <div className="vel-anim-row">
        <div className="vel-anim-headline">{headline}</div>
      </div>
      <div className="vel-thread" data-active={active ? 'true' : 'false'}>
        <span />
      </div>
      <div className="vel-anim-desc">{description}</div>
    </div>
  )
}

const ANIM_CSS = `
.vel-anim { padding: 8px 0; }
.vel-anim-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.vel-anim-headline {
  font-family: var(--font-serif);
  font-size: 20px;
  color: var(--color-fg);
  letter-spacing: -0.005em;
}
.vel-thread {
  height: 6px;
  width: 100%;
  background: var(--color-bg-elev);
  border-radius: 999px;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--color-line);
}
.vel-thread > span {
  position: absolute;
  top: 0; bottom: 0; left: -40%;
  width: 40%;
  background: linear-gradient(90deg, transparent, var(--color-gold), transparent);
  filter: blur(0.5px);
  animation: vel-weave 1.6s cubic-bezier(.45,.05,.55,.95) infinite;
}
.vel-thread[data-active='false'] > span {
  animation: none;
  opacity: 0.5;
  left: 30%;
}
.vel-anim-desc {
  font-size: 12.5px;
  color: var(--color-fg-3);
  line-height: 1.6;
  margin-top: 10px;
}
@keyframes vel-weave {
  0%   { left: -40%; }
  100% { left: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .vel-thread > span { animation: none; opacity: 0.5; left: 30%; }
}
`
