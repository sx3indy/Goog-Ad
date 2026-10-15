ALTER TABLE account_controls ADD COLUMN current_policy_version text;
UPDATE account_controls c SET current_policy_version=(SELECT p.version FROM account_policies p WHERE p.tenant_id=c.tenant_id AND p.customer_id=c.customer_id ORDER BY p.created_at DESC,p.version DESC LIMIT 1);
ALTER TABLE account_controls ADD FOREIGN KEY(tenant_id,customer_id,current_policy_version) REFERENCES account_policies(tenant_id,customer_id,version);
INSERT INTO schema_migrations(version) VALUES('007_policy_pointer');
