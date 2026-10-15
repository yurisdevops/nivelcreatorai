CREATE TABLE ai_budget_reservations_next (
  id TEXT PRIMARY KEY,
  day_utc TEXT NOT NULL,
  reserved_micro_usd INTEGER NOT NULL CHECK (reserved_micro_usd > 0),
  actual_micro_usd INTEGER CHECK (actual_micro_usd IS NULL OR actual_micro_usd >= 0),
  max_input_tokens INTEGER NOT NULL CHECK (max_input_tokens > 0),
  max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens > 0),
  input_usd_per_million REAL NOT NULL CHECK (input_usd_per_million > 0),
  output_usd_per_million REAL NOT NULL CHECK (output_usd_per_million > 0),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'released')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  CHECK ((status IN ('reserved','released') AND actual_micro_usd IS NULL) OR
         (status='completed' AND actual_micro_usd IS NOT NULL))
);

INSERT INTO ai_budget_reservations_next
  (id, day_utc, reserved_micro_usd, actual_micro_usd, max_input_tokens, max_output_tokens,
   input_usd_per_million, output_usd_per_million, status, created_at, completed_at)
SELECT id, day_utc, reserved_micro_usd, actual_micro_usd, max_input_tokens, max_output_tokens,
  input_usd_per_million, output_usd_per_million, status, created_at, completed_at
FROM ai_budget_reservations;

DROP TABLE ai_budget_reservations;
ALTER TABLE ai_budget_reservations_next RENAME TO ai_budget_reservations;
CREATE INDEX ai_budget_day_status_idx ON ai_budget_reservations(day_utc, status);

CREATE TABLE ai_provider_circuits (
  provider TEXT PRIMARY KEY CHECK (provider IN ('gemini')),
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  open_until TEXT,
  probe_token TEXT,
  probe_started_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((state='half_open' AND probe_token IS NOT NULL AND probe_started_at IS NOT NULL) OR
         (state!='half_open' AND probe_token IS NULL AND probe_started_at IS NULL))
);

INSERT INTO ai_provider_circuits (provider) VALUES ('gemini');
