CREATE TABLE ai_budget_reservations (
  id TEXT PRIMARY KEY,
  day_utc TEXT NOT NULL,
  reserved_micro_usd INTEGER NOT NULL CHECK (reserved_micro_usd > 0),
  actual_micro_usd INTEGER CHECK (actual_micro_usd IS NULL OR actual_micro_usd >= 0),
  max_input_tokens INTEGER NOT NULL CHECK (max_input_tokens > 0),
  max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens > 0),
  input_usd_per_million REAL NOT NULL CHECK (input_usd_per_million > 0),
  output_usd_per_million REAL NOT NULL CHECK (output_usd_per_million > 0),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'completed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  CHECK ((status='reserved' AND actual_micro_usd IS NULL) OR
         (status='completed' AND actual_micro_usd IS NOT NULL))
);

CREATE INDEX ai_budget_day_status_idx ON ai_budget_reservations(day_utc, status);
