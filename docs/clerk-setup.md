# Clerk setup for Goog-Ad

No Clerk application has been created or tested yet. Create one named Goog-Ad in the [Clerk dashboard](https://dashboard.clerk.com/). Start with its development instance for identity acceptance; use a separate production instance and production keys for the final domain.

1. Enable email sign-in and Organizations. Create an organization named Senior Care Stars and invite the initial account owner. Sign in as that owner and select this organization. The console requires an active organization; a personal account alone has no tenant access.
2. In API Keys, copy the publishable key into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and the secret key into managed `CLERK_SECRET_KEY` settings. Do not paste the secret into chat or commit it. Web hosting needs both keys; the Railway worker does not need either.
3. Once Vercel supplies the actual HTTPS domain, configure Clerk's production domain and any required DNS records using its dashboard instructions. Set `APP_ORIGIN` to that exact HTTPS origin. Configure the application's sign-in path as `/sign-in` and post-sign-in destination as `/`. The existing sign-in component uses these paths. Add only the actual authorized deployment origins to any Clerk redirect/origin settings; isolate preview instances from production.
4. Copy the owner's `user_…` ID and organization's `org_…` ID from Clerk. These are identifiers, not API secrets. Put them in a private provisioning JSON file following the template below, together with a newly generated tenant UUID and Google-verified currency/timezone. Do not reuse the synthetic demo tenant.
5. After the hosted database role and migrations are ready, run `npm run provision -- /secure/path/tenant.json` in the administrative environment described in [deployment.md](deployment.md). This maps the Clerk organization and owner to application memberships. Creating a Clerk organization alone does not grant application access, and Clerk organization roles do not automatically become application roles.
6. Rebuild Vercel after setting its publishable key. Run `npm run deploy:check -- web`, then verify an actual sign-in, organization selection, console access, sign-out and denied access for an unprovisioned organization/user. Verify application viewer/analyst/approver permissions with separately provisioned memberships before activation. The current provisioning CLI creates the initial owner only; additional memberships require an administrative change.

Replace every placeholder before provisioning; the template deliberately cannot pass validation as written. Currency/timezone must come from the real Ads account. The initial policy is observe-only with the kill switch on. The policy version is an initial local identifier, not a claim of approved production settings.

```json
{
  "tenantId": "REPLACE_WITH_NEW_UUID",
  "tenantName": "Senior Care Stars",
  "clerkOrganizationId": "org_REPLACE",
  "ownerClerkUserId": "user_REPLACE",
  "customerId": "2847558521",
  "accountName": "Senior Care Stars",
  "currency": "REPLACE_WITH_VERIFIED_CURRENCY",
  "timezone": "REPLACE_WITH_VERIFIED_TIMEZONE",
  "policy": {
    "version": "initial-observe-only",
    "autonomy": "L0",
    "dailyPlannedMicros": "0",
    "maxReductionPercent": 0,
    "freshnessMinutes": 30,
    "minSampleSize": 30,
    "allowedActions": [],
    "protectedTerms": [],
    "killed": true
  }
}
```

No Clerk webhook is required for the current initial-owner flow. Memberships are explicitly maintained in the application database; automatic user/organization lifecycle synchronization is not implemented. Hosted Clerk authentication remains unverified until real keys, domain and users are available.
