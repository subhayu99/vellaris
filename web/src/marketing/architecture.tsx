import type { ReactNode } from 'react'
import { useReducedMotion } from './hooks.ts'
import { IBraces, ITerminal, IWindow } from './icons.tsx'

export function Architecture() {
  const reduced = useReducedMotion()
  return (
    <section className="section" id="architecture">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">Architecture</div>
          <h2 className="h-section">There is no &ldquo;we&rdquo;. The server is yours.</h2>
          <p className="lead" style={{ maxWidth: 660 }}>
            The most important thing on this page. The trust boundary is the box you control —
            and the server is built so it physically cannot read what you store on it.
          </p>
        </div>

        <div className="arch">
          <div className="arch-stage">
            <div className="arch-row">
              <ArchClient icon={<ITerminal size={16} />} who="alice · cli" wrapped="9a:4b:21:f8" />
              <ArchClient icon={<IWindow size={16} />} who="bob · web" wrapped="c1:d3:7e:90" />
              <ArchClient icon={<IBraces size={16} />} who="ops · sdk" wrapped="42:af:ee:1c" />
            </div>

            <ArchSVG reduced={reduced} />

            <div className="arch-server">
              <div className="stack">
                <div className="stack-title">
                  <span style={{ color: 'var(--gold)' }}>vellaris-server</span>
                  <span className="pill">your infra</span>
                </div>
                <div className="components">
                  <span>postgres · metadata + access table</span>
                  <span>blob store · ciphertext only</span>
                  <span>audit log · ed25519 signed</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <span
                  className="chip"
                  style={{
                    background: 'rgba(215,122,106,0.08)',
                    color: 'var(--danger)',
                    borderColor: 'rgba(215,122,106,0.32)',
                  }}
                >
                  no decryption keys here
                </span>
                <span className="small" style={{ fontFamily: 'var(--font-mono)' }}>
                  uptime 99.94 · 14d
                </span>
              </div>
            </div>
          </div>

          <div className="arch-can-cant">
            <div className="arch-can">
              <h4>The server can see</h4>
              <ul>
                <li>Encrypted blob sizes</li>
                <li>Encrypted blob hashes</li>
                <li>Recipient lists (user IDs)</li>
                <li>Access timestamps</li>
                <li>The audit log it wrote</li>
              </ul>
            </div>
            <div className="arch-cant">
              <h4>The server cannot see</h4>
              <ul>
                <li>File contents</li>
                <li>
                  File names{' '}
                  <span className="small" style={{ display: 'inline' }}>
                    (encrypted client-side)
                  </span>
                </li>
                <li>Anything in the files</li>
                <li>Decrypted DEKs</li>
                <li>User passphrases</li>
              </ul>
            </div>
          </div>

          <div className="arch-closing">
            Audit your server. Run it on your laptop. Run it on a $5 VPS. Run it in your existing
            K8s cluster. The trust boundary is the box you control.
          </div>

          <FpTexture />
        </div>
      </div>
    </section>
  )
}

interface ArchClientProps {
  icon: ReactNode
  who: string
  wrapped: string
}

function ArchClient({ icon, who, wrapped }: ArchClientProps) {
  return (
    <div className="arch-node">
      <div className="who">
        <span className="glyph">{icon}</span>
        <span>{who}</span>
      </div>
      <span className="keychip">
        <span style={{ display: 'inline-flex' }}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="14" r="4" />
            <path d="m11 11 9-9" />
            <path d="m17 5 3 3" />
          </svg>
        </span>
        wrapped key {wrapped}
      </span>
    </div>
  )
}

