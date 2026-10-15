ALTER TABLE deletion_requests ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);
ALTER TABLE deletion_requests ADD COLUMN last_attempt_at TEXT;

CREATE TABLE deletion_ledger (
  id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed'))
);

CREATE INDEX deletion_requests_due_idx ON deletion_requests(status, scheduled_for);
