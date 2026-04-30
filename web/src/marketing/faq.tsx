import type { ReactNode } from 'react'
import { IChevronDown } from './icons.tsx'

interface FAQEntry {
  q: string
  a: ReactNode
}

const ITEMS: ReadonlyArray<FAQEntry> = [
  {
    q: 'What if I lose my passphrase?',
    a: (
      <>
        Your files are gone. There is no recovery path. The passphrase never leaves your device. Use
        a password manager, write it down, keep a backup of your wrapped key file with{' '}
        <code>vellaris key export</code>.
      </>
    ),
  },
  {
    q: 'What does the server actually see?',
    a: (
      <>
        Encrypted blob sizes, encrypted blob hashes, recipient user IDs, access timestamps, and the
        signed audit log. Not file contents, not filenames (they&rsquo;re encrypted), not your DEKs,
        not your passphrase.
      </>
    ),
  },
  {
    q: 'What about a malicious server administrator?',
    a: (
      <>
        They can refuse to serve your blobs. They can corrupt your blobs &mdash; you&rsquo;ll see
        this on decrypt when the GCM tag check fails. They can see who shared what with whom, and
        when. They cannot read your files.
      </>
    ),
  },
  {
    q: 'What happens when I revoke a user from a document?',
    a: (
      <>
        Their entry is removed from the access table — they can no longer request the encrypted DEK.
        But if they already downloaded and decrypted the file, that copy is out of our hands. To
        force a fresh barrier, use <code>vellaris rotate &lt;doc&gt;</code> to re-encrypt with a new
        key (v1.x).
      </>
    ),
  },
  {
    q: 'What about quantum?',
    a: (
      <>
        RSA-4096 is not post-quantum. v2.0 will offer ML-KEM 768. Rotation tooling will be provided.
        Nothing you store today will be readable to a server admin even after the rotation; old
        envelopes stay sealed.
      </>
    ),
  },
  {
    q: 'How is this different from PGP, age, or 7zip with a password?',
    a: (
      <>
        Those tools encrypt files. Vellaris encrypts files <em>and</em> coordinates sharing,
        revocation, audit, and key rotation, with all crypto on-device. The trust boundary is
        identical to age; the workflow is built for teams.
      </>
    ),
  },
  {
    q: 'Can I sue you if it fails?',
    a: (
      <>
        Apache 2.0 — read the warranty disclaimer. We&rsquo;re confident in the crypto; we
        won&rsquo;t pretend to be insurance.
      </>
    ),
  },
]

export function FAQ() {
  return (
    <section className="section" id="trust">
      <div className="container-narrow">
        <div className="section-head">
          <div className="eyebrow">Trust</div>
          <h2 className="h-section">What we promise. What we don&rsquo;t.</h2>
          <p className="lead">
            An end-to-end encrypted product that doesn&rsquo;t tell you the limits of its threat
            model isn&rsquo;t trustworthy. Here are ours.
          </p>
        </div>
        <div className="faq">
          {ITEMS.map((it, i) => (
            <details key={i}>
              <summary>
                <span>{it.q}</span>
                <IChevronDown size={16} className="chev" />
              </summary>
              <div className="answer">{it.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
