import type { ReactNode } from 'react'

export function HowItWorks() {
  return (
    <section className="section" id="how">
      <div className="container">
        <div className="section-divider">How it works</div>
        <div className="section-head">
          <h2 className="h-section">Three steps. None of them happen on our server.</h2>
        </div>

        <div className="how-grid">
          <HowCard
            num="01 · Encrypt"
            illus={<EncryptIllus />}
            title="On your device, with a fresh key."
            body={
              <>
                Your file is encrypted with a fresh{' '}
                <span className="font-mono" style={{ color: 'var(--gold-soft)' }}>
                  AES-256-GCM
                </span>{' '}
                key. The key itself is then encrypted once for each recipient using their RSA public
                key.
              </>
            }
          />
          <HowCard
            num="02 · Store"
            illus={<StoreIllus />}
            title="Your server, your infrastructure."
            body="Vellaris uploads only ciphertext to your self-hosted server. The server stores blobs, encrypted keys, and an audit log. It cannot decrypt anything."
          />
          <HowCard
            num="03 · Share"
            illus={<ShareIllus />}
            title="Recipients decrypt locally."
            body="Recipients pull the ciphertext and decrypt it on their device with their own private key. The server never sees plaintext."
          />
        </div>

        <div className="crypto-strip">
          <span>crypto:</span>
          <span style={{ color: 'var(--gold-soft)' }}>AES-256-GCM</span>
          <span className="sep">·</span>
          <span style={{ color: 'var(--gold-soft)' }}>RSA-4096 OAEP-SHA256</span>
          <span className="sep">·</span>
          <span style={{ color: 'var(--gold-soft)' }}>Argon2id passphrase KDF</span>
          <span className="sep">·</span>
          <span style={{ color: 'var(--gold-soft)' }}>Ed25519 audit signatures</span>
        </div>
      </div>
    </section>
  )
}

interface HowCardProps {
  num: string
  illus: ReactNode
  title: string
  body: ReactNode
}

function HowCard({ num, illus, title, body }: HowCardProps) {
  return (
    <div className="how-card">
      <div className="how-num">{num}</div>
      <div className="how-illus">{illus}</div>
      <h3 className="h-card">{title}</h3>
      <p className="body-text" style={{ margin: 0 }}>
        {body}
      </p>
    </div>
  )
}

function EncryptIllus() {
  return (
    <svg viewBox="0 0 320 160" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="encrypt-thread" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--gold)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* document */}
      <g transform="translate(48, 30)">
        <rect width="100" height="120" rx="6" fill="var(--bg-card)" stroke="var(--line-2)" />
        <path d="M84 0 L100 16 L84 16 Z" fill="var(--bg-elev-2)" stroke="var(--line-2)" />
        <line
          x1="14"
          y1="32"
          x2="78"
          y2="32"
          stroke="var(--line-2)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="14"
          y1="44"
          x2="86"
          y2="44"
          stroke="var(--line-2)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="14"
          y1="56"
          x2="60"
          y2="56"
          stroke="var(--line-2)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="14"
          y1="76"
          x2="86"
          y2="76"
          stroke="var(--line-2)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="14"
          y1="88"
          x2="72"
          y2="88"
          stroke="var(--line-2)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      {/* thread weaving over the document */}
      <path
        d="M30 90 Q 80 60, 130 90 T 230 90 T 290 90"
        fill="none"
        stroke="url(#encrypt-thread)"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="0;-200"
          dur="3s"
          repeatCount="indefinite"
        />
      </path>
      {/* lock at end */}
      <g transform="translate(232, 56)">
        <rect
          width="56"
          height="56"
          rx="10"
          fill="var(--accent-soft)"
          stroke="var(--accent-line)"
        />
        <g
          transform="translate(16, 16)"
          stroke="var(--gold)"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        >
          <rect x="0" y="9" width="24" height="14" rx="2" />
          <path d="M5 9V6a7 7 0 0 1 14 0v3" />
        </g>
      </g>
    </svg>
  )
}

