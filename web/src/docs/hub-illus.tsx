/* Per-page hub-card illustrations. All token-palette only, all 240×120
 * viewBox so the hub grid is uniform. */

export function IllusQuickstart() {
  return (
    <svg viewBox="0 0 240 120" width="100%" height="100%" aria-hidden="true">
      <g transform="translate(81,16)">
        <rect width="78" height="92" rx="6" fill="var(--bg-card)" stroke="var(--line-2)" />
        <path d="M64 0 L78 14 L64 14 Z" fill="var(--bg-elev-2)" stroke="var(--line-2)" />
        <line x1="12" y1="28" x2="60" y2="28" stroke="var(--line-2)" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="12" y1="38" x2="64" y2="38" stroke="var(--line-2)" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="12" y1="48" x2="48" y2="48" stroke="var(--line-2)" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="12" y1="62" x2="64" y2="62" stroke="var(--line-2)" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <g transform="translate(126,76)" stroke="var(--gold)" strokeWidth="1.8" fill="none" strokeLinecap="round">
        <circle cx="6" cy="6" r="5.5" fill="var(--bg-card)" />
        <line x1="11.5" y1="6" x2="38" y2="6" />
        <line x1="28" y1="6" x2="28" y2="11" />
        <line x1="34" y1="6" x2="34" y2="12" />
      </g>
    </svg>
  )
}

export function IllusTrust() {
  return (
    <svg viewBox="0 0 240 120" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="docs-illus-trust-thread" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--gold)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M14 70 Q 60 30, 110 70 T 226 70"
        fill="none"
        stroke="url(#docs-illus-trust-thread)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g transform="translate(96,38)">
        <rect width="48" height="52" rx="9" fill="var(--accent-soft)" stroke="var(--accent-line)" />
        <g
          transform="translate(13,12)"
          stroke="var(--gold)"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        >
          <rect x="0" y="9" width="22" height="14" rx="2" />
          <path d="M4 9V6a7 7 0 0 1 14 0v3" />
        </g>
      </g>
    </svg>
  )
}

export function IllusCLI() {
  return (
    <svg viewBox="0 0 240 120" width="100%" height="100%" aria-hidden="true">
      <g transform="translate(20,20)">
        <rect width="200" height="80" rx="8" fill="#08071a" stroke="var(--line-2)" />
        <g transform="translate(10,8)">
          <circle cx="3" cy="3" r="3" fill="rgba(247,241,227,0.18)" />
          <circle cx="13" cy="3" r="3" fill="rgba(247,241,227,0.18)" />
          <circle cx="23" cy="3" r="3" fill="rgba(247,241,227,0.18)" />
        </g>
        <text x="14" y="38" fontFamily="var(--font-mono)" fontSize="10" xmlSpace="preserve">
          <tspan fill="rgba(247,241,227,0.45)">$ </tspan>
          <tspan fill="#f3c777">vellaris</tspan>
          <tspan fill="rgba(247,241,227,0.85)"> push file.pdf</tspan>
        </text>
        <text x="14" y="54" fontFamily="var(--font-mono)" fontSize="10" xmlSpace="preserve">
          <tspan fill="rgba(247,241,227,0.45)">$ </tspan>
          <tspan fill="#f3c777">vellaris</tspan>
          <tspan fill="rgba(247,241,227,0.85)"> ls</tspan>
        </text>
        <rect x="14" y="60" width="6" height="10" fill="var(--gold)">
          <animate attributeName="opacity" values="1;1;0;0" dur="1.1s" repeatCount="indefinite" />
        </rect>
      </g>
    </svg>
  )
}

export function IllusSDK() {
  return (
    <svg viewBox="0 0 240 120" width="100%" height="100%" aria-hidden="true">
      <g
        transform="translate(48,40)"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      >
        <path d="M14 0 H8 a4 4 0 0 0 -4 4 v6 a6 6 0 0 1 -4 6 a6 6 0 0 1 4 6 v6 a4 4 0 0 0 4 4 H14" />
      </g>
      <g
        transform="translate(178,40)"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      >
        <path d="M0 0 H6 a4 4 0 0 1 4 4 v6 a6 6 0 0 0 4 6 a6 6 0 0 0 -4 6 v6 a4 4 0 0 1 -4 4 H0" />
      </g>
      <text
        x="120"
        y="56"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="10"
        xmlSpace="preserve"
      >
        <tspan fill="var(--fg-2)">client = </tspan>
        <tspan fill="#f3c777">Client</tspan>
        <tspan fill="var(--fg-2)">()</tspan>
      </text>
    </svg>
  )
}

