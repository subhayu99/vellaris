import { useTypewriter, type TermLine } from './hooks.ts'
import { Terminal } from './terminal.tsx'
import { DOCS_URL } from './links.ts'

const LIVING_SCRIPT: ReadonlyArray<TermLine> = [
  { kind: 'cmd', text: 'vellaris signup eve@maritime-co.dev' },
  { kind: 'out', check: true, text: 'Generated keypair', meta: 'fingerprint e1:33:5a:9b:c4:f0' },
  { kind: 'out', check: true, text: 'Wrote ~/.vellaris/identity.enc', meta: 'Argon2id-wrapped' },
  { kind: 'blank' },
  {
    kind: 'cmd',
    text: "vellaris push 'Q4-board-pack.pdf' --to alice --to bob --to ops@maritime-co.dev",
  },
  { kind: 'encrypting', text: 'Encrypting on your device…', meta: 'AES-256-GCM' },
  { kind: 'out', check: true, text: 'Encrypted on your device', meta: '(2.4 MB → 2.4 MB)' },
  { kind: 'out', check: true, text: 'Wrapped DEK for 3 recipients', meta: 'RSA-OAEP-SHA256' },
  { kind: 'out', check: true, text: 'Uploaded ciphertext', meta: 'vault.maritime-co.dev' },
  { kind: 'out', check: true, text: 'doc-7e1c44f0', meta: 'shared with alice, bob, ops' },
  { kind: 'blank' },
  { kind: 'cmd', text: 'vellaris ls --shared-with-me --since 7d' },
  { kind: 'out', text: 'doc-9a4b21f8  contract.pdf            from carol     2h ago' },
  { kind: 'out', text: 'doc-c1d37e90  audit-2026-q1.zip        from alice     yesterday' },
  { kind: 'out', text: 'doc-42afee1c  redacted-customer.csv    from ops       3 days ago' },
  { kind: 'blank' },
  { kind: 'cmd', text: 'vellaris pull doc-9a4b21f8 -o ./contract.pdf' },
  {
    kind: 'out',
    check: true,
    text: 'Verified ed25519 signature',
    meta: 'vault.maritime-co.dev',
  },
  { kind: 'out', check: true, text: 'Decrypted on your device', meta: 'GCM tag ok' },
  { kind: 'out', check: true, text: 'Wrote ./contract.pdf', meta: '(372 KB)' },
]

export function LivingTerminal() {
  const progress = useTypewriter(LIVING_SCRIPT, {
    startWhenVisible: true,
    watchSelector: '#living-terminal',
  })
  return (
    <section className="living" id="quickstart">
      <div className="container-narrow">
        <div
          className="section-head"
          style={{ textAlign: 'center', alignItems: 'center', margin: '0 auto 0' }}
        >
          <div className="eyebrow">A real session</div>
          <h2 className="h-section" style={{ textAlign: 'center' }}>
            From signup to decrypt, in one terminal.
          </h2>
        </div>
        <div id="living-terminal">
          <Terminal
            script={LIVING_SCRIPT}
            progress={progress}
            label="~/work/maritime — vellaris"
            ariaLabel="Vellaris CLI session"
          />
        </div>
        <div className="living-links">
          <a href={`${DOCS_URL}/quickstart`}>→ Read the full quickstart</a>
          <a href={`${DOCS_URL}/api`}>→ Browse the API spec</a>
          <a href={`${DOCS_URL}/security`}>→ Skim the threat model</a>
        </div>
      </div>
    </section>
  )
}
