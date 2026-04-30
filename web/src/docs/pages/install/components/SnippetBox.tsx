import { useState } from 'react'

export function SnippetBox({
  title,
  contents,
  warn = false,
}: {
  title: string
  contents: string
  warn?: boolean
}) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(contents).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (!contents.trim()) return null

  return (
    <section className={`install-snippet ${warn ? 'install-snippet-warn' : ''}`}>
      <header>
        <h4>{title}</h4>
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </header>
      {warn && (
        <p className="install-warn">
          This snippet contains real credentials — do not paste into chat, screenshots, or
          commits.
        </p>
      )}
      <pre>
        <code>{contents}</code>
      </pre>
    </section>
  )
}
