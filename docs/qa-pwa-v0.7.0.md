# PWA v0.7.0 — pre-release manual QA

The CI matrix covers typecheck / lint / format / unit tests / integration
tests / bundle size on every push. The list below is the **cross-platform**
acceptance pass that has to land before tagging — no automation can stand
in for a real OS notification surface or an actual home-screen install.

Run through each cell. Mark any "❌" with a one-liner in the PR
description; a single ❌ is a release blocker unless the tradeoff is
explicitly accepted in the cell's notes.

> **Test server**: a Vellaris deployment with `VELLARIS_VAPID_PRIVATE_KEY_PATH`
> + `VELLARIS_VAPID_SUBJECT` configured. `vellaris-server generate-vapid-key`
> produces the key; the CHANGELOG / `docs/deployment` covers the wiring.

## Devices

| ID  | Device                                         | OS / Browser            | Why this slot                                  |
| --- | ---------------------------------------------- | ----------------------- | ---------------------------------------------- |
| D1  | Real iPhone (any 16.4+)                        | iOS Safari, **standalone** | Push only delivers to home-screen apps on iOS |
| D2  | Real iPhone (any 16.4+)                        | iOS Safari, browser tab | The graceful "install first" path             |
| D3  | Android phone                                  | Chrome, installed PWA   | Beforeinstallprompt + push deliver via FCM    |
| D4  | Android phone                                  | Chrome, plain tab       | Verify the install banner + Notifications UI  |
| D5  | Mac / Windows                                  | Chrome 130+, installed  | Native window chrome + open-from-dock         |
| D6  | Mac / Windows                                  | Firefox latest, tab     | Push via Mozilla autopush, not FCM            |
| D7  | Mac                                            | Safari 17+, tab         | The browser-native PWA on macOS Sonoma        |

## Phase 1 — installable shell

| Slot | iOS std | iOS browser | Android std | Android tab | Chrome std | FF tab | Safari tab |
| ---- | :-----: | :---------: | :---------: | :---------: | :--------: | :----: | :--------: |
| Manifest loads (`/manifest.webmanifest` 200) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Install prompt offered (where applicable)    | ☐ | ☐ | ☐ | ☐ | ☐ | n/a | n/a |
| iOS instructions visible                     | n/a | ☐ | n/a | n/a | n/a | n/a | n/a |
| Standalone launch (no browser chrome)        | ☐ | n/a | ☐ | n/a | ☐ | n/a | n/a |
| Service worker activates (`navigator.serviceWorker.controller`) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Update banner appears on next deploy         | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

## Phase 2 — offline read

Steps per device, in DevTools (or the equivalent):

1. Sign in, load the dashboard, open at least one document.
2. Toggle Network → Offline.
3. Reload the dashboard. Expect: amber "Offline" pill in the header,
   "Working offline. Last refreshed N min ago." notice, list still
   visible from cache.
4. Open the previously-opened doc again — should decrypt + render.
5. Try a doc never opened on this device — should show a clear
   "needs network" error.

| Slot | iOS std | Android std | Chrome std | FF tab |
| ---- | :-----: | :---------: | :--------: | :----: |
| Offline pill renders             | ☐ | ☐ | ☐ | ☐ |
| Cached list visible              | ☐ | ☐ | ☐ | ☐ |
| Cached doc decrypts              | ☐ | ☐ | ☐ | ☐ |
| Never-opened doc fails cleanly   | ☐ | ☐ | ☐ | ☐ |

## Phase 3 — mutation queue

1. Drop the connection, hit "Encrypt & upload" with a small file.
2. Expect: dashboard shows the upload as a "Pending — will upload when online" row.
3. Reconnect.
4. Within a few seconds, the row should be replaced by the real
   server-side document; pending placeholder disappears.

Edge cases:

- Try Share or Revoke while offline → inline "Vellaris is offline" error,
  no request attempted.
- Settings → Wrapped key sync, click "Push to server" while offline →
  queues; on reconnect Settings should refetch and the indicator should
  still show "wrapped key on server".

