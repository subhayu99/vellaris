import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { VSigil } from '../../components/v-sigil.tsx'
import { IBraces, IServer, ITerminal } from '../../marketing/icons.tsx'
import {
  DOCS_API,
  DOCS_CLI,
  DOCS_DEPLOY,
  DOCS_PROTOCOL,
  DOCS_QUICKSTART,
  DOCS_SDK,
  DOCS_TRUST,
  REPO_URL,
} from '../../marketing/links.ts'
import {
  IllusAPI,
  IllusCLI,
  IllusDeploy,
  IllusProtocol,
  IllusQuickstart,
  IllusSDK,
  IllusTrust,
} from '../hub-illus.tsx'

interface HubCardProps {
  num: string
  title: string
  to: string
  illus: ReactNode
  children: ReactNode
  featured?: boolean
}

function HubCard({ num, title, to, illus, children, featured }: HubCardProps) {
  return (
    <Link className={`docs-hub-card${featured ? ' featured' : ''}`} to={to}>
      <div className="illus">{illus}</div>
      <div className="body">
        <span className="num">{num}</span>
        <h3>{title}</h3>
        <p>{children}</p>
        <span className="arrow">read →</span>
      </div>
    </Link>
  )
}

function PlateCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="docs-plate-cell">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

const FP_LINE = '9a:4b:21:f8:c0:e3:7d:91:e1:33:5a:9b:c4:f0:6a:21 · '.repeat(12)

export function DocsIndexPage() {
  return (
    <article className="docs-article">
      <div className="docs-hero">
        <div className="docs-hero-top">
          <span className="docs-secnum">
            <span className="num">00</span>
            <span className="sep">/</span>
            <span>Documentation</span>
          </span>
        </div>
        <div className="docs-h1-row">
          <h1 className="docs-h1">Self-host. Encrypt on device. Share by name.</h1>
          <div className="docs-glyph">
            <VSigil size={36} />
          </div>
        </div>
        <div className="docs-rule" aria-hidden="true" />
        <p className="docs-lead">
          Vellaris is open-source, end-to-end encrypted document sharing you self-host. Your laptop
          holds the keys; your server holds ciphertext; your colleagues just get the file. These
          docs cover every surface — CLI, SDK, web, server, protocol — and the trust boundary that
          ties them together.
        </p>
      </div>

      <div className="docs-content">
        <p>
          Pick the page that matches what you came here to do. The fastest path is the{' '}
          <Link to={DOCS_QUICKSTART}>quickstart</Link> if you want to push a file today; the{' '}
          <Link to={DOCS_TRUST}>trust model</Link> if you want to convince yourself the crypto is
          real before you install anything.
        </p>

        <div className="docs-hub">
          <HubCard
            featured
            num="01 · GET GOING"
            title="Quickstart"
            to={DOCS_QUICKSTART}
            illus={<IllusQuickstart />}
          >
            Install the CLI, sign up, push your first encrypted file, and pull it back in under a
            minute. Server-in-five for self-host.
          </HubCard>
          <HubCard num="02 · TRUST" title="Trust model" to={DOCS_TRUST} illus={<IllusTrust />}>
            The honest version. What is protected, what is not, and which crypto primitives carry
            the load.
          </HubCard>
          <HubCard num="03 · CLIENT" title="CLI" to={DOCS_CLI} illus={<IllusCLI />}>
            Every <code>vellaris ...</code> command, by example.
          </HubCard>
          <HubCard num="04 · CLIENT" title="Python SDK" to={DOCS_SDK} illus={<IllusSDK />}>
            Same path the CLI uses, exposed for scripts and notebooks.
          </HubCard>
          <HubCard num="05 · SERVER" title="Deployment" to={DOCS_DEPLOY} illus={<IllusDeploy />}>
            Docker, Compose with Postgres, Helm sketch, fly.io, Railway. What to back up.
          </HubCard>
          <HubCard num="06 · SERVER" title="OpenAPI" to={DOCS_API} illus={<IllusAPI />}>
            The typed contract at <code>/openapi.json</code> — codegen-ready.
          </HubCard>
          <HubCard
            num="07 · SERVER"
            title="On-wire protocol"
            to={DOCS_PROTOCOL}
            illus={<IllusProtocol />}
          >
            Byte-exact wire formats — envelope, wrapped key, RSA padding, auth flow.
          </HubCard>
        </div>

        <h2>At a glance</h2>
        <div className="docs-plate">
          <div className="docs-plate-head">
            <span className="label">Vault data plate</span>
            <span className="meta">9a:4b:21:f8 · sha256 · locked v0.1</span>
          </div>
          <dl className="docs-plate-grid">
            <PlateCell k="Latest release" v="v0.3.1 · alpha" />
            <PlateCell k="License" v="Apache-2.0" />
            <PlateCell k="Wire format" v="locked since v0.1" />
            <PlateCell k="Symmetric AEAD" v="AES-256-GCM" />
            <PlateCell k="DEK wrapping" v="RSA-4096 OAEP-SHA256" />
            <PlateCell k="Passphrase KDF" v="Argon2id · 256 MiB · 3 passes" />
            <PlateCell k="Audit signature" v="Ed25519" />
            <PlateCell k="Server runtime" v="FastAPI + Postgres / SQLite" />
          </dl>
          <div className="docs-plate-fp" aria-hidden="true">
            <span>{FP_LINE}</span>
          </div>
        </div>

        <h2>Three clients, one wire format</h2>
        <div className="docs-tri">
          <Link className="docs-tri-card" to={DOCS_CLI}>
            <span className="ic">
              <ITerminal size={18} />
            </span>
            <h4>CLI</h4>
            <p className="lead-s">Engineers, scripts, CI pipelines.</p>
            <code>pip install vellaris</code>
          </Link>
          <Link className="docs-tri-card" to={DOCS_SDK}>
            <span className="ic">
              <IBraces size={18} />
            </span>
            <h4>Python SDK</h4>
            <p className="lead-s">Automations, ETLs, webhook handlers.</p>
            <code>pip install vellaris</code>
          </Link>
          <a
            className="docs-tri-card"
            href={`${REPO_URL}#readme`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="ic">
              <IServer size={18} />
            </span>
            <h4>Web SPA</h4>
            <p className="lead-s">
              For colleagues who don&rsquo;t live in a terminal. Static build; deploy anywhere.
            </p>
            <code>github.com/.../web</code>
          </a>
        </div>
        <p style={{ marginTop: 18 }}>
          Every client speaks the same on-wire protocol; the server publishes its contract at{' '}
          <code>/openapi.json</code>. If you want a fourth, see the{' '}
          <Link to={DOCS_PROTOCOL}>on-wire protocol</Link>.
        </p>
      </div>
    </article>
  )
}
