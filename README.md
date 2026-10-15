# AdOS — Autonomous Google Ads Operating System

An internal-first, SaaS-ready implementation of the supplied architecture baseline. The working local release uses **synthetic accounts and a deterministic demo Ads adapter**. It includes a Next.js operator console, real PostgreSQL storage, evidence-linked proposals, policy checks, human approvals, durable commands, read-back verification, append-only audit records, and CRM outcome reconciliation.

**No live advertising account is connected. Live writes default to disabled and require independently validated account gates.** This is a foundation and controlled-execution prototype, not completion of all five delivery phases or authorization for production autonomy.

## Start locally

Requires Node.js 24 LTS, npm, and a supported embedded PostgreSQL platform (Linux x64 tested). No Docker, external database, AI key, or Google credentials are required for the demo.

```sh
npm ci
cp .env.example .env.local # only if you do not already have local settings
npm run dev:up
```

The console runs on local port 3000. `dev:up` starts PostgreSQL on loopback port 54329 if needed, applies migrations, seeds demo data once, and starts the demo worker and web application. Interrupting it stops only its owned processes. Data persists in ignored `.local/postgres`. Existing demo changes survive restart.

For separate terminals:

```sh
npm run db:start
# after PostgreSQL reports ready, in another terminal:
npm run db:migrate
npm run db:seed
npm run dev
# optional continuous execution, in another terminal:
npm run worker
```

Without the worker, use **Decisions → Process next command**. Refresh demo data if fixtures become stale. New snapshots do not refresh an old proposal's evidence: refresh aborts expired pending proposals with an audit event and generates a fresh diagnostic proposal when the evidence qualifies.

## Verify

With PostgreSQL running and migrations applied:

```sh
npm run typecheck
npm test
npm run test:integration
npm run build
```

With the web application running, `npm run test:browser` runs Chromium acceptance checks. The cloud machine uses its installed Chromium; otherwise install Playwright Chromium with `npx playwright install chromium`. Screenshots and failure traces are saved under ignored `.local/`. Browser tests intentionally exercise the synthetic operator account and can change its demo budget and audit history.

Integration tests use real PostgreSQL with a non-superuser application role, create isolated test tenants, and cover RLS, composite foreign keys, permission gates, concurrent workers, duplicate approvals, ambiguous timeouts, bounded retries, quarantine, kill switches, immutable audit history, and revenue corrections. Tests never use Google Ads or real customer data. Test tenants accumulate in the disposable local database; recreate it only when you intend to discard local data.

Functional readiness requires `/api/health` to return `status: ok`, `/api/console` to contain account snapshots and proposals, and a reviewed demo command to reach `verified` with an audit event and read-back record.

## Operator workflow

1. Inspect freshness, spend, campaigns and finalized synthetic CRM outcomes.
2. Open a decision and review its source snapshot, sample size, mutation, impact, policy version and expiry.
3. Approve an eligible decision. Approval records the actor and queues a command.
4. The deterministic worker rechecks permissions, policy, freshness and current resource state under a resource lock.
5. Inspect verification and audit records. Refresh snapshots to observe updated state.

Budget increases are disabled. All supported mutations require human approval even for L3/L4 policies. The kill switch blocks execution; it does not pause campaigns or automatically resume them. Forecasts are illustrative uncertainty envelopes, not calibrated models or hard spending caps.

## Structure

| Path | Responsibility |
|---|---|
| `src/core` | Contracts, policy, integer-money pacing, model-output safeguards |
| `src/server` | Tenant transactions, RBAC, lifecycle, executor, adapter, outcomes |
| `src/app`, `src/components` | Operator UI, control API, health endpoint |
| `db` | Migrations, RLS, scoped references, immutable history |
| `scripts`, `tests` | Database, fixtures, worker and failure/concurrency validation |
| `docs`, `infra` | Architecture, API, integrations, runbooks, rollout and containers |

## Deployment scope

Demo mode uses a local operator and must remain loopback-only. Live mode uses Clerk server authentication, organization mappings and database memberships. Missing identity/mappings fail closed. Provision users and memberships through a separate administrative process. Keep migration credentials out of deployed web/worker environments.

See [architecture](docs/architecture.md), [integration requirements](docs/integrations.md), [release gates](docs/release-gates.md), and [runbooks](docs/runbooks.md). BigQuery, GA4, external CRM transport, Ads OAuth/reporting, offline uploads, production telemetry, model providers and autonomous strategy graduation remain integration work. No external credentials are required for the demo.

## Live integration setup

Real Google Ads, HubSpot, GA4, BigQuery and model transports plus a separate live worker are implemented. Provider access and hosted deployment are unverified. Start with [integration readiness](docs/integrations.md), [Senior Care Stars mapping](docs/hubspot-connection.md) and [release gates](docs/release-gates.md). Google Ads Data Manager owns CRM conversion uploads. Configure credentials through managed secrets; do not enable writes as a substitute for validation.

Selected hosting: Vercel for the web console and Railway for the persistent worker. See [deployment setup](docs/deployment.md). `npm run hosting -- plan` shows the idle resource plan and missing access requirements without contacting either provider.

Clerk has not been created yet. Follow [Clerk setup](docs/clerk-setup.md) to prepare Senior Care Stars, secure keys and the initial owner mapping.
