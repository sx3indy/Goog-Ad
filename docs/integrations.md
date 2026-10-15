# Integration readiness

| Integration | Implemented locally | Live validation outstanding |
|---|---|---|
| Google Ads | v25 REST transport, cached OAuth refresh, complete pagination, reporting and resource reads, scoped budget decrease/pause mutations | Account access, current fields, developer-token tier, MCC header, validate-only proof, quotas and read-back |
| HubSpot | Portal binding, metadata/stage validation, contact/deal outcomes, exact money, independent economic/revision dates | Private-app permissions, Senior Care Stars metadata and actual reconciliation |
| Native Data Manager | Documented sole conversion-upload owner | Authenticated connector setup, matching/consent, mappings and duplicate/correction behavior |
| Clerk | Verified live identity, org mapping, memberships, login/org selection and provisioning tool | Real keys, organization/user IDs and access tests |
| GA4 | ADC-authenticated reports, rejects truncated/thresholded data, immutable storage | Property/account binding, event definitions and access |
| BigQuery | ADC-authenticated export, row-error checks, stable IDs, durable outbox and deduplicating SQL | Project/dataset, access and actual warehouse reconciliation |
| Claude/Gemini | JSON proposal-only adapters, redacted contexts, provenance/schema/policy validation | Model versions/keys, frozen evaluation and quality gates |
| OpenTelemetry | Web/worker Node SDK and OTLP traces, redacted structured logs | Collector delivery, dashboards and notification routing |

Google Ads v25 was checked against the official Python client's supported-version list and official v25 protobuf service definitions. This verifies the selected contract, not access to the user's account or a successful request. The developer reference site was blocked by the current proxy policy. Set GOOGLE_ADS_API_VERSION explicitly; changing it does not enable execution.

Live execution is a separate worker. It commits dispatch intent before network I/O, reads state before dispatch, and verifies after dispatch. Recovery never blindly replays a mutation whose outcome is uncertain. Writes require enabled, unexpired account execution gates, current approval, policy and source evidence. Defaults remain read-only/validate-only. Shared budgets, increases and unsupported actions are denied.

Scheduled and operator-triggered synchronization use durable jobs, scoped advisory locks, bounded transient retries, lease recovery and persistent failure alerts. Missing optional provider configuration does not prevent Google Ads reads. Provider configuration errors fail jobs visibly.

See [HubSpot connection](hubspot-connection.md), [release gates](release-gates.md) and [implementation status](implementation-status.md). Credentials must be supplied through managed secrets. Current credentials are absent, so provider transport tests use injected fixtures and do not certify live integrations.

Account-day spend is stored independently from active campaign snapshots, so removed campaigns cannot hide incurred spend. The current inventory and financial report commit atomically. External resource locks coordinate across authorized workspaces that share a physical Ads resource; SQL rows remain tenant scoped. These paths are verified with injected transport fixtures and real local PostgreSQL, not live accounts.

Each account sync refreshes today and the preceding seven account-local dates. Late cost corrections append immutable observations; charts select the latest observation per date. Manager accounts are rejected as advertising customers instead of being represented as zero-spend accounts. Reporting remains subject to provider lag and is not reconciled business attribution.
