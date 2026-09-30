# Architecture

The Electron main process starts a loopback-only HTTP service. The sandboxed renderer has context isolation and no Node access. External navigation is restricted to known provider documentation domains and the product domain. The app allows one instance and uses a stable local origin so browser storage persists between launches.

`domain.mjs` contains mock records, CSV validation and the campaign state machine. `market.mjs` defines local listings, unlocks and immutable snapshots. `connectors.mjs` defines provider profiles and required capabilities. `app.mjs` renders the workspace. `server.mjs` exposes only allowlisted static resources, a read-only legacy status check, and provider balance checks.

The service validates Host and Origin, requires a per-session token for key-bearing POST requests, sets a restrictive content security policy, bounds request bodies and uses fixed provider endpoints. Keys are held in memory and cleared on service shutdown. They never enter localStorage or campaign exports. Opaque references are scoped to the provider. API responses expose sanitized status rather than raw upstream payloads.

Workspace state uses localStorage in this prototype. It is neither encrypted nor a multiuser database. Running simulations recover as paused after reopening. Provider credentials must be entered again after closing the app. Do not use the preview to store real account credentials.

`ai.mjs` provides the Ollama adapter. The loopback service exposes `/api/ai/status` and token-protected `/api/ai/chat`. The backend origin/model come from the service environment, never from request input. Only bounded user/assistant chat messages are forwarded; a fixed system message and structured-output schema describe the existing workflow format. Responses are validated and copied into allowlisted draft fields. No tool execution, automatic publishing, credential access, or campaign execution is provided. Chat history stays in window memory; users explicitly save reviewed drafts. One generation per service is allowed at a time, with a three-minute upstream timeout and no automatic retries.

`api-client.mjs` fetches a fresh session before every write, allowing a browser window to survive a local service restart. Keys remain session-only. Credential replacement allocates a new opaque reference until the user saves the edited connection.

The public website is independent static HTML/CSS/JavaScript, served by the existing Hetzner Nginx. It contains no account API, provider key form, analytics or user submission collection. Its example campaign runs entirely in the browser. Its downloadable installers are built from the desktop package.
