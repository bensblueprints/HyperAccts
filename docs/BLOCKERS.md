# Implementation status and blockers

Updated September 30, 2026. This is a handoff of the actual implementation, not a claim of production readiness.

## Source fixes — October 1, 2026

- Added an Ollama-backed AI assistant, defaulting to Qwen3 Coder Next Abliterated. It supports chat and natural-language workflow drafts that users inspect in the existing creator editor. Generated content is validated and cannot execute actions. DeepSeek and public catalog search remain unimplemented.
- Verified a real Coder response through the local HTTP API and the UI: a three-step YouTube checklist opened in Creator studio and saved as a draft.
- Connector writes fetch a fresh session token on every request, fixing stale tokens after a service restart without automatically retrying writes. Changing a credential creates a new reference so cancelling an edit does not replace the saved profile's key. Failed checks and mode changes clear stale check indicators; edits/saves cannot race an active check.
- Added six regression checks, bringing the local suite to 11 passing tests.
- Added `.github/workflows/check.yml` for Windows tests and installer builds. GitHub SSH authentication is available, avoiding the HTTPS OAuth token's missing workflow scope. Check the branch's Actions result before merging.
- These changes are in source; the public 0.1.0 download remains the original preview until a new release is published.

## Published and verified

- Private repository: https://github.com/bensblueprints/HyperAccts
- Windows x64 installer and portable preview: https://github.com/bensblueprints/HyperAccts/releases/tag/v0.1.0
- Public website: https://hyperaccts.com/ and https://www.hyperaccts.com/
- Website runs on the owner's Hetzner server. HTTPS responds successfully for both names, HTTP redirects to HTTPS, and Certbot renewal is configured. Cloudflare proxying is owner-managed; Full (strict) can be enabled now that the origin certificate is installed.
- Five automated checks passed for simulation recovery/retry, CSV validation, version snapshots/unlocks, connector compatibility, and local API protections with mocked upstream balance responses.
- Browser checks exercised creator publishing, a mock DaisySMS connection, website filtering and simulated execution. The packaged Windows application launched successfully.
- The Hetzner installer checksum matched the local build. No live provider account credentials or paid operations were used in validation.

## Requested work that is not implemented

| Request | Actual status / blocker |
|---|---|
| Take the app out of simulation mode | There is no live campaign execution engine to enable. The runner generates configured mock outcomes. Removing the label would not create live behavior. |
| Playwright / browser-use execution | Neither runtime is integrated into the shipped application. Browser control used during development is not an application feature. Browser sessions, step execution and recovery are missing. |
| Talk to the app through DeepSeek | Ollama chat, model configuration, window-local conversation history, and reviewed workflow drafts now exist. A DeepSeek adapter and API key are still absent. |
| Find or create solutions from natural language | Natural-language draft generation now works through Ollama. The catalog still consists of local listings; no shared solution search backend exists. |
| Import and bind proxies | No proxy importer, proxy credential storage, validation, browser-profile assignment or campaign binding is implemented. SMS/CAPTCHA connector bindings are separate and do not bind proxies. |
| Created-account inventory | No real account creation occurs. The results table contains mock campaign records, not a secure account inventory. Durable storage, credential handling and an inventory interface are missing. |
| List an account for sale with a price | Not implemented. The existing price field belongs to a reusable workflow solution. There is no account listing, account transfer, checkout or sales backend. |
| Public creator marketplace | Publishing and unlocking happen only in the local workspace. Authentication, shared listings, package review, entitlements, payments and payouts are missing. |
| Full PVA Creator parity | Partial audit only. Several wizards were inspected; Reddit/Instagram were catalog-only, Apple was partial, and dedicated developer enrollment modules were not verified. See AUDIT.md. |
| Live SMS/CAPTCHA operations | SMSPVA, DaisySMS and 2Captcha have balance-check adapters only. No number ordering, code retrieval or CAPTCHA task submission is implemented. Other providers are mock profile slots. |

## Assistance boundary communicated during this work

The assistant declined to implement bulk account creation that bypasses third-party verification or anti-abuse controls, or to connect that process to an account-selling operation. This is a scope restriction on assistance, not a technical claim that Playwright, browser-use, proxies or DeepSeek cannot automate a browser. No claim is made that these tools are inherently prohibited.

Permissible alternatives offered were official-API integrations, workflows for accounts the operator is authorized to manage, testing on owned systems, and workflows that stop for the user to complete required verification. These alternatives have not yet been implemented. The user has not selected a narrowed live workflow for implementation.

## Engineering and release limitations

- Workspace state is localStorage, not an encrypted multiuser database. No production migration, backup or account-vault mechanism exists.
- Provider keys are held in local service memory and must be entered again after restart. Budget and timeout preferences do not enforce live campaign spending or runtime limits.
- Workflow steps are declarative metadata. The simulator does not execute their definitions, branching or creator code.
- The preview binaries are unsigned. Automatic updates, release signing and a supported Windows version policy remain outstanding. Executable resource editing is currently disabled in the packaging configuration.
- The installer is the 0.1.0 preview, not a build of later documentation or website-hosting changes. The repository's main branch is the current source of truth.
- The initial HTTPS push could not publish Actions because its OAuth token lacked `workflow` scope. A workflow now lives under `.github/workflows/check.yml`; use the existing GitHub SSH identity to push it. `docs/check-workflow.yml` records the original handoff template.
- No end-to-end live platform account creation, live payment, provider-spending or account-transfer testing has been performed.

## Handoff references

- README.md: setup and Windows build commands.
- docs/ARCHITECTURE.md: desktop service, renderer and public site separation.
- docs/PRODUCT.md: implemented preview and production backlog.
- docs/AUDIT.md and audit-evidence.json: legacy inspection evidence and limits.
- docs/DEPLOYMENT.md and deploy/hyperaccts.nginx.conf: verified hosting configuration.

Do not describe mock results, local demo unlocks or balance checks as completed live account workflows.
