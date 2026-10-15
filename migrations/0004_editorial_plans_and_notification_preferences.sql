CREATE TABLE editorial_plans (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  cycle_key TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  objective TEXT NOT NULL CHECK (length(objective) BETWEEN 1 AND 500),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (julianday(end_date) >= julianday(start_date))
);

CREATE TABLE notification_preferences (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  in_app_enabled INTEGER NOT NULL DEFAULT 1 CHECK (in_app_enabled IN (0, 1)),
  email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE calendar_events ADD COLUMN editorial_plan_id TEXT REFERENCES editorial_plans(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN editorial_plan_day INTEGER CHECK (editorial_plan_day IS NULL OR editorial_plan_day BETWEEN 0 AND 6);

CREATE INDEX editorial_plans_workspace_created_idx ON editorial_plans(workspace_id, created_at DESC);
CREATE UNIQUE INDEX calendar_plan_item_unique_idx ON calendar_events(workspace_id, editorial_plan_id, editorial_plan_day)
  WHERE editorial_plan_id IS NOT NULL;
