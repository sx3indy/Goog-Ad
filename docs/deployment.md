# Vercel web and Railway worker deployment

The hosting accounts are connected, but **no Vercel or Railway project has been created or verified**. Source currently exists only in this workspace; the GitHub repository has no published commit. These deployment artifacts do not create resources by themselves. No callable hosting connector or deployment credentials are available in this execution environment.

## Resources and runtime separation

| Resource | Configuration | Responsibilities |
|---|---|---|
| Vercel project, suggested name goog-ad | Repository root, Next.js, Node 24; vercel.json | Authenticated web console and short database/API requests |
| Railway service, suggested name goog-ad-worker | infra/railway.worker.toml, Dockerfile.worker | Durable source jobs, reporting and approved external execution |
| PostgreSQL | Dedicated application database, verified TLS, administrative and ads_app logins | Tenant isolation, queues, immutable evidence and audit |
| Administrative provisioning job | Short-lived trusted environment | Role provisioning, migrations and tenant/Clerk mapping |

The worker runs continuously on Railway; do not run it in a Vercel function or cron request. Vercel holds no Google Ads/HubSpot/model provider tokens. Admin database credentials do not belong in either application's runtime.

## Database preparation

Choose a PostgreSQL endpoint reachable from both hosts with a valid server certificate and `sslmode=verify-full`. Verify Railway's actual TLS configuration before selecting its PostgreSQL template: the template's existence or a database URL alone does not prove TLS support. A Railway private hostname is not reachable from Vercel. Do not use sslmode=require, disable certificate checks, or deploy the local embedded database.

Use a dedicated database. In a trusted administrative job set APP_MODE=live, ADMIN_DATABASE_URL to its administrative login and DATABASE_URL to a separately generated ads_app login for the same endpoint. Then run:

```sh
npm ci
npm run db:provision-role
npm run db:migrate
npm run provision -- /secure/path/tenant.json
```

The role helper creates an absent ads_app role with no superuser, database creation, role creation or RLS bypass privileges. It preserves and verifies an existing role rather than resetting its password. SQL migrations grant the application its limited table/column privileges. Provisioning requires the real Clerk org/user IDs, verified currency/timezone, tenant UUID and approved account policy. Do not seed demo fixtures in production. Backups and restore must be verified before activation.

Worker connections must be **direct or session-pooled**, with DB_CONNECTION_MODE=direct or session. Transaction-pooled connections cannot retain the session advisory locks used for execution and ingestion. Vercel can use a compatible transaction-pooled endpoint because tenant identity is set within each transaction. Size the connection budget for all web instances plus worker replicas; defaults are two connections per live process, with a separate worker DB_POOL_MAX=8 suggested.

## Vercel project creation

After the reviewed source is published to sx3indy/Goog-Ad, import that repository into a new Vercel project. Use the repository root and the committed vercel.json. Select Node 24 and a region close to the database. Before the first live deployment configure:

- APP_MODE=live
- APP_ORIGIN equal to the actual stable HTTPS project/custom domain; do not guess domain availability
- DATABASE_URL for ads_app, verified TLS; DB_POOL_MAX=2
- Clerk publishable/secret keys and allowed redirect/domain settings
- Optional OTEL_EXPORTER_OTLP_ENDPOINT for an authenticated collector

Clerk publishable keys are bundled at build time, so changes require a new build. Configure separate preview identity/database/origin settings; previews must not access production accounts. Keep Vercel deployment protection enabled during acceptance. The application dynamically authenticates requests and fails readiness when identity, database role or schema is missing.

No Clerk application exists yet. Follow [Clerk setup](clerk-setup.md) for organizations, secure keys, the initial owner mapping and actual sign-in acceptance.

Run `npm run deploy:check -- web` with the same secure runtime bindings before activation. It validates configuration, real database connectivity, role capabilities and the migration version. It does not certify a real Clerk login; verify owner, analyst, approver and viewer behavior with actual users.

## Railway worker creation

Create a Railway project and connect a new worker service to sx3indy/Goog-Ad. Set its config-file path to infra/railway.worker.toml. The worker-only image installs runtime dependencies without building the web UI, runs as an unprivileged user, and receives no public domain. Configure:

- APP_MODE=live; DATABASE_URL for ads_app with verified TLS
- DB_CONNECTION_MODE=direct or session; DB_POOL_MAX=8
- GOOGLE_ADS_API_VERSION=v25; GOOGLE_ADS_CUSTOMER_IDS=2847558521
- GOOGLE_ADS_TENANT_ID equal to the administratively provisioned tenant UUID
- Google Ads developer token, OAuth client ID/secret/refresh token; MCC login ID only if required
- GOOGLE_ADS_WRITES_ENABLED=false; GOOGLE_ADS_VALIDATE_ONLY=true
- HUBSPOT_ACCOUNT_ID=247696140; HUBSPOT_CUSTOMER_ID=2847558521
- HUBSPOT_TENANT_ID equal to the same tenant UUID; HUBSPOT_CURRENCY equal to verified account currency
- HubSpot private-app token; pipeline ID when exact stage labels are ambiguous
- Optional GA4/BigQuery/model/telemetry bindings described in integrations.md

Run `npm run deploy:check -- worker`. Besides database checks it performs read-only Google Ads account access and verifies the HubSpot portal, pipeline stages and property metadata. It never uploads conversions or mutates advertising resources. The native Data Manager connector remains the sole conversion uploader.

## Acceptance and activation

Verify the hosted health response, actual Clerk identity/tenant isolation, successful source jobs, correct reporting currency/timezone, known financial values, immutable audit and worker restart recovery. Reconcile HubSpot outcomes with native Data Manager imports and confirm deduplication/consent. Configure and test backup restoration, telemetry and alerts. Check deployment logs without printing tokens or connection strings.

Writes remain disabled during this stage. Completing deployment is distinct from completing all specification subsystems or certifying live mutations. See release-gates.md and implementation-status.md. Do not create enabled execution gates from mocked tests. Production activation requires actual account validation evidence and reviewed settings.

## Automated idle project initialization

The workspace also includes `npm run hosting -- plan` and `npm run hosting -- create`. The plan is safe to review without credentials. Creation requires VERCEL_TOKEN, RAILWAY_API_TOKEN (an account/workspace-capable API token, not an absent project's token), and RAILWAY_WORKSPACE_ID; VERCEL_TEAM_ID is optional for team scoping. Enter credentials through the cloud environment's managed settings, never in chat.

The helper initializes an idle Vercel project and Railway project/worker, records IDs in ignored `.local/hosting-projects.json`, and sets the Railway worker config path. It does not connect a Git source, deploy code, populate provider secrets, create a database or enable live writes. The account-specific runtime/database acceptance steps above remain required. Unrecognized existing resources and incomplete listings stop initialization rather than overwrite or duplicate them. An ambiguous creation response needs account inspection; do not delete its manifest or blindly retry. The API routes/mutations were checked against official Vercel and Railway CLI sources; authenticated calls are still unverified.

## Container verification in the cloud workspace

Run `npm run container:build -- worker` (or web for the container alternative). When a cloud proxy is present, the helper resolves its hostname through the existing trusted host resolver and supplies that mapping to the isolated builder. Proxy configuration and the supplied CA are ephemeral BuildKit secrets; they are not image environment variables or copied files. TLS and npm lockfile integrity checks remain enabled. Docker must be available; this does not install a daemon or deploy an image.