| Slot | iOS std | Android std | Chrome std |
| ---- | :-----: | :---------: | :--------: |
| Pending placeholder renders          | ☐ | ☐ | ☐ |
| Replays + clears on reconnect        | ☐ | ☐ | ☐ |
| Share/revoke fail-fast offline       | ☐ | ☐ | ☐ |
| Keyblob push survives the queue      | ☐ | ☐ | ☐ |

## Phase 4 — Settings → Notifications

1. Open Settings on each device.
2. Confirm the section appears with the correct status.
3. Click Enable, accept the OS prompt, confirm a row lands in
   `push_subscriptions` server-side.
4. List the user's devices in Settings — every registered browser should
   appear once.
5. Delete one device row, confirm both the local `pushManager` and the
   server row are gone.

| Slot | iOS std | Android std | Chrome std | FF tab |
| ---- | :-----: | :---------: | :--------: | :----: |
| Section renders + accurate status        | ☐ | ☐ | ☐ | ☐ |
| Enable → server row appears              | ☐ | ☐ | ☐ | ☐ |
| Devices list mirrors server              | ☐ | ☐ | ☐ | ☐ |
| Disable on this device + server row gone | ☐ | ☐ | ☐ | ☐ |

## Phase 5 — push delivery (the headline test)

The cross-account test:

1. Sign in as Alice on D5 (desktop Chrome).
2. Sign in as Bob on each remaining device that has notifications
   enabled (D1, D3, D5 again with a different account, etc.).
3. From Alice's tab, share a doc with Bob via the doc-detail share UI.
4. Within ~2 seconds each Bob device should show an OS notification:
   `"alice shared a document with you"`.
5. Tap / click the notification.
6. Expected: an existing dashboard tab focuses + scrolls to the row, OR
   a fresh tab opens at `/dashboard?highlight=<doc_id>` and the row is
   highlighted briefly.
7. Repeat with Revoke.

Failure modes worth poking at deliberately:

- Disable notifications on one device after it's registered — the
  push-service should return 410 on the next send, the server should
  delete the row, and the device should silently stop receiving.
- Delete the server row from Settings while a push is mid-flight —
  the next attempt should clean up gracefully (no audit-log noise
  unless the push service itself returns an error).

| Slot                                       | D1 | D3 | D5 (Bob) |
| ------------------------------------------ | :: | :: | :----: |
| Share notification arrives                 | ☐  | ☐  | ☐      |
| Revoke notification arrives                | ☐  | ☐  | ☐      |
| Tap focuses existing dashboard             | ☐  | ☐  | ☐      |
| Tap opens new window with `?highlight=`    | ☐  | ☐  | ☐      |
| Row visibly highlighted on arrival         | ☐  | ☐  | ☐      |

## Bundle / performance gates

Re-run the CI gate locally on the release commit before tagging:

```sh
cd web && pnpm install --frozen-lockfile && pnpm build
total=$(find dist/assets -type f \( -name '*.js' -o -name '*.css' \) -exec gzip -c {} + | wc -c)
echo "gzipped bundle = $total bytes (limit 512000)"
test "$total" -le 512000
```

Spec target: **≤ 500 KB gzipped**. The Phase-2 build was 199 632 bytes.

## Server-side verification

```sh
# Cold migrate from a fresh DB to confirm the alembic chain still works.
rm -f vellaris.db
vellaris-server migrate
# Generate a fresh VAPID key, point the server at it, hit /notifications/public-key.
vellaris-server generate-vapid-key > /tmp/vapid.key
VELLARIS_VAPID_PRIVATE_KEY_PATH=/tmp/vapid.key \
  VELLARIS_VAPID_SUBJECT=mailto:ops@example.com \
  vellaris-server &
curl -s localhost:8000/notifications/public-key | jq .
```

Both should succeed; `public_key` round-trips back to the 32-byte raw key
written to `/tmp/vapid.key`.

## Tagging

Once every cell above is ☑ (or has an explicitly-accepted ❌ noted):

```sh
git tag v0.7.0 -m "PWA v0.7.0 — installable, offline, push"
git push origin v0.7.0
```
