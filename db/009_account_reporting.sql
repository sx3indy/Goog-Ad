CREATE TABLE account_snapshots(
 tenant_id uuid NOT NULL,id uuid PRIMARY KEY,customer_id text NOT NULL,
 observed_at timestamptz NOT NULL,account_local_date date NOT NULL,currency text NOT NULL,
 spend_micros text NOT NULL CHECK(spend_micros ~ '^(0|[1-9][0-9]{0,17})$'),
 complete boolean NOT NULL,reporting_lag_uncertain boolean NOT NULL,
 campaign_resources text[] NOT NULL,
 FOREIGN KEY(tenant_id,customer_id) REFERENCES ad_accounts(tenant_id,customer_id)
);
CREATE INDEX account_reporting_latest ON account_snapshots(tenant_id,customer_id,observed_at DESC);
ALTER TABLE account_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON account_snapshots USING(tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
GRANT SELECT,INSERT ON account_snapshots TO ads_app;
CREATE TRIGGER account_reporting_immutable BEFORE UPDATE OR DELETE ON account_snapshots FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
INSERT INTO schema_migrations(version) VALUES('009_account_reporting');
