CREATE TABLE billing_checkout_intents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  external_reference TEXT NOT NULL UNIQUE,
  provider_checkout_id TEXT UNIQUE,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  checkout_url TEXT,
  billing_type TEXT NOT NULL CHECK (billing_type IN ('CREDIT_CARD', 'PIX')),
  first_due_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'canceled', 'expired', 'failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE subscriptions ADD COLUMN checkout_intent_id TEXT REFERENCES billing_checkout_intents(id) ON DELETE SET NULL;
ALTER TABLE payment_events ADD COLUMN payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json));

CREATE INDEX billing_intents_workspace_created_idx ON billing_checkout_intents(workspace_id, created_at DESC);
CREATE INDEX billing_intents_customer_idx ON billing_checkout_intents(provider_customer_id, status);
CREATE UNIQUE INDEX billing_one_pending_checkout_per_workspace_idx ON billing_checkout_intents(workspace_id) WHERE status='pending';
CREATE INDEX subscriptions_status_period_idx ON subscriptions(status, period_end);
