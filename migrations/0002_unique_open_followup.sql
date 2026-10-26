-- Preserve historical rows while closing any duplicates before enforcing uniqueness.
UPDATE followups SET status='done'
WHERE status='open' AND id NOT IN (
  SELECT MIN(id) FROM followups WHERE status='open' GROUP BY shipment_id
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_followups_one_open
ON followups(shipment_id) WHERE status='open';
