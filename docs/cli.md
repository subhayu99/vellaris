# CLI reference

`vellaris` is a Typer-based CLI for engineers, scripts, and CI pipelines.

```bash
$ vellaris --help
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
  key           Manage local + remote-synced wrapped private keys.
```

## Auth

```bash
# Sign up. --server is required; the URL is saved to ~/.vellaris/config.toml.
# Username, email, and passphrase are prompted unless passed as flags.
vellaris signup --server https://vault.example.com
# Signing up alice at https://vault.example.com...
# ✓ signed up as alice (id 9a4b21f8-...)

# Log in. Server + username come from the saved config; override with flags.
vellaris login
vellaris login --server https://vault.example.com
vellaris login --username alice
# ✓ logged in as alice

vellaris whoami
# username: alice
# email:    alice@example.com
# id:       9a4b21f8-...
# server:   https://vault.example.com

vellaris logout
```

There is no `vellaris config` command. The server URL is set the first
time you run `vellaris signup --server <url>` and re-read on subsequent
commands. To switch servers later, pass `--server` on `vellaris login`
or edit `~/.vellaris/config.toml` directly.

## Files

```bash
# Push a file. --share / -s is repeatable; the owner is auto-included.
vellaris push report.pdf
vellaris push report.pdf --share bea --share cyrus
vellaris push report.pdf -s bea -s cyrus

# List your view (--scope: mine, shared, all — defaults to all).
vellaris ls
vellaris ls --scope mine
vellaris ls --scope shared

# Pull. Default writes the original filename into CWD; --out / -o
# overrides with a specific file path.
vellaris pull <doc-id>
vellaris pull <doc-id> -o ./report.pdf

# Delete a document you own. Recipients lose access; what they already
# downloaded is theirs forever (revoke is forward-only).
vellaris rm <doc-id>
```

## Sharing

```bash
# Grant access. The CLI fetches the recipient's public key from the
# server, OAEP-wraps your local DEK to them, and POSTs the new grant.
vellaris share <doc-id> dana

# Revoke. The server drops dana's wrapped DEK row.
vellaris revoke <doc-id> dana
```

## Key management

The wrapped private key lives at `~/.vellaris/keys/<user-id>.key`. It's
useless without your passphrase. To move between machines:

```bash
# Export uses a positional path — no -o flag.
vellaris key export ./alice.key

# Import requires --user since you may not be logged in yet.
vellaris key import ./alice.key --user <user-uuid>
```

Or sync via the server (opt-in — the server stores opaque ciphertext):

```bash
# Push your wrapped key to the server.
vellaris key sync push

# Pull on a new device, then `vellaris login` as usual.
vellaris key sync pull

# Delete the server copy.
vellaris key sync delete
```

## Exit codes

| Code | Meaning                                                                                  |
| ---: | ---------------------------------------------------------------------------------------- |
|    0 | Success                                                                                  |
|    1 | Operation failed — server returned 4xx/5xx, decryption failed, document missing, etc.    |
|    2 | Missing required input — e.g. `vellaris login` with no saved server URL                  |

Use these in scripts:

```bash
if ! vellaris pull "$id"; then
  case $? in
    2) echo "missing server / user — run vellaris signup --server first" ;;
    *) echo "pull failed — see vellaris error output above" ;;
  esac
fi
```