function ArchSVG({ reduced }: { reduced: boolean }) {
  // Three dotted vertical paths from the client row to the server row.
  // When motion is allowed, monospace "ciphertext only" labels travel
  // down each path on a stagger; the upward-attempt strike on the right
  // hand side reads "plaintext (impossible)".
  return (
    <div style={{ position: 'relative' }}>
      <svg
        className="arch-svg"
        viewBox="0 0 900 220"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <pattern id="dot" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1" fill="var(--accent-line)" />
          </pattern>
        </defs>
        {/* three dotted vertical paths */}
        <path d="M150 0 L150 220" stroke="var(--accent-line)" strokeWidth="1" strokeDasharray="2 5" />
        <path d="M450 0 L450 220" stroke="var(--accent-line)" strokeWidth="1" strokeDasharray="2 5" />
        <path d="M750 0 L750 220" stroke="var(--accent-line)" strokeWidth="1" strokeDasharray="2 5" />

        {/* invisible paths for textPaths to follow */}
        <path id="arch-path-1" d="M150 0 L150 220" fill="none" />
        <path id="arch-path-2" d="M450 0 L450 220" fill="none" />
        <path id="arch-path-3" d="M750 0 L750 220" fill="none" />

        {/* per-line travelling labels with stagger */}
        {!reduced && (
          <>
            <text
              fontFamily="var(--font-mono)"
              fontSize="10.5"
              fill="var(--gold-soft)"
              opacity="0.85"
            >
              <textPath href="#arch-path-1" startOffset="0%">
                ciphertext only
                <animate
                  attributeName="startOffset"
                  values="-30%;100%"
                  dur="5s"
                  repeatCount="indefinite"
                />
              </textPath>
            </text>
            <text
              fontFamily="var(--font-mono)"
              fontSize="10.5"
              fill="var(--gold-soft)"
              opacity="0.85"
            >
              <textPath href="#arch-path-2" startOffset="0%">
                ciphertext only
                <animate
                  attributeName="startOffset"
                  values="-30%;100%"
                  dur="5s"
                  begin="1.2s"
                  repeatCount="indefinite"
                />
              </textPath>
            </text>
            <text
              fontFamily="var(--font-mono)"
              fontSize="10.5"
              fill="var(--gold-soft)"
              opacity="0.85"
            >
              <textPath href="#arch-path-3" startOffset="0%">
                ciphertext only
                <animate
                  attributeName="startOffset"
                  values="-30%;100%"
                  dur="5s"
                  begin="2.4s"
                  repeatCount="indefinite"
                />
              </textPath>
            </text>
          </>
        )}

        {/* downward arrows */}
        <g fill="var(--accent)" opacity="0.5">
          <path d="M146 200 L150 208 L154 200 Z" />
          <path d="M446 200 L450 208 L454 200 Z" />
          <path d="M746 200 L750 208 L754 200 Z" />
        </g>

        {/* upward 'plaintext' attempt with red strike */}
        <g transform="translate(820, 50)">
          <path
            d="M0 130 L0 30"
            fill="none"
            stroke="var(--danger)"
            strokeWidth="1.4"
            strokeDasharray="3 4"
            opacity="0.7"
          />
          <path
            d="M-4 36 L0 28 L4 36"
            fill="none"
            stroke="var(--danger)"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.7"
          />
          <line
            x1="-12"
            y1="80"
            x2="12"
            y2="68"
            stroke="var(--danger)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <text x="20" y="80" fontFamily="var(--font-mono)" fontSize="10" fill="var(--danger)">
            plaintext
          </text>
          <text
            x="20"
            y="92"
            fontFamily="var(--font-mono)"
            fontSize="10"
            fill="var(--danger)"
            opacity="0.7"
          >
            (impossible)
          </text>
        </g>
      </svg>
    </div>
  )
}

function FpTexture() {
  // Faint scrolling fingerprint string at the bottom of the arch panel.
  const fp = '9a:4b:21:f8:c0:e3:7d:91:e1:33:5a:9b:c4:f0:6a:21 · '.repeat(8)
  return (
    <div className="fp-texture" aria-hidden="true">
      <span>
        {fp}
        {fp}
      </span>
    </div>
  )
}
