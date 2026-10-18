CREATE TABLE waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  instagram TEXT,
  niche TEXT,
  campaigns_per_month TEXT NOT NULL CHECK (campaigns_per_month IN ('none', '1-2', '3-5', '6+')),
  biggest_pain TEXT,
  founder_interest INTEGER NOT NULL DEFAULT 0 CHECK (founder_interest IN (0, 1)),
  consent_version TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX waitlist_entries_created_at ON waitlist_entries (created_at);
