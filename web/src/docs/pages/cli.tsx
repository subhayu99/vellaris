import { ITerminal } from '../../marketing/icons.tsx'
import { DOCS_CLI } from '../../marketing/links.ts'
import { CodeBlock, Shell } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'

export function CLIReferencePage() {
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
      <CodeBlock lang="shell">
        {`$ vellaris --help
Usage: vellaris [OPTIONS] COMMAND [ARGS]...

  Files only the people you choose can read.

Commands:
  version       Print the installed Vellaris version.
  signup        Create a new account on the configured server.
  login         Authenticate via challenge-response.
  logout        Drop the bearer token on the server and locally.
  whoami        Print the current logged-in user.
  push          Encrypt a file and upload to the server.
  pull          Download a file by document id and decrypt locally.
  ls            List documents you can see on the configured server.
  rm            Delete a document you own.
  share         Grant an additional user access to a document you own.
  revoke        Revoke a user's access to a document you own.
  key           Manage local + remote-synced wrapped private keys.`}
      </CodeBlock>

      <h2>Auth</h2>
      <CodeBlock lang="shell">
        <div>
          <span className="tok-cmt"># Configure the server URL once.</span>
        </div>
        <Shell cmd="vellaris" args={['config', 'set', 'server', 'https://vault.example.com']} />
        <div>&nbsp;</div>
        <Shell
          cmd="vellaris"
          args={['signup', '--username', 'alice', '--email', 'alice@example.com']}
        />
        <div>
          <span className="tok-cmt"># &gt; Generating RSA-4096 keypair…</span>
        </div>
        <div>
          <span className="tok-cmt"># &gt; Passphrase: ********</span>
        </div>
        <div>
          <span className="tok-cmt"># &gt; Wrapped private key written to ~/.vellaris/keys/&lt;user-id&gt;.key</span>
        </div>
        <div>&nbsp;</div>
        <Shell cmd="vellaris" args={['login']} />
        <div>
          <span className="tok-cmt"># &gt; Logged in as alice on https://vault.example.com</span>
        </div>
        <div>&nbsp;</div>
        <Shell cmd="vellaris" args={['whoami']} />
        <Shell cmd="vellaris" args={['logout']} />
      </CodeBlock>

      <h2>Files</h2>
      <CodeBlock lang="shell">
        <div>
          <span className="tok-cmt"># Push a file. --share is repeatable; the owner is auto-included.</span>
        </div>
        <Shell cmd="vellaris" args={['push', 'report.pdf']} />
        <Shell cmd="vellaris" args={['push', 'report.pdf', '--share', 'bea', '--share', 'cyrus']} />
        <Shell
          cmd="vellaris"
          args={['push', 'report.pdf', '--share', 'bea', '-m', '"Q1 financials, NDA only"']}
        />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># List your view.</span>
        </div>
        <Shell cmd="vellaris" args={['ls']} />
        <Shell cmd="vellaris" args={['ls', '--scope', 'mine']} />
        <Shell cmd="vellaris" args={['ls', '--scope', 'shared']} />
        <Shell cmd="vellaris" args={['ls', '--json', '|', "jq '.[] | .id'"]} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Pull. The CLI prints the original filename; -o sets the output path.</span>
        </div>
        <Shell cmd="vellaris" args={['pull', '<doc-id>']} />
        <Shell cmd="vellaris" args={['pull', '<doc-id>', '-o', '~/Downloads/']} />
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Delete a document you own (revoke is forward-only).</span>
        </div>
        <Shell cmd="vellaris" args={['rm', '<doc-id>']} />
      </CodeBlock>

      <h2>Sharing</h2>
      <CodeBlock lang="shell">
        <div>
          <span className="tok-cmt"># Grant access. Fetches the recipient's public key, OAEP-wraps the DEK,</span>
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
        <Shell cmd="vellaris" args={['key', 'export', '-o', 'alice.key']} />
        <Shell cmd="vellaris" args={['key', 'import', 'alice.key']} />
      </CodeBlock>
      <p>Or sync via the server (opt-in — the server stores opaque ciphertext):</p>
      <CodeBlock lang="shell">
        <Shell cmd="vellaris" args={['key', 'sync', 'push']} />
        <Shell cmd="vellaris" args={['key', 'sync', 'pull']} />
        <Shell cmd="vellaris" args={['key', 'sync', 'delete']} />
      </CodeBlock>

      <h2>Config</h2>
      <CodeBlock lang="shell">
        <Shell cmd="vellaris" args={['config', 'get', 'server']} />
        <Shell cmd="vellaris" args={['config', 'set', 'server', 'https://vault.example.com']} />
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
            <td><code>0</code></td>
            <td>Success.</td>
          </tr>
          <tr>
            <td><code>1</code></td>
            <td>Generic error (parsing, validation, unexpected).</td>
          </tr>
          <tr>
            <td><code>2</code></td>
            <td>Network — couldn&rsquo;t reach the server.</td>
          </tr>
          <tr>
            <td><code>3</code></td>
            <td>Auth — token expired, signature rejected, no such user.</td>
          </tr>
          <tr>
            <td><code>4</code></td>
            <td>Crypto — wrong passphrase, tampered blob, malformed key.</td>
          </tr>
          <tr>
            <td><code>5</code></td>
            <td>Conflict — username/email taken, document missing.</td>
          </tr>
        </tbody>
      </table>

      <p>Use these in scripts:</p>
      <CodeBlock lang="shell">
        {`if ! vellaris pull "$id"; then
  case $? in
    2) echo "server unreachable" ;;
    3) echo "logged out — run vellaris login" ;;
    *) echo "see vellaris error output" ;;
  esac
fi`}
      </CodeBlock>
    </DocsPageShell>
  )
}
