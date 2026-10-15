ALTER TABLE notifications ADD COLUMN email_status TEXT NOT NULL DEFAULT 'not_requested'
  CHECK (email_status IN ('not_requested', 'pending', 'sending', 'sent', 'failed'));
ALTER TABLE notifications ADD COLUMN email_attempts INTEGER NOT NULL DEFAULT 0 CHECK (email_attempts >= 0);
ALTER TABLE notifications ADD COLUMN email_next_attempt_at TEXT;
ALTER TABLE notifications ADD COLUMN email_lease_until TEXT;
ALTER TABLE notifications ADD COLUMN email_sent_at TEXT;

CREATE INDEX notifications_email_delivery_idx
  ON notifications(email_status, email_next_attempt_at, email_lease_until, created_at);
