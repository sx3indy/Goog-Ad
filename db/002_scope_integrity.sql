-- RLS controls visibility; composite foreign keys independently prevent cross-tenant references.
ALTER TABLE decision_proposals ADD UNIQUE(tenant_id,id);
ALTER TABLE campaign_snapshots ADD UNIQUE(tenant_id,id);
ALTER TABLE mutation_commands ADD UNIQUE(tenant_id,id);
ALTER TABLE evidence_records ADD FOREIGN KEY(tenant_id,proposal_id) REFERENCES decision_proposals(tenant_id,id);
ALTER TABLE evidence_records ADD FOREIGN KEY(tenant_id,snapshot_id) REFERENCES campaign_snapshots(tenant_id,id);
ALTER TABLE metric_observations ADD FOREIGN KEY(tenant_id,snapshot_id) REFERENCES campaign_snapshots(tenant_id,id);
ALTER TABLE approval_events ADD FOREIGN KEY(tenant_id,proposal_id) REFERENCES decision_proposals(tenant_id,id);
ALTER TABLE approval_events ADD FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,user_id);
ALTER TABLE mutation_commands ADD FOREIGN KEY(tenant_id,proposal_id) REFERENCES decision_proposals(tenant_id,id);
ALTER TABLE mutation_attempts ADD FOREIGN KEY(tenant_id,command_id) REFERENCES mutation_commands(tenant_id,id);
ALTER TABLE verification_results ADD FOREIGN KEY(tenant_id,command_id) REFERENCES mutation_commands(tenant_id,id);
ALTER TABLE decision_proposals ADD FOREIGN KEY(tenant_id,customer_id) REFERENCES ad_accounts(tenant_id,customer_id);
ALTER TABLE demo_resource_state ADD FOREIGN KEY(tenant_id,customer_id) REFERENCES ad_accounts(tenant_id,customer_id);
ALTER TABLE conversion_events ADD FOREIGN KEY(tenant_id,customer_id) REFERENCES ad_accounts(tenant_id,customer_id);
ALTER TABLE crm_outcomes ADD FOREIGN KEY(tenant_id,customer_id) REFERENCES ad_accounts(tenant_id,customer_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['approval_events','evidence_records','mutation_attempts','verification_results'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_immutable_change()',t);
  EXECUTE format('REVOKE UPDATE,DELETE ON %I FROM ads_app',t);
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES('002_scope_integrity');
