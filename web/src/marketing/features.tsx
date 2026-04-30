import type { ReactNode } from 'react'
import { IBadgeOSS, ICode, IKey, ILock, ILogTree, IServer } from './icons.tsx'

interface FeatureCell {
  icon: ReactNode
  title: string
  body: string
}

const CELLS: ReadonlyArray<FeatureCell> = [
  {
    icon: <ILock size={20} />,
    title: 'End-to-end encryption',
    body: 'AES-256-GCM file encryption, RSA-4096 OAEP per-recipient key wrapping, Argon2id passphrase KDF. Verifiable in the source.',
  },
  {
    icon: <IServer size={20} />,
    title: 'Self-hosted by design',
    body: 'One Docker image, Postgres, local FS or S3. ~50 MB image, $5/mo VPS-friendly. Zero managed dependencies.',
  },
  {
    icon: <ICode size={20} />,
    title: 'Decoupled clients',
    body: 'Web UI, CLI, and Python SDK are independent of any specific server. Point them at any vellaris instance.',
  },
  {
    icon: <ILogTree size={20} />,
    title: 'Signed audit log',
    body: 'Every action signed by the server on write with Ed25519. Export it, archive it, prove it. Tamper-evident on replay.',
  },
  {
    icon: <IKey size={20} />,
    title: 'Backup & restore your keys',
    body: "Manual export/import of your wrapped private key, or opt-in encrypted-blob sync. The server can't decrypt either.",
  },
  {
    icon: <IBadgeOSS size={20} />,
    title: 'Apache 2.0',
    body: 'No CLA traps, no rug-pulls. Read every line on GitHub. Run it forever, even if we disappear.',
  },
]

export function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">What you get</div>
          <h2 className="h-section">Built like a vault. Shipped like a CLI.</h2>
        </div>
        <div className="feature-grid">
          {CELLS.map((c, i) => (
            <div className="feature-cell" key={i}>
              <span className="ico">{c.icon}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
