PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'creator')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE creator_profiles (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  niche TEXT,
  goals_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(goals_json)),
  voice TEXT,
  onboarding_completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE instagram_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  meta_account_id TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('connected', 'expired', 'revoked', 'error')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE metric_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  value REAL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable', 'limited')),
  UNIQUE (workspace_id, metric, period_start, period_end, source)
);

CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('idea', 'draft', 'ready_to_record', 'recorded', 'approved', 'published')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (workspace_id, id, version)
);

CREATE TABLE strategies (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
  hypothesis TEXT NOT NULL,
  recommendations_json TEXT NOT NULL CHECK (json_valid(recommendations_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  brief_json TEXT NOT NULL CHECK (json_valid(brief_json)),
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE ai_usage_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  cost_estimate REAL CHECK (cost_estimate IS NULL OR cost_estimate >= 0),
  cycle_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE quota_reservations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  cycle_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'released')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);

CREATE TABLE trials (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('trialing', 'expired', 'converted')),
  CHECK (julianday(ends_at) > julianday(starts_at))
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL UNIQUE,
  period_start TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'expired', 'suspended')),
  period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  UNIQUE (workspace_id)
);

CREATE TABLE payment_events (
  provider_event_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  processed_at TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE deletion_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  scheduled_for TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'rejected'))
);

CREATE INDEX memberships_user_idx ON memberships(user_id, workspace_id);
CREATE INDEX metric_snapshots_workspace_period_idx ON metric_snapshots(workspace_id, period_end DESC);
CREATE INDEX scripts_workspace_status_idx ON scripts(workspace_id, status, updated_at DESC);
CREATE INDEX strategies_workspace_created_idx ON strategies(workspace_id, created_at DESC);
CREATE INDEX campaigns_workspace_status_idx ON campaigns(workspace_id, status, created_at DESC);
CREATE INDEX files_workspace_created_idx ON files(workspace_id, created_at DESC);
CREATE INDEX jobs_status_created_idx ON jobs(status, created_at);
CREATE INDEX ai_usage_workspace_created_idx ON ai_usage_events(workspace_id, created_at DESC);
CREATE INDEX quota_reservations_cycle_idx ON quota_reservations(workspace_id, cycle_key, operation, status);
CREATE INDEX notifications_workspace_created_idx ON notifications(workspace_id, created_at DESC);
CREATE INDEX audit_logs_workspace_created_idx ON audit_logs(workspace_id, created_at DESC);
