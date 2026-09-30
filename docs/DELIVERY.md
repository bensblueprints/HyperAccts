# Post-purchase delivery (task 491) — implementation and handoff

## What is implemented

`website/licensing.mjs` and the delivery routes in `website/server.mjs` implement the
gated part of the purchase flow. All delivery is keyed on a **verified payment**, never
on client-side claims:

1. A Stripe `checkout.session.completed` webhook (signature-verified, idempotent) writes
a delivery record under `website/data/payloads.jsonl`.
2. `GET /api/deliver?session_id=S` returns a finite JSON payload only if `S` has a
   persisted paid record: `{license_key, download_url, expires_in_seconds}`. If the
   session was not paid, it returns 403.
3. `GET /api/download?token=T` streams the installer only when `T` is a valid,
   unexpired HMAC-signed token (default TTL 1 hour). Otherwise 403/404.

### License keys

Keys are `HYAC-XXXX-XXXX-XXXX-XXXX`; the final group is a truncated HMAC-SHA256 over the
first three groups, keyed with `LICENSE_SECRET`. `verifyLicenseKey()` documents the
contract the desktop app's offline verifier must implement so a purchased key can be
accepted without a network call.

## Environment (never committed)

- `LICENSE_SECRET` — signs keys and tokens; >= 16 chars. Must match any desktop verifier.
- `DELIVERY_TOKEN_TTL` — download-token lifetime in seconds (default 3600).
- `INSTALLER_PATH` — absolute or repo-relative path to the installer binary
  (default `website/downloads/HyperAccts-Setup-0.1.0.exe`). The binary is gitignored.

## Remaining dependencies (external, not resolvable in this project)

1. **Stripe credentials** (task 490): `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`,
   `STRIPE_WEBHOOK_SECRET`. Until these exist, no `checkout.session.completed` event can
   be recorded, so `/api/deliver` correctly refuses everything. End-to-end test-mode
   verification (task 495) requires these keys.
2. **Installer binary**: the repo has no `website/downloads/*.exe` (gitignored, built via
   `npm run build:win` and published as a release). The file must be present on the
   production host (or `INSTALLER_PATH` pointed at it) for download to work.
3. **Desktop-app offline key verification** (engineering): the Electron app does not yet
   validate a purchased license key. Until it does, "activation" and the void-on-
   activation refund rule cannot be enforced client-side.
4. **Receipt email**: delivery currently returns the key/download via `/api/deliver`;
   the emailed receipt + key resend path still requires a mail provider integration.

## Security notes

- Secrets live only in server environment; nothing is committed.
- Delivery token is signed + expiring; the installer is not freely scrapeable.
- `/api/deliver` and `/api/download` fail closed when `LICENSE_SECRET` is unset.
