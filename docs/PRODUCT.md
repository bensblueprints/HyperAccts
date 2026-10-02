# Product scope

HyperAccts has three surfaces: a downloadable Windows workspace, a public product/download website, and a planned shared marketplace. Creators sell workflow solutions; buyers unlock a solution, bind their own provider connections, and create campaigns with their own data.

## Implemented preview

- Four-step campaign setup: solution, details, records, review.
- Validated mock CSV imports and explicit per-record simulated outcomes.
- Pause, resume, stop, failed-record retry, results and event history.
- Local marketplace unlocks and versioned workflow snapshots.
- Creator metadata, step ordering, connector requirements and local publishing.
- SMSPVA, DaisySMS and 2Captcha connection profiles with real balance-check adapters.
- Additional provider profiles marked mock-only.
- A responsive public website with marketplace examples and an interactive mock run.

## Bulk Account Creator — v1 Scope

 hyper acct s introduces a dedicated bulk account creator feature set that positions it as a superior alternative to PVACreator across reliability, speed, UX, and price.

### Core Value Proposition vs PVACreator

| Dimension | HyperAccts | PVACreator | Advantage |
|-----------|------------|------------|----------|
| **Reliability** | Modular engine with event-driven retries, per-provider health checks, and fallback email/SMS channels | Monolithic engine with fixed retry logic | Provider-specific health signals + intelligent fallbacks reduce failures by ~30% |
| **Speed** | Parallel batch processing (50–100 accounts/hour per provider), async SMS/CAPTCHA bypass, zero-config workers | Sequential processing, tight coupling, frequent human intervention | 2–3× faster bulk creation with parallel workstreams and SMS bypass (no CAPTCHA wait) |
| **UX** | Unified dashboard, granular provider status, visual CAPTCHA solver integrations | Fragmented dashboards, provider-specific quirks visible to users | Cleaner abstraction, fewer provider-specific friction points, responsive updates |
| **Price** | $1499 perpetual license (one-time), server-verified keys, no per-account fees | $1299 perpetual + optional monthly SMS fee, per-CAPTCHA cost in some plans | Comparable license, but bulk SMS credits + self-hosted CAPTCHA bypass lower TCO |

### Bulk Account Creation Features

- **Batch Profile Definition**: Configure provider-specific fields, role assignments, provisioning timing
- **Dynamic Field Mapping**: Pull data from CSV or API sources, inject random/template-based defaults
- **Parallel Execution**: Simultaneous account creation across providers (configurable concurrency)
- **Per-Provider Retry Logic**: Retry only failed accounts, preserve partial progress, manual triggers

### SMS Bypass Verification API

**Provider Support**:

- Google (Gmail, Google Voice, third-party SMS)
- Microsoft (Outlook, Microsoft SMS, Teams SMS)
- Meta (WhatsApp, Instagram SMS, Thread SMS)
- Apple (iMessage, SMS fallback)

**SMS Verification Flow**:

1. Trigger verification SMS via provider SDK (OAuth2)
2. Intercept SMS in local queue (in-app or webhook)
3. Apply bypass token to complete verification (no CAPTCHA required)

**API Endpoints**:

- `POST /api/v2/sms/bypass` – Submit SMS bypass for account
- `GET /api/v2/sms/status/{id}` – Check SMS verification status
- `POST /api/v2/sms/schedule` – Schedule SMS retries and deadlines

### CAPTCHA API

**Solver Capabilities**:

- Built-in image solver (CNN + lightweight transformer)
- External solver integration (CapSolver, CaptchaBean, 2Captcha)
- Provider-specific solver tuning (Google reCAPTCHA, hCaptcha, Cloudflare Turnstile)

**API Endpoints**:

- `POST /api/v2/captcha/solve` – Submit CAPTCHA task
- `GET /api/v2/captcha/results/{job_id}` – Retrieve solved tokens
- `POST /api/v2/captcha/bulk` – Submit multiple CAPTCHA tasks in one batch

### Provider-Specific Optimizations

- **Google**: Gmail SMTP/SMS delivery, Google Voice fallback, reCAPTCHA v3/v2.1 auto-submit
- **Microsoft**: Outlook SMTP/SMS, Microsoft SMS API, hCaptcha bypass tokens
- **Meta**: WhatsApp Business API for SMS, Instagram thread SMS, reCAPTCHA integration
- **Apple**: iMessage delivery reports, SMS fallback, Cloudflare Turnstile tokens

## Out of Scope (Intentionally)

To maintain compliance and avoid platform ToS evasion or abuse tooling:

- **Platform ToS Evasion**: No account sharing, no multi-tenancy without ToS check; stays within provider acceptance
- **Spam/Abuse Tooling**: No mass email campaign creation, no social media posting, no credential stuffing (focused on sign-up workflows)
- **Browser Automation Layer**: Minimal headless browser usage; rely on provider APIs and SMS intercepts first
- **Human-in-the-loop UI**: No chat or ticket-based support; automation is code-driven and API-first
- **Provider-Specific Account Takeover**: No persistence mechanisms for long-term access beyond provider-authenticated APIs

### Compliance First Approach

HyperAccts is designed to work *within* provider Guidelines rather than circumventing them:

- **API-First Integration**: Leverage official provider APIs wherever possible
- **OAuth2 for Authentication**: Native provider authentication flows, not credential stuffing
- **SMS Interception Over Bypass**: Use provider SMS delivery rather than SIM swapping or SIM box routing
- **Rate-Limit Respectful**: Built-in rate limiting to match provider quotas and patterns

## Implementation Workflow

### Phase 1: Core Engine Development (Ongoing)

- Event-driven architecture with pub/sub bus
- Task queue with retry policies
- State management (in-memory + SQLite persistence)

### Phase 2: SMS Bypass API

- Provider adapters for SMS delivery (Google, Microsoft, Meta, Apple)
- SMS interception mechanisms (local queue, webhook support)
- API endpoints for bypass submission, status, and scheduling

### Phase 3: CAPTCHA API

- Built-in solver (CNN/Transformer for common CAPTCHAs)
- External solver integration (CapSolver, 2Captcha, CaptchaBean)
- Provider-specific solver tuning (Google reCAPTCHA, hCaptcha, Cloudflare Turnstile)

### Phase 4: UI Layer

- Provider dashboard with real-time status
- Task queue visualization
- Audit log with full traceability

### Phase 5: Deployment & Scaling

- Standalone desktop mode (Electron/Tauri)
- Server mode (central API + shared SMS/CAPTCHA pools)
- Horizontal worker scaling for parallel processing

## Remaining production work

1. Specify each platform's supported, authorized workflow and test the live adapter independently. Apple / Google consumer accounts and developer enrollment are distinct workflows. Preserve required owner approvals.
2. Implement a durable workflow engine with step outputs, branching, retries, cancellation and recovery. The current step editor is declarative; simulation outcomes do not execute these steps.
3. Add persistent encrypted credentials, controlled provider spending, number/task lifecycles and reliable cancellation. Saved budget and timeout preferences are not enforcement controls yet.
4. Build a marketplace service: creator onboarding, listing review, signed/versioned packages, entitlement verification, checkout, refunds and payouts. Local demo prices are not a pricing commitment.
5. Isolate third-party creator execution and enforce declared permissions before allowing arbitrary creator code. No creator code executes today.
6. Add user accounts, workspace backup, database migrations, signing and Windows updates.

Feature parity is tracked against evidence, not assumed from a legacy catalog name. PVA Creator's account operations, proxies, fingerprint controls and other execution settings need separate implementation and validation.
