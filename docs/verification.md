# Current-instance verification

Verified in the cloud workspace on October 14, 2026 with Node 24.19.0, Next.js 16.4.0, Chromium and real local PostgreSQL 17.9.

| Check | Outcome |
|---|---|
| Frozen-lockfile `npm ci` | Passed, with artifact integrity verification |
| TypeScript check | Passed |
| Unit tests | 39 passed, 0 failed/skipped |
| Real PostgreSQL integration tests | 30 passed, 0 failed/skipped |
| Chromium acceptance tests | 5 passed, 0 failed/skipped against the production-built local console |
| Production build | Passed for current UI, provider adapters and web/worker telemetry; no build warnings |
| Database restart | Passed; existing data retained |
| Migrations and seed repeated | Passed; existing state preserved |
| `dev:up` and functional API smoke | Passed; web and worker started, four campaign snapshots returned |
| Continuous worker | Approved demo command reached verified with linked audit/read-back evidence |
| Railway worker Docker build | Passed; production dependencies, Node 24.21.0, unprivileged runtime |
| Container startup guards | Missing live mode and transaction-pooled worker configuration correctly exit with errors |

Browser checks exercise overview/navigation, campaign search, attribution, integrations, approval/manual verification, audit history, kill-switch persistence, mobile width and foreign-origin rejection. Screenshots are under ignored `.local/overview.png` and `.local/mobile.png`. Demo budget changes made by acceptance checks are retained, not reset.

This validates the current local application and worker packaging, not a published snapshot, new-task restoration, hosted container deployment, Clerk login, Google API compatibility, real Ads/GA4/CRM integrations, model quality, statistically calibrated forecasts, offline attribution, production telemetry or autonomous live behavior. The fifth browser test uses an intercepted live-data fixture; it does not exercise Clerk authentication. Those gates remain documented in release-gates.md and implementation-status.md.

Provider transports are tested with injected HTTP fixtures, not live credentials. Added real PostgreSQL checks cover external dispatch intent, crash-after-write reconciliation, no ambiguous replay, concurrent sync, bounded retries and financial corrections preserving economic dates.

Current database coverage also verifies full account spend independently from active inventory, removed-campaign spend, empty inventory, atomic failure, immutable tenant-isolated account history, late cost corrections and rejection of manager accounts as advertising customers. Cross-tenant execution tests verify one physical-resource lock across two authorized tenants.

The worker image contains no local environment/database files or build-secret files. Image configuration contains no hosting credentials, proxy bindings or custom CA bindings. This cloud Docker client injects proxy variables into containers started locally; those client defaults are separate from the image configuration. TLS verification remained enabled during the build.

The first browser rerun found expired pending proposals blocking replacement diagnostics. The implementation now aborts expired proposals with audit history; the regression test and all four browser checks passed after that fix.

Hosting planning and live preflight were exercised: they correctly report missing deployment access/identity and reject the local demo database. No hosting resources were created. Authenticated hosting API calls and database role provisioning remain unverified.
