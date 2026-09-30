# HyperAccts

A Windows desktop workspace for campaign workflows, reusable solutions, and a creator marketplace. The public website is designed for **HyperAccts.com**, hosted on the owner's Hetzner server.

## Preview status

Version 0.1.1 is an interactive product prototype with durable workspace storage, not a complete replacement execution engine. Campaign runs, solution purchases, and creator publishing are local simulations. No real accounts are created. There is no public marketplace backend or payment processing yet.

See [current blockers and implementation handoff](docs/BLOCKERS.md) for the requested live-mode, DeepSeek, proxy-import, account-inventory and sales features, the assistance scope boundary, and release/CI limitations.

Included: campaign creation and editing, strict mock CSV import, simulation controls, per-record results, failed-record retry, export, local persistence, demo solution unlocks, version snapshots, creator step editor, connector requirements, SMSPVA / DaisySMS / 2Captcha profiles and balance-check adapters, and a public product website.

Planned platform coverage: Gmail, YouTube, Outlook, Facebook, Reddit, Instagram, Amazon, Apple accounts and Apple Developer enrollment, Google accounts and Google Play Console enrollment. Actual inspected legacy coverage varies; see [audit](docs/AUDIT.md).

## Develop

Requires Node.js 22 or newer.

```sh
npm ci
npm test
npm run desktop
```

`npm start` opens the desktop UI's local service on 127.0.0.1:4173. `npm run website` serves the separate public website preview on 127.0.0.1:4180. The packaged desktop app uses 127.0.0.1:4174 and a single-instance lock.

## Windows download

```sh
npm run build:win
```

Produces `dist/HyperAccts-Setup-0.1.0.exe` and `dist/HyperAccts-Portable-0.1.0.exe` for Windows x64. Node.js is included in the app runtime; end users do not install development dependencies. Preview builds are unsigned. Production distribution needs code signing, update delivery, release validation, and a supported Windows version policy.

## Provider keys

Use Connectors → Configure → Live API / balance check only. Paste the key and select Test connection. Keys stay in the local service's memory for the session; connection profiles store only an opaque reference. Re-enter keys after restarting. Alternatively use the environment variables in `.env.example` (the server does not automatically load .env files). Do not commit keys.

Provider balance-check requests can reach real services when explicitly tested. Mock checks and campaign runs do not make provider purchases. Other provider cards are profile placeholders pending live adapters.

## Public hosting

Only the `website` directory is public. Desktop application routes and provider APIs are not deployed to the public site. `deploy/hyperaccts.nginx.conf` configures an isolated Nginx hostname at `/srv/hyperaccts/website`. Copy release installers into its `downloads` folder. The domain needs Cloudflare DNS records pointing to the Hetzner server, then an origin TLS certificate before using Cloudflare Full (strict). Never use Flexible SSL as the final configuration.

See [architecture](docs/ARCHITECTURE.md), [product scope](docs/PRODUCT.md), and [deployment](docs/DEPLOYMENT.md).
## Desktop workspace reliability (0.1.1 preview)

Open **Workspace settings** to see save status, export a JSON backup, or review and restore a backup. Existing version 1 browser data is migrated when durable storage is available. A running simulation reopens paused.

The Electron app stores `workspace.json` and `workspace.backup.json` under `workspace` in Electron's user-data directory. Writes are ordered, flushed and atomically replaced. Corrupt files are retained with unique names. Both workspace files and exports are unencrypted; provider keys and ephemeral connection-test references are excluded. The app remains a simulation workspace.

For an isolated development workspace, set `HYPERACCTS_DATA_DIR` before `npm start`. Without that override the development service uses `~/.hyperaccts/workspace`. A server created without a workspace directory offers browser-only preview storage. Use a single desktop workspace session; this is not a concurrent multiuser database.

For a separate desktop smoke test, create an empty profile directory and set `HYPERACCTS_PROFILE_DIR` to that directory and `HYPERACCTS_DESKTOP_PORT` to an unused local port before launching. The normal desktop defaults remain unchanged; a separate profile/port does not migrate another profile's browser data.

Run `npm ci`, `npm test`, and `npm run build:win` on Windows. Version 0.1.1 produces an unsigned setup installer and portable preview under `dist`. The public 0.1.0 download remains separate.
