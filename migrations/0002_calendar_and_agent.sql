CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  script_id TEXT REFERENCES scripts(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 140),
  format TEXT NOT NULL DEFAULT 'Reels (vídeo curto)',
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'draft', 'ready_to_record', 'recorded', 'approved', 'published')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE campaigns ADD COLUMN due_at TEXT;
ALTER TABLE campaigns ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX calendar_workspace_date_idx ON calendar_events(workspace_id, scheduled_at, created_at DESC);
CREATE INDEX agent_messages_workspace_created_idx ON agent_messages(workspace_id, created_at DESC);
CREATE INDEX campaigns_workspace_updated_idx ON campaigns(workspace_id, updated_at DESC);
