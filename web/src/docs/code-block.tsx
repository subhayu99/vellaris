import { useState, type ReactNode } from 'react'

export interface CodeBlockProps {
  lang?: string
  children: ReactNode
}

export function CodeBlock({ lang = 'shell', children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    const text = extractText(children)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }
  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span className="codeblock-tag" aria-hidden="true">
          {lang}
        </span>
        <button
          type="button"
          className={`codeblock-copy ${copied ? 'copied' : ''}`}
          onClick={onCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  )
}

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: ReactNode } }).props
    if (props && 'children' in props) return extractText(props.children)
  }
  return ''
}

interface ShellProps {
  cmd: string
  args?: ReadonlyArray<string>
  comment?: string
}

export function Shell({ cmd, args = [], comment }: ShellProps) {
  return (
    <div>
      <span className="tok-prompt">$ </span>
      <span className="tok-fn">{cmd}</span>
      {args.map((a, i) => (
        <span key={i}> {a.startsWith('-') ? <span className="tok-flag">{a}</span> : a}</span>
      ))}
      {comment ? <span className="tok-cmt">{`  # ${comment}`}</span> : null}
    </div>
  )
}

/* ---------- Field list ----------
 * For dense parameter explanations (envelope fields, wrapped key params).
 * Mono key on the left, prose body on the right, in a card that visually
 * pairs with the codeblock above it. */

export interface FieldEntry {
  name: string
  body: ReactNode
}

interface FieldListProps {
  items: ReadonlyArray<FieldEntry>
}

export function FieldList({ items }: FieldListProps) {
  return (
    <dl className="docs-fields">
      {items.map((it, i) => (
        <FieldRow key={i} entry={it} />
      ))}
    </dl>
  )
}

function FieldRow({ entry }: { entry: FieldEntry }) {
  return (
    <>
      <dt>{entry.name}</dt>
      <dd>{entry.body}</dd>
    </>
  )
}
