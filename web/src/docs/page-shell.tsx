import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { findEntry, neighbours, type DocsEntry } from './nav-entries.ts'

export interface DocsPageShellProps {
  /* The route slug this page lives at — drives sec num, sec kind, prev/next. */
  to: string
  title: string
  glyph?: ReactNode
  lead?: ReactNode
  children: ReactNode
}

export function DocsPageShell({ to, title, glyph, lead, children }: DocsPageShellProps) {
  const entry = findEntry(to)
  const { prev, next } = neighbours(to)
  return (
    <article className="docs-article">
      <div className="docs-hero">
        {entry && (
          <div className="docs-hero-top">
            <span className="docs-secnum">
              <span className="num">{entry.secNum}</span>
              <span className="sep">/</span>
              <span>{entry.secKind}</span>
            </span>
          </div>
        )}
        <div className="docs-h1-row">
          <h1 className="docs-h1">{title}</h1>
          {glyph ? <div className="docs-glyph">{glyph}</div> : null}
        </div>
        <div className="docs-rule" aria-hidden="true" />
        {lead ? <p className="docs-lead">{lead}</p> : null}
      </div>
      <div className="docs-content">{children}</div>
      {(prev || next) && <PrevNext prev={prev} next={next} />}
    </article>
  )
}

function PrevNext({ prev, next }: { prev?: DocsEntry; next?: DocsEntry }) {
  return (
    <div className="docs-pn">
      {prev ? (
        <Link to={prev.to}>
          <span className="eyebrow">
            <span className="ch">←</span> {prev.secNum} / {prev.secKind}
          </span>
          <span className="title">{prev.label}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link to={next.to} className="next">
          <span className="eyebrow">
            {next.secNum} / {next.secKind} <span className="ch">→</span>
          </span>
          <span className="title">{next.label}</span>
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}
