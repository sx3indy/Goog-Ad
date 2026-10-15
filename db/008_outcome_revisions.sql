ALTER TABLE crm_outcomes ADD COLUMN source_updated_at timestamptz;
UPDATE crm_outcomes SET source_updated_at=event_time;
ALTER TABLE outcome_history ADD COLUMN source_updated_at timestamptz;
-- Existing immutable history remains untouched; readers fall back to event_time.
CREATE OR REPLACE FUNCTION capture_outcome_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO outcome_history(tenant_id,id,outcome_id,external_id,stage,finalized,revenue_micros,cost_micros,currency,event_time,source_updated_at) VALUES(NEW.tenant_id,gen_random_uuid(),NEW.id,NEW.external_id,NEW.stage,NEW.finalized,NEW.revenue_micros,NEW.cost_micros,NEW.currency,NEW.event_time,COALESCE(NEW.source_updated_at,NEW.event_time));RETURN NEW;
END $$;
INSERT INTO schema_migrations(version) VALUES('008_outcome_revisions');
