import { Link } from 'react-router-dom'
import { IBookOpen } from '../icons.tsx'
import { DOCS_DEPLOY, DOCS_QUICKSTART } from '../../marketing/links.ts'
import { CodeBlock, Shell } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'

export function QuickstartPage() {
  return (
    <DocsPageShell
      to={DOCS_QUICKSTART}
      title="Quickstart."
      glyph={<IBookOpen size={28} />}
      lead={
        <>
          Three paths, same outcome — a file you encrypted, sitting on a server you control, that
          only the people you chose can read.
        </>
      }
    >
      <h2>CLI in 60 seconds</h2>
      <CodeBlock lang="shell">
        <Shell cmd="pip" args={['install', 'vellaris']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Point the CLI at a Vellaris server you trust.</span>
        </div>
        <Shell cmd="vellaris" args={['config', 'set', 'server', 'https://vault.example.com']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt">
            # Sign up. Generates an RSA-4096 keypair locally and asks for a passphrase. The
            passphrase never leaves your machine.
          </span>
        </div>
        <Shell
          cmd="vellaris"
          args={['signup', '--username', 'alice', '--email', 'alice@example.com']}
        />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Push a file, sharing it with bea and cyrus.</span>
        </div>
        <Shell cmd="vellaris" args={['push', 'report.pdf', '--share', 'bea', '--share', 'cyrus']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># List what you can read on this server.</span>
        </div>
        <Shell cmd="vellaris" args={['ls']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Pull a file someone shared with you.</span>
        </div>
        <Shell cmd="vellaris" args={['pull', '<doc-id>', '-o', '~/Downloads/']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Hand off access.</span>
        </div>
        <Shell cmd="vellaris" args={['share', '<doc-id>', 'dana']} />
        <Shell cmd="vellaris" args={['revoke', '<doc-id>', 'bea']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt">
            # Delete a document you own (recipients lose access; revoke is forward-only).
          </span>
        </div>
        <Shell cmd="vellaris" args={['rm', '<doc-id>']} />
      </CodeBlock>
      <p>
        The keystore lives at <code>~/.vellaris/keys/&lt;user-id&gt;.key</code>. The config lives
        at <code>~/.vellaris/config.toml</code>.
      </p>

      <h2>Server in 5 minutes</h2>
      <p>The server is one Docker container plus a Postgres (or SQLite for dev).</p>

      <h3>docker run (single-container, SQLite)</h3>
      <p>
        Good for trying it out. <strong>Not</strong> for production — SQLite + a single replica
        gives no durability guarantees.
      </p>
      <CodeBlock lang="shell">
        {`docker run -d --name vellaris \\
  -p 8000:8000 \\
  -v vellaris-data:/data \\
  -e VELLARIS_DATABASE_URL='sqlite+aiosqlite:////data/vellaris.db' \\
  -e VELLARIS_BLOB_BACKEND=local \\
  -e VELLARIS_BLOB_LOCAL_DIR=/data/blobs \\
  ghcr.io/subhayu99/vellaris:latest`}
      </CodeBlock>
      <p>Then:</p>
      <CodeBlock lang="shell">
        {`curl http://localhost:8000/healthz
# {"status":"ok"}`}
      </CodeBlock>

      <h3>docker compose (Postgres-backed)</h3>
      <CodeBlock lang="shell">
        {`git clone https://github.com/subhayu99/vellaris
cd vellaris
docker compose -f docker/compose.yaml up -d`}
      </CodeBlock>
      <p>
        The compose file launches Postgres + the server, runs Alembic migrations on boot, and
        exposes the API on <code>:8000</code>. For real deployments see the{' '}
        <Link to={DOCS_DEPLOY}>deployment guide</Link>.
      </p>

      <h2>Web UI</h2>
      <p>
        The SPA is a static build — drop it on any HTTPS host and point it at your Vellaris
        server.
      </p>
      <p>
        The official build is hosted at{' '}
        <a href="https://subhayu99.github.io/vellaris" target="_blank" rel="noreferrer">
          subhayu99.github.io/vellaris
        </a>
        . Each release also ships a self-host tarball <code>vellaris-web-vX.Y.Z.tar.gz</code>{' '}
        under{' '}
        <a
          href="https://github.com/subhayu99/vellaris/releases"
          target="_blank"
          rel="noreferrer"
        >
          GitHub Releases
        </a>
        .
      </p>
      <p>
        First load asks for your server&rsquo;s URL, runs <code>GET /healthz</code>, and caches
        the URL in <code>localStorage</code>. After signup the wrapped private key is stored
        locally too. <strong>localStorage is per-origin</strong> — two SPA deployments are
        independent.
      </p>

      <div className="docs-callout is-warn">
        <span className="label">If you forget your passphrase</span>
        <span>
          Your files are gone. There is no recovery flow — by design. Use a password manager or
          run <code>vellaris key export -o backup.key</code> and store the wrapped key somewhere
          safe.
        </span>
      </div>
    </DocsPageShell>
  )
}
