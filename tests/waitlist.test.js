import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "../src/auth.js";
import { cleanWaitlistEntry, waitlistHandler } from "../src/waitlist.js";

const valid = { name: "Ana", email: "Ana@Example.com ", instagram: "@ana.ugc", campaigns_per_month: "1-2", consent: true };

function waitlistRequest(body, origin = "https://app.example") {
  return new Request("https://app.example/api/waitlist", {
    method: "POST", body: JSON.stringify(body),
    headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" }
  });
}

function recordingDb() {
  const calls = [];
  return { calls, prepare(sql) { return { bind(...params) { calls.push({ sql, params }); return { run: async () => ({}) }; } }; } };
}

test("waitlist entries are normalized and validated", () => {
  const entry = cleanWaitlistEntry(valid);
  assert.equal(entry.email, "ana@example.com");
  assert.equal(entry.instagram, "ana.ugc");
  assert.equal(entry.founderInterest, 0);
  assert.throws(() => cleanWaitlistEntry({ ...valid, consent: false }), AuthError);
  assert.throws(() => cleanWaitlistEntry({ ...valid, email: "sem-arroba" }), AuthError);
  assert.throws(() => cleanWaitlistEntry({ ...valid, instagram: "dois nomes" }), AuthError);
  assert.throws(() => cleanWaitlistEntry({ ...valid, campaigns_per_month: "100" }), AuthError);
  assert.throws(() => cleanWaitlistEntry({ ...valid, name: "x".repeat(81) }), AuthError);
});

test("waitlist stores a same-origin entry with bound parameters only", async () => {
  const db = recordingDb();
  const result = await waitlistHandler(waitlistRequest({ ...valid, founder_interest: true, niche: "'); DROP TABLE x;--" }), { DB: db }, "/api/waitlist");
  assert.deepEqual(result, { joined: true });
  assert.equal(db.calls.length, 1);
  assert.doesNotMatch(db.calls[0].sql, /DROP TABLE/);
  assert.ok(db.calls[0].params.includes("'); DROP TABLE x;--"));
  assert.ok(db.calls[0].params.includes(1));
});

test("waitlist rejects cross-origin posts and silently drops honeypot submissions", async () => {
  const db = recordingDb();
  await assert.rejects(waitlistHandler(waitlistRequest(valid, "https://evil.example"), { DB: db }, "/api/waitlist"),
    (error) => error instanceof AuthError && error.status === 403);
  const result = await waitlistHandler(waitlistRequest({ ...valid, website: "spam.example" }), { DB: db }, "/api/waitlist");
  assert.deepEqual(result, { joined: true });
  assert.equal(db.calls.length, 0);
});

test("closed beta blocks sign-up for e-mails that were not approved", async () => {
  const db = (approvedAt) => ({ prepare: () => ({ bind: () => ({ first: async () => (approvedAt === undefined ? null : { approved_at: approvedAt }) }) }) });
  const { assertBetaApproved } = await import("../src/waitlist.js");
  await assert.rejects(assertBetaApproved({ BETA_INVITE_ONLY: "true", DB: db() }, "a@example.com"),
    (error) => error instanceof AuthError && error.status === 403 && error.code === "beta_not_approved");
  await assert.rejects(assertBetaApproved({ BETA_INVITE_ONLY: "true", DB: db(null) }, "a@example.com"), AuthError);
  await assertBetaApproved({ BETA_INVITE_ONLY: "true", DB: db("2026-10-18T00:00:00Z") }, "a@example.com");
  await assertBetaApproved({ BETA_INVITE_ONLY: "false", DB: db() }, "a@example.com");
});
