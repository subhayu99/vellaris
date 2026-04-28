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
# Configure the server URL once.
vellaris config set server https://vault.example.com

vellaris signup --username alice --email alice@example.com
# > Generating RSA-4096 keypair…
# > Passphrase: ********
# > Confirm:    ********
# > Wrapped private key written to ~/.vellaris/keys/<user-id>.key

vellaris login
# > Username: alice
# > Passphrase: ********
# > Logged in as alice on https://vault.example.com

vellaris whoami
# alice (alice@example.com) on https://vault.example.com

vellaris logout
```

## Files

```bash
# Push a file. --share is repeatable; the owner is auto-included.
vellaris push report.pdf
vellaris push report.pdf --share bea --share cyrus
vellaris push report.pdf --share bea -m "Q1 financials, NDA only"

# List your view.
vellaris ls
vellaris ls --scope mine
vellaris ls --scope shared
vellaris ls --json | jq '.[] | .id'

# Pull. The CLI prints the original filename; -o sets the output path.
vellaris pull <doc-id>
vellaris pull <doc-id> -o ~/Downloads/

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
# Export to a file you can carry (still wrapped).
vellaris key export -o alice.key

# Import on the new machine.
vellaris key import alice.key
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

## Config

```bash
# Inspect / edit ~/.vellaris/config.toml.
vellaris config get server
vellaris config set server https://vault.example.com
```

## Exit codes

| Code | Meaning                                                            |
| ---: | ------------------------------------------------------------------ |
|    0 | Success                                                            |
|    1 | Generic error (parsing, validation, unexpected)                    |
|    2 | Network — couldn't reach the server                                |
|    3 | Auth — token expired, signature rejected, no such user             |
|    4 | Crypto — wrong passphrase, tampered blob, malformed key            |
|    5 | Conflict — username/email taken, document missing                  |

Use these in scripts:

```bash
if ! vellaris pull "$id"; then
  case $? in
    2) echo "server unreachable" ;;
    3) echo "logged out — run vellaris login" ;;
    *) echo "see vellaris error output" ;;
  esac
fi
```