function StoreIllus() {
  return (
    <svg viewBox="0 0 320 160" width="100%" height="100%" style={{ display: 'block' }}>
      {/* ciphertext blob arriving at server */}
      <g transform="translate(40, 50)" opacity="0.9">
        <rect width="80" height="60" rx="8" fill="var(--bg-card)" stroke="var(--accent-line)" />
        <text
          x="40"
          y="26"
          textAnchor="middle"
          fontSize="9"
          fontFamily="var(--font-mono)"
          fill="var(--gold)"
        >
          CIPHERTEXT
        </text>
        <text
          x="40"
          y="42"
          textAnchor="middle"
          fontSize="8"
          fontFamily="var(--font-mono)"
          fill="var(--fg-3)"
        >
          9a4b21f8c0e3
        </text>
      </g>
      {/* arrow */}
      <path
        d="M132 80 L 188 80"
        stroke="var(--accent)"
        strokeWidth="1.4"
        strokeDasharray="3 3"
        strokeLinecap="round"
      />
      <path
        d="M183 76 L 190 80 L 183 84"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* server */}
      <g transform="translate(196, 30)" opacity="0.6">
        <rect width="84" height="100" rx="10" fill="var(--bg-elev)" stroke="var(--line-2)" />
        <rect
          x="10"
          y="14"
          width="64"
          height="22"
          rx="4"
          fill="var(--bg-card)"
          stroke="var(--line)"
        />
        <circle cx="18" cy="25" r="2" fill="var(--ok)" />
        <line x1="28" y1="25" x2="62" y2="25" stroke="var(--line-strong)" />
        <rect
          x="10"
          y="42"
          width="64"
          height="22"
          rx="4"
          fill="var(--bg-card)"
          stroke="var(--line)"
        />
        <circle cx="18" cy="53" r="2" fill="var(--gold)" />
        <line x1="28" y1="53" x2="58" y2="53" stroke="var(--line-strong)" />
        <rect
          x="10"
          y="70"
          width="64"
          height="22"
          rx="4"
          fill="var(--bg-card)"
          stroke="var(--line)"
        />
        <circle cx="18" cy="81" r="2" fill="var(--fg-3)" />
        <line x1="28" y1="81" x2="50" y2="81" stroke="var(--line-strong)" />
      </g>
      {/* tooltip pin */}
      <g transform="translate(196, 138)">
        <rect width="84" height="18" rx="4" fill="var(--bg-card)" stroke="var(--line-2)" />
        <text
          x="42"
          y="12"
          textAnchor="middle"
          fontSize="9"
          fontFamily="var(--font-ui)"
          fontWeight="500"
          fill="var(--fg-2)"
        >
          your server, your infra
        </text>
      </g>
    </svg>
  )
}

function ShareIllus() {
  return (
    <svg viewBox="0 0 320 160" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="share-thread" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--gold)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* server (small, left) */}
      <g transform="translate(28, 50)" opacity="0.6">
        <rect width="50" height="60" rx="6" fill="var(--bg-elev)" stroke="var(--line-2)" />
        <line x1="6" y1="14" x2="44" y2="14" stroke="var(--line-strong)" />
        <line x1="6" y1="26" x2="44" y2="26" stroke="var(--line-strong)" />
        <line x1="6" y1="38" x2="44" y2="38" stroke="var(--line-strong)" />
        <line x1="6" y1="50" x2="44" y2="50" stroke="var(--line-strong)" />
      </g>
      {/* laptop */}
      <g transform="translate(160, 30)">
        <rect width="120" height="80" rx="6" fill="var(--bg-card)" stroke="var(--line-2)" />
        <rect
          x="6"
          y="6"
          width="108"
          height="68"
          rx="3"
          fill="var(--bg-elev)"
          stroke="var(--line)"
        />
        {/* document being revealed */}
        <g transform="translate(40, 14)">
          <rect width="40" height="52" rx="3" fill="var(--bg-card)" stroke="var(--accent-line)" />
          <line x1="6" y1="12" x2="34" y2="12" stroke="var(--gold-soft)" strokeWidth="1.4" />
          <line x1="6" y1="20" x2="30" y2="20" stroke="var(--fg-3)" strokeWidth="1.4" />
          <line x1="6" y1="28" x2="34" y2="28" stroke="var(--fg-3)" strokeWidth="1.4" />
          <line x1="6" y1="36" x2="26" y2="36" stroke="var(--fg-3)" strokeWidth="1.4" />
          <line x1="6" y1="44" x2="32" y2="44" stroke="var(--fg-3)" strokeWidth="1.4" />
        </g>
        {/* base */}
        <path
          d="M-8 80 L 128 80 L 124 86 L -4 86 Z"
          fill="var(--bg-elev-2)"
          stroke="var(--line-2)"
        />
      </g>
      {/* thread reverse */}
      <path
        d="M82 80 Q 122 60, 158 80"
        fill="none"
        stroke="url(#share-thread)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* key glyph */}
      <g transform="translate(120, 118)">
        <circle cx="6" cy="6" r="5" fill="none" stroke="var(--gold)" strokeWidth="1.4" />
        <line
          x1="11"
          y1="6"
          x2="22"
          y2="6"
          stroke="var(--gold)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <line
          x1="18"
          y1="6"
          x2="18"
          y2="10"
          stroke="var(--gold)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
