ALTER TABLE instagram_connections ADD COLUMN username TEXT;
ALTER TABLE instagram_connections ADD COLUMN account_type TEXT;
ALTER TABLE instagram_connections ADD COLUMN consent_at TEXT;
ALTER TABLE instagram_connections ADD COLUMN consent_version TEXT;
ALTER TABLE instagram_connections ADD COLUMN token_refresh_attempt_at TEXT;
ALTER TABLE instagram_connections ADD COLUMN last_sync_at TEXT;
ALTER TABLE instagram_connections ADD COLUMN last_sync_attempt_at TEXT;
ALTER TABLE instagram_connections ADD COLUMN last_error TEXT;

CREATE TABLE instagram_oauth_states (
  state_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX instagram_oauth_states_expiry_idx ON instagram_oauth_states(expires_at, consumed_at);
CREATE UNIQUE INDEX instagram_one_pending_oauth_state_idx ON instagram_oauth_states(workspace_id) WHERE consumed_at IS NULL;
CREATE INDEX instagram_sync_due_idx ON instagram_connections(status, last_sync_at, last_sync_attempt_at);
