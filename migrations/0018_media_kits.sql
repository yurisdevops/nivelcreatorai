CREATE TABLE media_kits (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  brands_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(brands_json)),
  highlights_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(highlights_json)),
  show_metrics INTEGER NOT NULL DEFAULT 1 CHECK (show_metrics IN (0, 1)),
  show_delivered_brands INTEGER NOT NULL DEFAULT 1 CHECK (show_delivered_brands IN (0, 1)),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
