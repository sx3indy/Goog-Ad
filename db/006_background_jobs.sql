CREATE TABLE integration_jobs(tenant_id uuid NOT NULL,id uuid PRIMARY KEY,customer_id text NOT NULL,provider text NOT NULL CHECK(provider IN ('google_ads','hubspot','ga4','warehouse','models')),status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),attempt_count integer NOT NULL DEFAULT 0,lease_owner uuid,lease_until timestamptz,available_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),result jsonb NOT NULL DEFAULT '{}',idempotency_key text NOT NULL,UNIQUE(tenant_id,idempotency_key),FOREIGN KEY(tenant_id,customer_id) REFERENCES ad_accounts(tenant_id,customer_id));
CREATE INDEX integration_queue ON integration_jobs(tenant_id,available_at) WHERE status IN ('queued','running');
CREATE TABLE analytics_reports(tenant_id uuid NOT NULL,id uuid PRIMARY KEY,customer_id text NOT NULL,provider text NOT NULL,start_date date NOT NULL,end_date date NOT NULL,observed_at timestamptz NOT NULL DEFAULT now(),report jsonb NOT NULL,FOREIGN KEY(tenant_id,customer_id) REFERENCES ad_accounts(tenant_id,customer_id));
CREATE TABLE model_runs(tenant_id uuid NOT NULL,id uuid PRIMARY KEY,customer_id text NOT NULL,provider text NOT NULL,model_version text NOT NULL,template_version text NOT NULL,source_snapshot_ids uuid[] NOT NULL,proposal_count integer NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,customer_id) REFERENCES ad_accounts(tenant_id,customer_id));
CREATE TABLE warehouse_outbox(tenant_id uuid NOT NULL,event_id uuid PRIMARY KEY,customer_id text,exported_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE audit_events ADD UNIQUE(tenant_id,id);
ALTER TABLE warehouse_outbox ADD FOREIGN KEY(tenant_id,event_id) REFERENCES audit_events(tenant_id,id);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['integration_jobs','analytics_reports','model_runs','warehouse_outbox'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id::text=current_setting(''app.tenant_id'',true)) WITH CHECK(tenant_id::text=current_setting(''app.tenant_id'',true))',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO ads_app',t);
END LOOP;END $$;
CREATE FUNCTION queue_warehouse_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO warehouse_outbox(tenant_id,event_id) VALUES(NEW.tenant_id,NEW.id);RETURN NEW;END $$;
CREATE TRIGGER warehouse_event_outbox AFTER INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION queue_warehouse_event();
INSERT INTO warehouse_outbox(tenant_id,event_id) SELECT tenant_id,id FROM audit_events;
CREATE TRIGGER immutable_report BEFORE UPDATE OR DELETE ON analytics_reports FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER immutable_model_run BEFORE UPDATE OR DELETE ON model_runs FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
REVOKE UPDATE ON analytics_reports,model_runs FROM ads_app;
INSERT INTO schema_migrations(version) VALUES('006_background_jobs');
