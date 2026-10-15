import test from "node:test";
import assert from "node:assert/strict";
import { dashboardHandler } from "../src/dashboard.js";
import { AuthError } from "../src/auth.js";

function dashboardDb({ metrics = [], strategy = null, upcoming = [], trial = null } = {}) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (sql.includes("metric_snapshots")) return { results: metrics };
          if (sql.includes("calendar_events")) return { results: upcoming };
          return { results: [] };
        },
        async first() {
          if (sql.includes("FROM strategies")) return strategy;
          if (sql.includes("FROM trials")) return trial;
          return null;
        }
      };
    }
  };
}

const account = { workspace_id: "workspace-a" };
const request = (path = "/api/dashboard", method = "GET") =>
  new Request(`https://app.example${path}`, { method });

test("dashboard leaves unavailable metrics empty instead of inventing values", async () => {
  const result = await dashboardHandler(request(), { DB: dashboardDb() }, "/api/dashboard", account);

  assert.deepEqual(result.metrics, {
    reach: null, interactions: null, profile_visits: null, followers: null
  });
  assert.equal(result.diagnostic, null);
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.upcoming, []);
  assert.equal(result.trial, null);
});

test("dashboard selects the latest snapshot per known metric and ignores unknown metrics", async () => {
  const newestReach = { metric: "reach", value: 250, source: "instagram", fetched_at: "2026-10-15T12:00:00Z" };
  const result = await dashboardHandler(request(), { DB: dashboardDb({ metrics: [
    newestReach,
    { metric: "reach", value: 100, source: "instagram", fetched_at: "2026-10-14T12:00:00Z" },
    { metric: "invented_metric", value: 999999 }
  ] }) }, "/api/dashboard", account);

  assert.equal(result.metrics.reach, newestReach);
  assert.equal(result.metrics.interactions, null);
  assert.equal(Object.hasOwn(result.metrics, "invented_metric"), false);
});

test("dashboard tolerates malformed legacy recommendations", async () => {
  const result = await dashboardHandler(request(), { DB: dashboardDb({ strategy: {
    hypothesis: "Resumo", created_at: "2026-10-15T12:00:00Z", recommendations_json: "{invalid"
  } }) }, "/api/dashboard", account);

  assert.deepEqual(result.diagnostic, { summary: "Resumo", created_at: "2026-10-15T12:00:00Z" });
  assert.deepEqual(result.actions, []);
});

test("dashboard rejects non-GET requests and leaves unrelated routes to the router", async () => {
  await assert.rejects(dashboardHandler(request("/api/dashboard", "POST"), { DB: dashboardDb() }, "/api/dashboard", account),
    (error) => error instanceof AuthError && error.status === 405);
  assert.equal(await dashboardHandler(request("/api/other"), { DB: dashboardDb() }, "/api/other", account), null);
});
