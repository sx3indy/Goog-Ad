CREATE TABLE control_api_rate_buckets(tenant_id uuid NOT NULL REFERENCES tenants,id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users,window_start timestamptz NOT NULL,count integer NOT NULL CHECK(count>0),UNIQUE(tenant_id,user_id,window_start));
ALTER TABLE control_api_rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_api_rate_buckets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON control_api_rate_buckets USING(tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON control_api_rate_buckets TO ads_app;
INSERT INTO schema_migrations(version) VALUES('003_rate_limits');
