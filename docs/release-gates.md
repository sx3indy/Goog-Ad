# Delivery and acceptance gates

## Implemented prototype scope

Phase 1 contracts/storage and synthetic reporting; Phase 2 manually approved demo execution with queue, guardrails, verification and audit; Phase 3 deterministic diagnostic and model-output interfaces; Phase 4 outcome reconciliation and synthetic business dashboard. Phase 5 live autonomy is not implemented.

## Local acceptance

- Console exposes source status and usable decision review.
- Approvals persist actor/policy and one idempotent command.
- Worker rejects foreign/stale evidence, changed state, revoked approvers and kill switch.
- Concurrent workers do not duplicate demo mutations.
- Ambiguous responses reconcile; mismatches quarantine and alert.
- RLS uses a non-superuser; composite references reject foreign tenant IDs.
- Paid outcomes deduplicate, preserve precision and reconcile newer corrections.
- Application connections cannot edit immutable audit/source records.

## Mandatory gates before live writes

1. Real Clerk login, organization ownership, RBAC and tenant isolation validated.
2. Official API version, fields, scopes and token access tier recorded in the compatibility matrix.
3. Real ingestion validated for currency, timezone, freshness and completeness.
4. Test-account mutations verified for shared budgets, masks, duplicates, timeout/crash recovery, partial failure and request IDs. Mocked success alone is insufficient.
5. Managed secrets, TLS, least privilege, backups, restore and telemetry validated.
6. Independently validated emergency triggers and pause-delay exposure if safety automation is introduced.
7. Tested quarantine, compensation, rollback and credential-revocation procedures.
8. Shadow mode and historical replay with leakage and sparse/delayed-outcome safeguards.
9. Prospective controlled-account experiment with calibrated uncertainty and stop conditions.

Passing demo/unit tests does not satisfy live gates.

## Autonomy graduation

Freeze hypothesis, population, actions, exclusions/protected intent, baseline, duration, delayed-conversion horizon, primary business metric and stop conditions. Replay point-in-time history, then run shadow mode and a prospective holdout. Measure revenue/margin, not only platform conversions. L3/L4 needs explicit account policy and demonstrated value within accepted risk. Budget increases stay 0%; automatic resume needs a separate reviewed policy.

## UI acceptance

Navigation, filters/search, evidence detail, approval/rejection, manual execution, audit detail, campaign search, refresh and kill switch must work. Loading, empty, error, blocked and verified states remain distinct. Every financial action requires server enforcement.
