import test from "node:test";
import assert from "node:assert/strict";
import { billingHandler } from "../src/billing.js";

function billingEnvironment({ billingType = "CREDIT_CARD", providerId = "sub/creator-a" } = {}) {
  const state = { batches: [], queries: [] };
  const DB = {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          state.queries.push({ sql, values: this.values });
          if (sql.includes("FROM subscriptions s LEFT JOIN billing_checkout_intents")) return {
            id: "sub-row-a", provider_id: providerId, status: "active",
            period_end: "2027-01-15T10:00:00.000Z", billing_type: billingType
          };
          return null;
        }
      };
    },
    async batch(statements) {
      state.batches.push(statements.map(({ sql, values }) => ({ sql, values })));
      return statements.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return { DB, state, ASAAS_API_KEY: "sandbox-test-key" };
}

function cancelRequest(body = { confirm_cancel: true }) {
  return new Request("https://app.example/api/billing/cancel", {
    method: "POST",
    headers: { origin: "https://app.example", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function withFetch(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

test("confirmed card cancellation stops Asaas renewal and preserves paid access through period end", async () => {
  const env = billingEnvironment();
  const calls = [];
  await withFetch(async (input, init) => {
    calls.push({ url: new URL(input), init });
    return new Response(null, { status: 204 });
  }, async () => {
    const result = await billingHandler(cancelRequest(), env, "/api/billing/cancel", {
      workspace_id: "workspace-a", auth_subject: "creator-a"
    });

    assert.deepEqual(result, { canceled: true, access_until: "2027-01-15T10:00:00.000Z" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.href, "https://api-sandbox.asaas.com/v3/subscriptions/sub%2Fcreator-a");
    assert.equal(calls[0].init.method, "DELETE");
    assert.equal(calls[0].init.headers.access_token, "sandbox-test-key");
  });

  assert.equal(env.state.batches.length, 1);
  assert.deepEqual(env.state.queries[0].values, ["workspace-a"]);
  const [cancelUpdate, audit] = env.state.batches[0];
  assert.match(cancelUpdate.sql, /SET status='canceled', cancel_at_period_end=1/);
  assert.deepEqual(cancelUpdate.values, ["workspace-a", "sub/creator-a"]);
  assert.match(audit.sql, /subscription\.canceled/);
  assert.equal(audit.values[1], "workspace-a");
  assert.equal(audit.values[2], "creator-a");
  assert.deepEqual(JSON.parse(audit.values[4]), { provider: "asaas", access_until: "2027-01-15T10:00:00.000Z" });
});

test("card cancellation requires explicit confirmation and never cancels a Pix cycle", async () => {
  const env = billingEnvironment();
  let calls = 0;
  await withFetch(async () => { calls += 1; return new Response(null, { status: 204 }); }, async () => {
    await assert.rejects(billingHandler(cancelRequest({}), env, "/api/billing/cancel", {
      workspace_id: "workspace-a", auth_subject: "creator-a"
    }), (error) => error.status === 400);
    await assert.rejects(billingHandler(cancelRequest(), billingEnvironment({ billingType: "PIX" }), "/api/billing/cancel", {
      workspace_id: "workspace-a", auth_subject: "creator-a"
    }), (error) => error.status === 409);
  });

  assert.equal(calls, 0);
  assert.equal(env.state.batches.length, 0);
});

test("failed Asaas cancellation leaves the local renewal active", async () => {
  const env = billingEnvironment();
  await withFetch(async () => new Response(JSON.stringify({ errors: [{ code: "invalid_subscription" }] }), {
    status: 500, headers: { "content-type": "application/json" }
  }), async () => {
    await assert.rejects(billingHandler(cancelRequest(), env, "/api/billing/cancel", {
      workspace_id: "workspace-a", auth_subject: "creator-a"
    }), (error) => error.status === 502);
  });

  assert.equal(env.state.batches.length, 0);
});
