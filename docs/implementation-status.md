# Implementation status

This repository was built from the supplied v2 architecture draft. Working code covers the local console and guarded live transport, ingestion and execution paths. It does not claim production readiness or completion of every proposed subsystem.

| Subsystem | Implementation |
|---|---|
| Accounts | Tenant-scoped account identity, currency/timezone and connection status; scoped OAuth adapter implemented; actual MCC/account access outstanding |
| Ingestion | Immutable synthetic snapshots and refresh; real Ads/GA4/HubSpot transports and durable sync implemented; actual access and attribution reconciliation outstanding |
| Data quality | Freshness, completeness, provenance, sample/maturity and immutable sources; external reconciliation outstanding |
| Financial control | Exact micros, illustrative pacing, bounded reductions, disabled increases; calibrated forecasting/safety triggers outstanding |
| Campaign diagnostics | Deterministic mature-CPA baseline with evidence-linked reduction proposals |
| Search intent / keywords | Protected-term review helper and publication disabled; discovery/classification workflow outstanding |
| Bids | Contract action reserved but execution rejected |
| Creative | RSA draft limits and editorial gate schema; model drafting/UI outstanding |
| Landing pages / audiences | Not implemented |
| Revenue | Canonical CRM outcomes, deduplication, explicit newer corrections and finalized-paid reporting; HubSpot portal/stage verification implemented; native Data Manager owns uploads, actual offline attribution reconciliation outstanding |
| Experiments | Database protocol storage and graduation documentation; statistical evaluator outstanding |
| Forecasting | Illustrative demo envelope only; no live forecast certification |
| Decisions | Strict schema, provenance, expiry, idempotency, independent policy and review UI |
| Policy | Versioned account rules, role checks, freshness/state/evidence gates and kill switch |
| Execution | Durable PostgreSQL queue, resource locks, retries, demo/live adapters, external dispatch intent, crash recovery, read-back and quarantine; live account certification outstanding |
| AI agents | Proposal-only abstraction, template and schema/source validation; Claude/Gemini transports implemented; evaluation and provider access outstanding |
| Audit / monitoring | Immutable event/attempt/verification history and database alerts; OTLP web/worker export implemented; actual collector delivery and notification routing outstanding |
| Dashboard | Seven functional sections, review workflow, search/filters, errors/loading and responsive layout |

## External actions required for later delivery

Selected CRM: HubSpot Senior Care Stars (247696140). Selected Ads customer: 2847558521. Business milestones and payout/payment-date/cost properties are documented in hubspot-connection.md. Supply credentials through managed settings, provision actual Clerk identities, verify currency/pipeline metadata and configure native Data Manager conversion delivery. GA4 property, warehouse project/dataset, approver identities, account budgets, retention/privacy rules and model constraints remain required. Production activation and full specification completion are not established by local tests.

## Deployment artifacts

SQL migrations, generated OpenAPI contracts, event documentation, architecture decisions, runbooks, CI and local Docker Compose are included. The Railway worker image builds successfully in this cloud machine. Hosted deployment and the alternative web container remain unverified. The tested application runtime is Node plus local embedded PostgreSQL; container checks verify runtime packaging and startup guards, not live integrations.

Selected hosted split: Vercel web and Railway worker, with preflight checks and idle project initialization tooling. Account reporting captures full customer-day totals independently from active campaigns. Actual provider access, hosted resources, native Data Manager configuration and the remaining feature subsystems are still outstanding.
