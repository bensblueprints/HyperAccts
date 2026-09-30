# Product scope

HyperAccts has three surfaces: a downloadable Windows workspace, a public product/download website, and a planned shared marketplace. Creators sell workflow solutions; buyers unlock a solution, bind their own provider connections, and create campaigns with their own data.

## Implemented preview

- Four-step campaign setup: solution, details, records, review.
- Validated mock CSV imports and explicit per-record simulated outcomes.
- Pause, resume, stop, failed-record retry, results and event history.
- Local marketplace unlocks and versioned workflow snapshots.
- Creator metadata, step ordering, connector requirements and local publishing.
- Ollama chat and validated workflow drafts, reviewed and saved through Creator studio.
- SMSPVA, DaisySMS and 2Captcha connection profiles with real balance-check adapters.
- Additional provider profiles marked mock-only.
- A responsive public website with marketplace examples and an interactive mock run.

## Remaining production work

1. Specify each platform's supported, authorized workflow and test the live adapter independently. Apple / Google consumer accounts and developer enrollment are distinct workflows. Preserve required owner approvals.
2. Implement a durable workflow engine with step outputs, branching, retries, cancellation and recovery. The current step editor is declarative; simulation outcomes do not execute these steps.
3. Add persistent encrypted credentials, controlled provider spending, number/task lifecycles and reliable cancellation. Saved budget and timeout preferences are not enforcement controls yet.
4. Build a marketplace service: creator onboarding, listing review, signed/versioned packages, entitlement verification, checkout, refunds and payouts. Local demo prices are not a pricing commitment.
5. Isolate third-party creator execution and enforce declared permissions before allowing arbitrary creator code. No creator code executes today.
6. Add user accounts, workspace backup, database migrations, signing and Windows updates.

Feature parity is tracked against evidence, not assumed from a legacy catalog name. PVA Creator's account operations, proxies, fingerprint controls and other execution settings need separate implementation and validation.
