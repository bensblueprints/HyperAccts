# HyperAccts

Version 0.2.0 adds persistent executable workflows, campaign runs, and a versioned workflow marketplace. The default interface uses the server runtime; the earlier browser simulation remains in source for historical tests.

## What works

- Creator studio supports validation, field transformation, HTTP API calls, owner approval, timed waits, export, and conditional steps.
- Publishing requires administrator review. Published versions are immutable; each campaign saves its exact workflow snapshot and hash.
- Campaigns import CSV or JSON, bind the owner's API connections, start/pause/resume/cancel, review uncertain results, retry failed records, and export CSV/JSON.
- SQLite persists workflows, campaigns, events, users and licenses. API credentials are encrypted with an installation-specific key.
- The marketplace supports free installs and Stripe Connect checkout with signed webhook verification. Paid orders require matching session, amount, currency and metadata; refunds/disputes revoke the associated entitlement.

This is an authorized API workflow engine. Platform-specific adapters, account inventory/sales and automatic bulk account registration are not included. Existing SMS/CAPTCHA endpoints remain balance-only compatibility routes; the live workflow engine does not use them.

## Run locally

Requires Node.js 22.13 or later. Run `npm ci`, `npm test`, then `npm start` and open http://127.0.0.1:4173. Desktop: `npm run desktop`. Windows packages: `npm run build:win`.

The default data directory is `~/.hyperaccts`; override `HYPERACCTS_DATA_DIR`. Electron uses its own user-data workspace directory. Back up the entire directory, including `credentials.key`, while the service is stopped. Losing the key makes saved credentials unreadable. The service remains bound to loopback.

To try a complete flow, open Marketplace, choose the free approval workflow, create a campaign, import records with `name,email`, Start, approve the record, Resume, and export its results. To call your own API, create a connection and add an HTTP step in Creator studio. Workflow templates use `{{name}}`, `{{record.email}}` and `{{steps.stepId.data.id}}`.

On restart, interrupted campaigns pause. An interrupted API write requires owner review because its remote outcome may be unknown. Pause/cancel lets the current write settle and prevents subsequent steps. Idempotency keys are supplied on writes; the receiving API must support them to provide deduplication.

## Hosted marketplace and payments

Use a separate data directory and an HTTPS reverse proxy that preserves the configured Host. Set `HYPERACCTS_PUBLIC_ORIGIN`, `HYPERACCTS_ADMIN_EMAIL`, and a strong `HYPERACCTS_ADMIN_PASSWORD` to bootstrap the administrator. Hosted mode requires sign-in and isolates records by owner. The local AI and legacy balance routes are unavailable in hosted mode.

Paid publishing additionally needs `HYPERACCTS_MARKETPLACE_STRIPE_KEY` and `HYPERACCTS_MARKETPLACE_WEBHOOK_SECRET`, Stripe Connect onboarding for each creator, and a webhook at `/api/runtime/payments/webhook`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, and `charge.dispute.created`. These credentials are separate from the website's desktop-license checkout. No real payment has been verified in this release's test run; payment tests use provider fixtures.

The Windows packages are unsigned. This branch does not automatically replace the public installer or publish a hosted marketplace.

## AI planning

The local assistant uses `HYPERACCTS_OLLAMA_URL` and `HYPERACCTS_AI_MODEL`. It provides planning text; it cannot execute a campaign or publish changes. Configure executable steps explicitly in Creator studio. Environment variables are read at startup; `.env` is not automatically loaded.

## Verification

`npm test` covers a real local HTTP campaign from workflow publication through persisted API response, owner approval and export; account isolation; immutable versions; uncertain writes; restart recovery; payment matching and out-of-order refunds; and request-origin/network restrictions. Browser QA also completed workflow creation, publication, campaign creation, approval and completion through the interface.
