ALTER TABLE files ADD COLUMN display_name TEXT NOT NULL DEFAULT 'arquivo';
ALTER TABLE files ADD COLUMN sha256 TEXT;

CREATE TABLE file_upload_reservations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'released')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX file_upload_reservations_quota_idx ON file_upload_reservations(workspace_id, status, expires_at);
