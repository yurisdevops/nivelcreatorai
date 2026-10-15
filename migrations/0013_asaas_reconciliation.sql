ALTER TABLE subscriptions ADD COLUMN reconciled_at TEXT;

CREATE INDEX subscriptions_reconciliation_idx ON subscriptions(status, reconciled_at, period_end);
