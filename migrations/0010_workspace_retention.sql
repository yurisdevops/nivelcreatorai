ALTER TABLE deletion_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'user'
  CHECK (request_type IN ('user', 'retention'));

ALTER TABLE deletion_ledger ADD COLUMN request_type TEXT NOT NULL DEFAULT 'user'
  CHECK (request_type IN ('user', 'retention'));
ALTER TABLE deletion_ledger ADD COLUMN canceled_at TEXT;

CREATE TABLE workspace_retention_holds (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT NOT NULL
);

CREATE UNIQUE INDEX deletion_requests_one_open_per_workspace_idx
  ON deletion_requests(workspace_id) WHERE status IN ('pending', 'processing');
