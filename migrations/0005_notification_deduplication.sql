ALTER TABLE notifications ADD COLUMN dedupe_key TEXT;

CREATE UNIQUE INDEX notifications_workspace_dedupe_idx ON notifications(workspace_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
