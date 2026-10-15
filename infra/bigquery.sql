-- Substitute deployment-owned project/dataset identifiers administratively.
-- Apply with a separate schema-management identity; the worker needs only table insert permission.
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.audit_facts` (
 event_id STRING NOT NULL, tenant_id STRING NOT NULL, event_type STRING NOT NULL,
 resource_id STRING NOT NULL, event_time TIMESTAMP NOT NULL, ingestion_time TIMESTAMP NOT NULL, payload STRING
) PARTITION BY DATE(event_time) CLUSTER BY tenant_id,event_type;
CREATE OR REPLACE VIEW `YOUR_PROJECT.YOUR_DATASET.audit_facts_canonical` AS
 SELECT * FROM `YOUR_PROJECT.YOUR_DATASET.audit_facts`
 QUALIFY ROW_NUMBER() OVER(PARTITION BY tenant_id,event_id ORDER BY ingestion_time DESC)=1;
