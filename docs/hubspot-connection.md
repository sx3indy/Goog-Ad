# Senior Care Stars source binding

HubSpot account: **Senior Care Stars, 247696140**. Google Ads customer: **284-755-8521**. These identifiers do not establish account access.

Set HUBSPOT_ACCOUNT_ID=247696140 and HUBSPOT_CUSTOMER_ID=2847558521. Set HUBSPOT_TENANT_ID to the administratively provisioned tenant UUID and HUBSPOT_CURRENCY to the verified Google Ads currency. Store HUBSPOT_PRIVATE_APP_TOKEN through managed secrets, never in chat or source control. Use the minimum read scopes needed for account details, contact/deal records, properties and pipelines; verify the current HubSpot scope requirements during authorization.

The connector checks `/account-info/v3/details` before CRM ingestion and rejects a different portal ID. Live verification of this endpoint and its scopes remains pending credentials. It resolves the actual IDs for the exact deal-stage labels below. Duplicate labels require HUBSPOT_PIPELINE_ID; missing stages or properties fail rather than guess.

| Milestone | Verified source mapping | Native Google event |
|---|---|---|
| Qualified lead | Contact lifecyclestage=salesqualifiedlead | qualified_lead |
| Completed move-in | Deal stage label Move-In Completed | converted_lead |
| Collected referral payment | Deal stage label Payment Received | purchase |
| Collected revenue | referral_payout_amount | Retained as revenue |
| Collection date | referral_payment_date | Conversion time |
| Delivery costs | actual_delivery_cost | Retained as costs |
| Contribution value | Revenue minus delivery costs | Proposed bidding value |

Payment Received is the explicitly authorized business definition of collection. The platform does not equate arbitrary closed-won stages with paid revenue. Missing delivery costs or payment dates fail ingestion. Later record updates carry a separate source revision timestamp, preserving the economic payment date and immutable correction history.

## Conversion delivery ownership

Google Ads **native Data Manager owns conversion uploads**. The application's HubSpot connector reads outcomes for reconciliation; it does not upload a second copy of those conversions. Configure the authenticated HubSpot source in Google Ads Data Manager and verify connector availability, permissions, event/action matching and supported fields in the actual accounts.

Use a HubSpot calculation/workflow property for `referral_payout_amount - actual_delivery_cost`, then map that value only after confirming units, currency and the intended profit semantics. Preserve the original payout and cost properties. Cases with missing or negative contribution need an explicitly reviewed handling rule; do not silently clamp them or label them zero. Verify whether the portal's HubSpot subscription supports the required workflow/calculation feature.

Verify connector-specific matching requirements and consent. Email/phone/name availability alone does not establish matching or upload eligibility. This platform does not fetch those PII fields. Confirm timezone, click-to-event windows, deduplication, correction/refund behavior and imported action settings in Google Ads before making the paid event primary for bidding. Test with a small reviewed cohort and reconcile CRM totals, imported event counts and contribution values. Account access, native connector configuration, actual stage/property metadata and Smart Bidding activation are **not yet verified**.

The business connector verifies a source currency property (deal_currency_code by default; HUBSPOT_CURRENCY_PROPERTY can select an explicitly verified referral-currency property). Missing or mismatched currency fails ingestion. It does not relabel currency, perform FX conversion or assume custom payout/cost fields use the deal currency without source verification.

Business-source external IDs include the verified portal ID, object type and record ID. Changing portals cannot overwrite unrelated records that happen to reuse the same numeric HubSpot record ID.
