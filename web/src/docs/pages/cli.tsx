import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ITerminal } from '../../marketing/icons.tsx'
import { DOCS_CLI } from '../../marketing/links.ts'
import { CodeBlock, Shell } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'
import { CommandPicker } from './cli-builder/components/CommandPicker'
import { ArgsForm } from './cli-builder/components/ArgsForm'
import { SnippetBox } from './install/components/SnippetBox'
import {
  decodeStateFromUrl,
  defaultCliBuilderState,
  encodeStateToUrl,
  type CliBuilderState,
} from './cli-builder/state'
import { generateCliCommand } from './cli-builder/templates'
import './cli-builder/cli-builder.css'

export function CLIReferencePage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [state, setState] = useState<CliBuilderState>(() => {
    return location.search ? decodeStateFromUrl(location.search) : defaultCliBuilderState
  })

  useEffect(() => {
    const newSearch = encodeStateToUrl(state)
    if (newSearch !== location.search) {
      navigate({ search: newSearch }, { replace: true })
    }
  }, [state, location.search, navigate])

  const cmd = useMemo(() => generateCliCommand(state), [state])

  return (
    <DocsPageShell
      to={DOCS_CLI}
      title="CLI reference."
      glyph={<ITerminal size={28} />}
      lead={
        <>
          <code>vellaris</code> is a Typer-based CLI for engineers, scripts, and CI pipelines.
          Pipe-able, scriptable, comfortable.
        </>
      }
    >
      <h2>Build a command</h2>
      <p>
        Pick a command, fill in the args, copy the result. Bookmark the URL to share a configured
        invocation.
      </p>
      <CommandPicker value={state.command} onChange={(command) => setState((p) => ({ ...p, command }))} />
      <ArgsForm state={state} onChange={(patch) => setState((p) => ({ ...p, ...patch }))} />
      <SnippetBox title="Run this" contents={`$ ${cmd}`} />

      <h2>Reference</h2>
      <CodeBlock lang="shell">
        {`$ vellaris --help
Usage: vellaris [OPTIONS] COMMAND [ARGS]...

  Files only the people you choose can read.

Commands:
  version  Print the installed Vellaris version.
  signup   Sign up a new user. Generates an RSA-4096 keypair on this machine.
  login    Run the challenge-response flow and cache a session token.
  logout   Revoke the cached session token.
  whoami   Print the currently signed-in user.
  push     Encrypt and upload a file.
  pull     Download and decrypt a document.
  ls       List documents available to the current user.
  rm       Delete a document. Owner only.
  share    Grant a user access to a document you own.
  revoke   Remove a user's access to a document.
  key      Manage your wrapped private key.`}
      </CodeBlock>

      <h2>Auth</h2>
      <CodeBlock lang="shell">
        <div>
          <span className="tok-cmt">
            # Sign up. --server is required; the URL is saved to ~/.vellaris/config.toml.
          </span>
        </div>
        <div>
          <span className="tok-cmt">
            # Username, email, and passphrase are prompted unless passed as flags.
          </span>
        </div>
        <Shell cmd="vellaris" args={['signup', '--server', 'https://vault.example.com']} />
        <div>
          <span className="tok-cmt"># Signing up alice at https://vault.example.com...</span>
        </div>
        <div>
          <span className="tok-cmt"># ✓ signed up as alice (id 9a4b21f8-...)</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt">
            # Log in. Server + username come from the saved config; override with flags.
          </span>
        </div>
        <Shell cmd="vellaris" args={['login']} />
        <Shell cmd="vellaris" args={['login', '--server', 'https://vault.example.com']} />
        <Shell cmd="vellaris" args={['login', '--username', 'alice']} />
        <div>
          <span className="tok-cmt"># ✓ logged in as alice</span>
        </div>
        <div>&nbsp;</div>
        <Shell cmd="vellaris" args={['whoami']} />
        <Shell cmd="vellaris" args={['logout']} />
      </CodeBlock>
      <div className="docs-callout">
        <span className="label">
          No <code>vellaris config</code> command
        </span>
        <span>
          The server URL is set the first time you run{' '}
          <code>vellaris signup --server &lt;url&gt;</code> and re-read on subsequent commands. To
          switch servers, pass <code>--server</code> on
          <code>login</code>, or edit <code>~/.vellaris/config.toml</code> directly.
        </span>
      </div>

      <h2>Files</h2>
      <CodeBlock lang="shell">
        <div>
          <span className="tok-cmt">
            # Push a file. --share / -s is repeatable; the owner is auto-included.
          </span>
        </div>
        <Shell cmd="vellaris" args={['push', 'report.pdf']} />
        <Shell cmd="vellaris" args={['push', 'report.pdf', '--share', 'bea', '--share', 'cyrus']} />
        <Shell cmd="vellaris" args={['push', 'report.pdf', '-s', 'bea', '-s', 'cyrus']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt">
            # List your view (--scope: mine, shared, all — defaults to all).
          </span>
        </div>
        <Shell cmd="vellaris" args={['ls']} />
        <Shell cmd="vellaris" args={['ls', '--scope', 'mine']} />
        <Shell cmd="vellaris" args={['ls', '--scope', 'shared']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt">
            # Pull. Default writes the original filename into CWD; --out / -o
          </span>
        </div>
        <div>
          <span className="tok-cmt"># overrides with a specific file path.</span>
        </div>
        <Shell cmd="vellaris" args={['pull', '<doc-id>']} />
        <Shell cmd="vellaris" args={['pull', '<doc-id>', '-o', './report.pdf']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Delete a document you own (revoke is forward-only).</span>
        </div>
        <Shell cmd="vellaris" args={['rm', '<doc-id>']} />
      </CodeBlock>

      <h2>Sharing</h2>
      <CodeBlock lang="shell">
        <div>
          <span className="tok-cmt">
            # Grant access. Fetches the recipient's public key, OAEP-wraps the DEK,
          </span>
        </div>
        <div>
          <span className="tok-cmt"># and POSTs the new grant.</span>
        </div>
        <Shell cmd="vellaris" args={['share', '<doc-id>', 'dana']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Revoke. The server drops dana's wrapped DEK row.</span>
        </div>
        <Shell cmd="vellaris" args={['revoke', '<doc-id>', 'dana']} />
      </CodeBlock>

      <h2>Key management</h2>
      <p>
        The wrapped private key lives at <code>~/.vellaris/keys/&lt;user-id&gt;.key</code>.
        It&rsquo;s useless without your passphrase. To move between machines:
      </p>
      <CodeBlock lang="shell">
        <div>
          <span className="tok-cmt"># Export uses a positional path — no -o flag.</span>
        </div>
        <Shell cmd="vellaris" args={['key', 'export', './alice.key']} />
        <div>
          <span className="tok-cmt">
            # Import requires --user since you may not be logged in yet.
          </span>
        </div>
        <Shell cmd="vellaris" args={['key', 'import', './alice.key', '--user', '<user-uuid>']} />
      </CodeBlock>
      <p>Or sync via the server (opt-in — the server stores opaque ciphertext):</p>
      <CodeBlock lang="shell">
        <Shell cmd="vellaris" args={['key', 'sync', 'push']} />
        <Shell cmd="vellaris" args={['key', 'sync', 'pull']} />
        <Shell cmd="vellaris" args={['key', 'sync', 'delete']} />
      </CodeBlock>

      <h2>Exit codes</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>0</code>
            </td>
            <td>Success.</td>
          </tr>
          <tr>
            <td>
              <code>1</code>
            </td>
            <td>
              Operation failed — server returned 4xx/5xx, decryption failed, document missing, etc.{' '}
              <code>stderr</code> carries the detail.
            </td>
          </tr>
          <tr>
            <td>
              <code>2</code>
            </td>
            <td>
              Missing required input — e.g. <code>vellaris login</code> with no saved server URL, or{' '}
              <code>vellaris key export</code> with no user on file.
            </td>
          </tr>
        </tbody>
      </table>

      <p>Use these in scripts:</p>
      <CodeBlock lang="shell">
        {`if ! vellaris pull "$id"; then
  case $? in
    2) echo "missing server / user — run vellaris signup --server first" ;;
    *) echo "pull failed — see vellaris error output above" ;;
  esac
fi`}
      </CodeBlock>
    </DocsPageShell>
  )
}
