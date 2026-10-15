import test from "node:test";
import assert from "node:assert/strict";
import { entitlementFromRow } from "../src/quota.js";

const now = Date.parse("2026-10-15T12:00:00.000Z");

test("paid entitlement takes precedence over an overlapping trial", () => {
  const entitlement = entitlementFromRow({
    trial_status: "trialing", trial_start: "2026-10-10T12:00:00.000Z", trial_end: "2026-10-17T12:00:00.000Z",
    subscription_status: "active", period_start: "2026-10-15T11:00:00.000Z", period_end: "2026-11-15T11:00:00.000Z"
  }, now);

  assert.deepEqual(entitlement, { cycleKey: "subscription:2026-10-15T11:00:00.000Z", limit: 60, plan: "paid" });
});

test("trial remains available through its exact UTC end and expires at the boundary", () => {
  const row = { trial_status: "trialing", trial_start: "2026-10-08T12:00:00.000Z", trial_end: "2026-10-15T12:00:00.000Z" };

  assert.equal(entitlementFromRow(row, now - 1).plan, "trial");
  assert.equal(entitlementFromRow(row, now), null);
});

test("past-due grace expires exactly 72 hours after the paid period", () => {
  const row = { subscription_status: "past_due", period_start: "2026-09-15T12:00:00.000Z", period_end: "2026-10-12T12:00:00.000Z" };

  assert.equal(entitlementFromRow(row, now - 1).plan, "paid");
  assert.equal(entitlementFromRow(row, now), null);
});

test("manual Pix paid cycle uses the same paid entitlement as a card cycle", () => {
  const row = { trial_status: "trialing", trial_start: "2026-10-10T12:00:00.000Z", trial_end: "2026-10-17T12:00:00.000Z",
    subscription_status: "active", period_start: "2026-10-15T10:00:00.000Z", period_end: "2026-11-15T10:00:00.000Z" };

  assert.equal(entitlementFromRow(row, now).plan, "paid");
  assert.equal(entitlementFromRow(row, now).limit, 60);
});

test("future trial does not grant access early", () => {
  const row = { trial_status: "trialing", trial_start: "2026-10-15T12:00:01.000Z", trial_end: "2026-10-22T12:00:01.000Z" };

  assert.equal(entitlementFromRow(row, now), null);
  assert.equal(entitlementFromRow(row, now + 1000).plan, "trial");
});

test("future paid period does not override an active trial", () => {
  const row = {
    trial_status: "trialing", trial_start: "2026-10-10T12:00:00.000Z", trial_end: "2026-10-20T12:00:00.000Z",
    subscription_status: "active", period_start: "2026-10-20T12:00:00.000Z", period_end: "2026-11-20T12:00:00.000Z"
  };

  assert.deepEqual(entitlementFromRow(row, now), { cycleKey: "trial:2026-10-10T12:00:00.000Z", limit: 10, plan: "trial" });
  assert.equal(entitlementFromRow(row, Date.parse("2026-10-20T12:00:00.000Z")).plan, "paid");
});

test("invalid subscription start cannot grant access", () => {
  const row = {
    subscription_status: "active", period_start: "not-a-date", period_end: "2026-11-15T11:00:00.000Z"
  };

  assert.equal(entitlementFromRow(row, now), null);
});