export function IllusDeploy() {
  return (
    <svg viewBox="0 0 240 120" width="100%" height="100%" aria-hidden="true">
      <g transform="translate(78,16)">
        <rect width="84" height="36" rx="6" fill="var(--bg-card)" stroke="var(--line-2)" />
        <circle cx="14" cy="18" r="2" fill="var(--ok)" />
        <line x1="22" y1="18" x2="68" y2="18" stroke="var(--line-strong)" strokeWidth="1.4" />
      </g>
      <g transform="translate(78,58)">
        <rect width="84" height="36" rx="6" fill="var(--bg-card)" stroke="var(--line-2)" />
        <circle cx="14" cy="18" r="2" fill="var(--gold)" />
        <line x1="22" y1="18" x2="58" y2="18" stroke="var(--line-strong)" strokeWidth="1.4" />
      </g>
      <g transform="translate(78,100)">
        <rect width="84" height="14" rx="3" fill="var(--accent-soft)" stroke="var(--accent-line)" />
        <text x="42" y="10" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--gold)">
          your infra
        </text>
      </g>
    </svg>
  )
}

export function IllusAPI() {
  return (
    <svg
      viewBox="0 0 240 120"
      width="100%"
      height="100%"
      stroke="var(--gold)"
      strokeWidth="1.4"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M40 18 V102" />
      <path d="M40 32 H92" />
      <path d="M40 56 H92" />
      <path d="M40 80 H92" />
      <g fontFamily="var(--font-mono)" fontSize="10" fill="var(--gold-soft)" stroke="none">
        <text x="100" y="36">/auth</text>
        <text x="100" y="60">/documents</text>
        <text x="100" y="84">/key-blobs</text>
      </g>
      <circle cx="40" cy="32" r="2.2" fill="var(--gold)" stroke="none" />
      <circle cx="40" cy="56" r="2.2" fill="var(--gold)" stroke="none" />
      <circle cx="40" cy="80" r="2.2" fill="var(--gold)" stroke="none" />
    </svg>
  )
}

export function IllusProtocol() {
  return (
    <svg viewBox="0 0 240 120" width="100%" height="100%" aria-hidden="true">
      <g transform="translate(20,40)" fontFamily="var(--font-mono)" fontSize="9">
        <rect width="46" height="40" rx="3" fill="var(--bg-card)" stroke="var(--accent-line)" />
        <text x="6" y="14" fill="var(--gold-soft)">VER</text>
        <text x="6" y="28" fill="var(--gold)">0x01</text>
      </g>
      <g transform="translate(72,40)" fontFamily="var(--font-mono)" fontSize="9">
        <rect width="60" height="40" rx="3" fill="var(--bg-card)" stroke="var(--accent-line)" />
        <text x="6" y="14" fill="var(--gold-soft)">NONCE</text>
        <text x="6" y="28" fill="var(--fg-2)">12 bytes</text>
      </g>
      <g transform="translate(140,40)" fontFamily="var(--font-mono)" fontSize="9">
        <rect width="40" height="40" rx="3" fill="var(--bg-card)" stroke="var(--accent-line)" />
        <text x="6" y="14" fill="var(--gold-soft)">TAG</text>
        <text x="6" y="28" fill="var(--fg-2)">16</text>
      </g>
      <g transform="translate(186,40)" fontFamily="var(--font-mono)" fontSize="9">
        <rect width="36" height="40" rx="3" fill="var(--bg-card)" stroke="var(--accent-line)" strokeDasharray="3 3" />
        <text x="6" y="14" fill="var(--gold-soft)">CT</text>
        <text x="6" y="28" fill="var(--fg-2)">…</text>
      </g>
    </svg>
  )
}
