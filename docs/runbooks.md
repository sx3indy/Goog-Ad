# Operator runbooks

## API outage / quota exhaustion

Suspend optimization on stale data. Honor retry guidance, preserve request IDs and cap retries. Missing spend is unknown. Demo failures back off and quarantine after three attempts. Live error classification requires the real adapter.

## OAuth expiry / revoked access

Disable affected execution. Check binding names/status without logging values. Rotate securely, then verify access with a read-only operation. Never fall back to another tenant or demo identity.

## Reporting delay

Show unknown pacing and block performance changes. Keep independent safety monitoring separate; there is no automatic emergency trigger in this release. Demo refresh does not establish live quality.

## Duplicates / conflicting writes

Inspect tenant idempotency key and command chain. Duplicate approval returns 409. Resource locks serialize workers. Changed state invalidates a proposal: generate fresh evidence rather than editing immutable sources.

## Ambiguous timeout

Read the resource before retry. Confirm desired state and record ambiguity, or quarantine and reconcile. Never blindly replay a write. Remote success/local commit loss needs recovery; database rollback cannot undo remote effects.

## Spend spike

Owner kill switch suspends optimization but does not pause campaigns. Inspect freshness, shared budgets, schedules, timezone and reporting lag. Use separately authorized live emergency controls, document residual exposure and verify pause if authorized. Demo forecasts are not validated triggers.

## Incorrect negative / creative

Publication is disabled. Future adapters need before-state, editorial review, protected-intent checks, approval and request IDs. Compensation is separately authorized and cannot erase spent money.

## Cross-tenant access

Reject without disclosing other tenant data. Inspect verified identity, org mapping, memberships and RLS. Investigate scope-integrity violations. App connections must never use admin credentials. Revoke compromised identities and audit access.

## Conversion discrepancy

Find canonical external ID and preserve event/ingestion times. Reject duplicate conflicts and old updates; apply explicit newer corrections. Recognize only finalized paid revenue. Upload acceptance would not establish correct attribution; uploads are not implemented yet.

## Quarantine / compensation

Do not reset quarantined commands to queued. Inspect approval, evidence, attempts and current state. Resolve through a future privileged maintenance path with an appended audit record. Create a new proposal/current evidence and key. Compensation cannot undo historical costs.

## Deploy / rollback

Test a disposable DB; run additive migrations through a one-off admin job. Web/worker get only app credentials. Stop workers for incompatible migrations. Rehearse backup restoration. Roll back images only while schema-compatible; do not drop immutable records to force rollback. The local container reference is not a validated production deployment.
