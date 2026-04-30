import { useReducedMotion } from '../marketing/hooks.ts'

/* Auth-flow sequence diagram. Two actor boxes, dotted lifelines, four
 * message arrows, monospace labels travel along each path on a stagger.
 * Reduced-motion → labels are static at midpoint. */

export function AuthFlow() {
  const reduced = useReducedMotion()
  return (
    <div className="auth-stage auth-anim">
      <svg
        viewBox="0 0 880 360"
        width="100%"
        role="img"
        aria-label="Auth flow sequence diagram: client posts /auth/challenge, server returns nonce, client signs with private key, server returns bearer token"
      >
        {/* lifelines */}
        <line x1="160" y1="60" x2="160" y2="320" stroke="var(--accent-line)" strokeWidth="1" strokeDasharray="2 5" />
        <line x1="720" y1="60" x2="720" y2="320" stroke="var(--accent-line)" strokeWidth="1" strokeDasharray="2 5" />

        {/* actor: client */}
        <g transform="translate(80,18)">
          <rect width="160" height="40" rx="8" fill="var(--bg-elev)" stroke="var(--line-2)" />
          <g
            transform="translate(14,12)"
            stroke="currentColor"
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--fg-2)' }}
          >
            <path d="m4 5 4 4-4 4" />
            <path d="M11 13h6" />
          </g>
          <text x="44" y="24" fontFamily="var(--font-ui)" fontSize="13" fontWeight="600" fill="var(--fg)">
            client
          </text>
          <text x="44" y="36" fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-3)">
            alice · cli
          </text>
        </g>

        {/* actor: server */}
        <g transform="translate(640,18)">
          <rect width="160" height="40" rx="8" fill="var(--bg-elev)" stroke="var(--line-2)" />
          <g
            transform="translate(14,12)"
            stroke="currentColor"
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--fg-2)' }}
          >
            <rect x="0" y="0" width="16" height="6" rx="1.5" />
            <rect x="0" y="9" width="16" height="6" rx="1.5" />
            <circle cx="3.5" cy="3" r=".7" fill="currentColor" />
            <circle cx="3.5" cy="12" r=".7" fill="currentColor" />
          </g>
          <text x="44" y="24" fontFamily="var(--font-ui)" fontSize="13" fontWeight="600" fill="var(--fg)">
            vellaris-server
          </text>
          <text x="44" y="36" fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-3)">
            your infra
          </text>
        </g>

        <FlowArrow
          y={104}
          from={160}
          to={720}
          dir="rl"
          eyebrow="POST /auth/challenge"
          label='{"username": "alice"}'
          delay="0s"
          reduced={reduced}
        />

        {/* server-side note */}
        <g transform="translate(540,138)">
          <rect width="200" height="36" rx="6" fill="var(--bg-card)" stroke="var(--line)" />
          <text x="14" y="16" fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg-2)">
            generate
          </text>
          <text x="14" y="30" fontFamily="var(--font-mono)" fontSize="11" fill="var(--gold-soft)">
            (challenge_id, nonce)
          </text>
        </g>

        <FlowArrow
          y={196}
          from={720}
          to={160}
          dir="lr"
          eyebrow="201 Created"
          label="{ challenge_id, nonce, expires_at }"
          delay="1.4s"
          reduced={reduced}
        />

        {/* client-side note */}
        <g transform="translate(40,224)">
          <rect width="280" height="50" rx="6" fill="var(--bg-card)" stroke="var(--line)" />
          <text x="14" y="18" fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg-2)">
            unwrap private key locally
          </text>
          <text x="14" y="32" fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg-2)">
            msg = challenge_id.bytes ‖ nonce
          </text>
          <text x="14" y="46" fontFamily="var(--font-mono)" fontSize="11" fill="var(--gold-soft)">
            sig = RSA-PSS(msg, sk)
          </text>
        </g>

        <FlowArrow
          y={296}
          from={160}
          to={720}
          dir="rl"
          eyebrow="POST /auth/verify"
          label="{ challenge_id, signature }"
          delay="2.8s"
          reduced={reduced}
        />

        <FlowArrow
          y={336}
          from={720}
          to={160}
          dir="lr"
          eyebrow="200 OK"
          label="{ token, expires_at, user }"
          delay="4.2s"
          reduced={reduced}
        />
      </svg>
    </div>
  )
}

interface FlowArrowProps {
  y: number
  from: number
  to: number
  dir: 'lr' | 'rl'
  eyebrow: string
  label: string
  delay: string
  reduced: boolean
}

function FlowArrow({ y, from, to, dir, eyebrow, label, delay, reduced }: FlowArrowProps) {
  const x1 = from
  const x2 = to
  const head =
    dir === 'rl'
      ? `M${x2 - 8},${y - 5} L${x2},${y} L${x2 - 8},${y + 5}`
      : `M${x2 + 8},${y - 5} L${x2},${y} L${x2 + 8},${y + 5}`
  const pathId = `flow-${y}`
  const start = '-30%'
  const end = '130%'
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.4" />
      <path d={head} fill="none" stroke="var(--accent)" strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <text
        x={(x1 + x2) / 2}
        y={y - 14}
        textAnchor="middle"
        fontFamily="var(--font-ui)"
        fontSize="10.5"
        fill="var(--fg-3)"
        letterSpacing="0.14em"
      >
        {eyebrow.toUpperCase()}
      </text>
      <path id={pathId} d={`M${x1},${y + 14} L${x2},${y + 14}`} fill="none" />
      <text fontFamily="var(--font-mono)" fontSize="11" fill="var(--gold-soft)" opacity="0.95">
        <textPath href={`#${pathId}`} startOffset={reduced ? '50%' : start}>
          {label}
          {!reduced && (
            <animate
              attributeName="startOffset"
              values={`${start};${end}`}
              dur="3.6s"
              begin={delay}
              repeatCount="indefinite"
            />
          )}
        </textPath>
      </text>
    </g>
  )
}
