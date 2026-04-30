import type { TermLine, TypewriterState } from './hooks.ts'

/* Reusable terminal renderer — Hero and LivingTerminal both feed it a
 * script + the typewriter state from hooks.ts. */

export interface TerminalProps {
  script: ReadonlyArray<TermLine>
  progress: TypewriterState
  label: string
  ariaLabel?: string
}

export function Terminal({ script, progress, label, ariaLabel }: TerminalProps) {
  return (
    <div className="terminal" role="img" aria-label={ariaLabel ?? 'Vellaris CLI session'}>
      <div className="terminal-bar">
        <span className="terminal-dot" />
        <span className="terminal-dot" />
        <span className="terminal-dot" />
        <span className="label">{label}</span>
      </div>
      <div className="terminal-body">
        {script.map((line, i) => (
          <TermLineView key={i} idx={i} line={line} progress={progress} />
        ))}
      </div>
    </div>
  )
}

interface TermLineViewProps {
  idx: number
  line: TermLine
  progress: TypewriterState
}

function TermLineView({ idx, line, progress }: TermLineViewProps) {
  if (idx > progress.line) return null
  if (line.kind === 'blank') return <div className="term-line">&nbsp;</div>
  if (line.kind === 'cmd') {
    const fullText = line.text ?? ''
    const isCurrent = idx === progress.line
    const visible = isCurrent ? fullText.slice(0, progress.char) : fullText
    return (
      <div className="term-line">
        <span className="term-prompt">$ </span>
        <span className="term-cmd">{visible}</span>
        {isCurrent && progress.char < fullText.length && <span className="term-cursor" />}
      </div>
    )
  }
  if (line.kind === 'out') {
    const isCurrent = idx === progress.line
    const showCheck = !isCurrent || progress.held >= 2
    return (
      <div className="term-line term-out">
        {line.check ? (
          <span
            className="check"
            style={{ opacity: showCheck ? 1 : 0, transition: 'opacity 200ms ease' }}
          >
            ✓
          </span>
        ) : (
          <span style={{ display: 'inline-block', width: '1.4em' }} />
        )}
        <span>{line.text}</span>
        {line.meta && <span className="meta"> {line.meta}</span>}
      </div>
    )
  }
  if (line.kind === 'encrypting') {
    return (
      <div className="term-line term-encrypting">
        <span className="thread" aria-hidden="true" />
        <span style={{ color: 'var(--gold-soft)' }}>{line.text}</span>
        {line.meta && <span style={{ color: 'rgba(247,241,227,0.45)' }}>· {line.meta}</span>}
      </div>
    )
  }
  return null
}
