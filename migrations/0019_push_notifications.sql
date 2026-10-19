CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX push_subscriptions_workspace_idx ON push_subscriptions(workspace_id);

ALTER TABLE notifications ADD COLUMN push_sent_at TEXT;

-- Existing notifications were already seen in the app; only new ones go to phones.
UPDATE notifications SET push_sent_at = created_at;
