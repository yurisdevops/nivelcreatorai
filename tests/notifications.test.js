import test from "node:test";
import assert from "node:assert/strict";
import { notificationCronHandler, notificationEmailAvailable, renderNotificationEmail } from "../src/notifications.js";

test("transactional email remains unavailable without a binding and configured sender", () => {
  assert.equal(notificationEmailAvailable({ EMAIL_FROM_ADDRESS: "avisos@nivelcreator.ai" }), false);
  assert.equal(notificationEmailAvailable({ EMAIL: {}, EMAIL_FROM_ADDRESS: "" }), false);
  assert.equal(notificationEmailAvailable({ EMAIL: {}, EMAIL_FROM_ADDRESS: "avisos@nivelcreator.ai" }), true);
  assert.equal(notificationEmailAvailable({ EMAIL: {}, EMAIL_FROM_ADDRESS: "email inválido" }), false);
});

test("trial reminder email escapes HTML and emits a plain text alternative", () => {
  const message = renderNotificationEmail("trial_ending", JSON.stringify({
    title: "Atenção <admin>", body: "Use & confira <script>alert(1)</script>"
  }));
  assert.equal(message.subject, "Atenção <admin>");
  assert.match(message.html, /Atenção &lt;admin&gt;/);
  assert.match(message.html, /Use &amp; confira &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.text, /Use & confira <script>alert\(1\)<\/script>/);
});

test("unsupported notification kinds and malformed content never produce email", () => {
  assert.equal(renderNotificationEmail("arbitrary", JSON.stringify({ title: "x", body: "y" })), null);
  assert.equal(renderNotificationEmail("trial_ending", "not-json"), null);
  assert.equal(renderNotificationEmail("trial_ending", JSON.stringify({ title: "x" })), null);
});

function notificationDb(row, initialAttempts = 0) {
  const state = { status: "pending", attempts: initialAttempts, nextAttemptAt: null };
  return {
    state,
    prepare(sql) {
      return {
        params: [],
        bind(...params) { this.params = params; return this; },
        async all() { return { results: row ? [row] : [] }; },
        async first() {
          if (!sql.includes("RETURNING email_attempts") || state.status !== "pending") return null;
          state.status = "sending";
          state.attempts += 1;
          return { email_attempts: state.attempts };
        },
        async run() {
          if (sql.includes("email_status='sent'")) state.status = "sent";
          else if (sql.includes("email_status=?2")) {
            state.status = this.params[1];
            state.nextAttemptAt = this.params[2];
          } else if (sql.includes("email_status='failed'")) state.status = "failed";
          return { meta: { changes: 1 } };
        }
      };
    },
    async batch() { return []; }
  };
}

test("scheduled delivery sends trial reminders once and records success", async () => {
  const db = notificationDb({ id: "trial-reminder-24h:workspace", workspace_id: "workspace", kind: "trial_ending",
    content_json: JSON.stringify({ title: "Lembrete", body: "Seu período está terminando." }), email: "creator@example.com" });
  const sent = [];
  await notificationCronHandler({ DB: db, EMAIL: { send: async (message) => sent.push(message) },
    EMAIL_FROM_ADDRESS: "avisos@nivelcreator.ai" });
  await notificationCronHandler({ DB: db, EMAIL: { send: async (message) => sent.push(message) },
    EMAIL_FROM_ADDRESS: "avisos@nivelcreator.ai" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "creator@example.com");
  assert.equal(db.state.status, "sent");
});

test("scheduled delivery retries transient failures with a bounded status", async () => {
  const db = notificationDb({ id: "trial-reminder-24h:workspace", workspace_id: "workspace", kind: "trial_ending",
    content_json: JSON.stringify({ title: "Lembrete", body: "Seu período está terminando." }), email: "creator@example.com" });
  await notificationCronHandler({ DB: db, EMAIL: { send: async () => { throw new Error("provider details are not persisted"); } },
    EMAIL_FROM_ADDRESS: "avisos@nivelcreator.ai" });
  assert.equal(db.state.status, "pending");
  assert.ok(db.state.nextAttemptAt);
});

test("scheduled delivery stops retrying after five provider failures", async () => {
  const db = notificationDb({ id: "trial-reminder-24h:workspace", workspace_id: "workspace", kind: "trial_ending",
    content_json: JSON.stringify({ title: "Lembrete", body: "Seu período está terminando." }), email: "creator@example.com" }, 4);
  await notificationCronHandler({ DB: db, EMAIL: { send: async () => { throw new Error("provider failure"); } },
    EMAIL_FROM_ADDRESS: "avisos@nivelcreator.ai" });
  assert.equal(db.state.status, "failed");
});
