import test from "node:test";
import assert from "node:assert/strict";
import { instagramCallback, instagramHandler, syncInstagramInsights } from "../src/instagram.js";

const workspace = { workspace_id: "workspace-instagram-a", auth_subject: "creator-a" };
const tokenKey = Buffer.alloc(32, 7);
const accessToken = "long-lived-instagram-access-token-secret";

function instagramEnvironment({ connection = null } = {}) {
  const state = { oauthState: null, oauthConsumed: false, savedConnection: null, batches: [], runs: [] };
  const DB = {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("SELECT workspace_id FROM instagram_oauth_states")) {
            return state.oauthConsumed ? { workspace_id: workspace.workspace_id } : null;
          }
          if (sql.includes("SELECT id FROM instagram_connections")) return state.savedConnection ? { id: "connection-a" } : null;
          return null;
        },
        async all() {
          if (sql.includes("SELECT workspace_id, meta_account_id, encrypted_token")) {
            return { results: connection ? [connection] : [] };
          }
          return { results: [] };
        },
        async run() {
          state.runs.push({ sql, values: this.values });
          if (sql.includes("UPDATE instagram_oauth_states SET consumed_at=?1")) {
            const [consumedAt, hash] = this.values;
            if (!state.oauthState || hash !== state.oauthState.hash || state.oauthConsumed ||
                Date.parse(state.oauthState.expiresAt) <= Date.parse(consumedAt)) return { meta: { changes: 0 } };
            state.oauthConsumed = true;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        }
      };
    },
    async batch(statements) {
      const captured = statements.map(({ sql, values }) => ({ sql, values }));
      state.batches.push(captured);
      const stateInsert = captured.find((statement) => statement.sql.includes("INSERT INTO instagram_oauth_states"));
      if (stateInsert) state.oauthState = { hash: stateInsert.values[0], expiresAt: "2999-01-01T00:00:00.000Z" };
      const connectionInsert = captured.find((statement) => statement.sql.includes("INSERT INTO instagram_connections"));
      if (connectionInsert) state.savedConnection = connectionInsert;
      return statements.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return {
    DB,
    state,
    INSTAGRAM_APP_ID: "meta-app-id",
    INSTAGRAM_APP_SECRET: "meta-app-secret",
    INSTAGRAM_REDIRECT_URI: "https://app.example/auth/instagram/callback",
    INSTAGRAM_TOKEN_ENCRYPTION_KEY: tokenKey.toString("base64"),
    META_GRAPH_API_VERSION: "v23.0"
  };
}

async function withFetch(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

function base64url(bytes) { return Buffer.from(bytes).toString("base64url"); }

async function sha256(value) {
  return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function encryptFixtureToken(workspaceId) {
  const key = await crypto.subtle.importKey("raw", tokenKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`nivel-creator:instagram-token:v1:${workspaceId}`);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key,
    new TextEncoder().encode(accessToken));
  return `v1.${base64url(iv)}.${base64url(ciphertext)}`;
}

function connectionRow(encryptedToken) {
  return { workspace_id: workspace.workspace_id, meta_account_id: "123456", encrypted_token: encryptedToken,
    expires_at: "2027-01-01T00:00:00.000Z" };
}

test("Instagram OAuth consumes state once and stores only an authenticated encrypted token", async () => {
  const env = instagramEnvironment();
  const start = await instagramHandler(new Request("https://app.example/api/instagram/connect", {
    method: "POST", headers: { origin: "https://app.example", "content-type": "application/json" },
    body: JSON.stringify({ consent: true })
  }), env, "/api/instagram/connect", workspace);
  const authorize = new URL(start.authorize_url);
  const state = authorize.searchParams.get("state");
  assert.equal(authorize.origin, "https://www.instagram.com");
  assert.deepEqual(authorize.searchParams.get("scope").split(","), [
    "instagram_business_basic", "instagram_business_manage_insights"
  ]);
  assert.equal(env.state.oauthState.hash, await sha256(state));

  const calls = [];
  await withFetch(async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (url.origin === "https://api.instagram.com") {
      return Response.json({ access_token: "short-lived-token", user_id: "123456" });
    }
    if (url.pathname === "/access_token") return Response.json({ access_token: accessToken, expires_in: 5184000 });
    if (url.pathname === "/v23.0/me") return Response.json({ user_id: "123456", username: "creator_a", account_type: "BUSINESS" });
    throw new Error(`Unexpected Meta request: ${url.pathname}`);
  }, async () => {
    const callback = (code) => new Request(`https://app.example/auth/instagram/callback?state=${encodeURIComponent(state)}&code=${code}`);
    const result = await instagramCallback(callback("oauth-code#_"), env);
    assert.equal(result.status, 303);
    assert.equal(new URL(result.headers.get("location")).searchParams.get("instagram"), "conectado");
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("referrer-policy"), "no-referrer");

    const replay = await instagramCallback(callback("replayed-code"), env);
    assert.equal(new URL(replay.headers.get("location")).searchParams.get("instagram"), "erro");
  });

  assert.equal(calls.length, 3);
  assert.equal(env.state.oauthConsumed, true);
  assert.equal(env.state.batches.filter((batch) => batch.some((entry) => entry.sql.includes("INSERT INTO instagram_connections"))).length, 1);
  const saved = env.state.savedConnection;
  const encryptedToken = saved.values[3];
  assert.match(encryptedToken, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(encryptedToken.includes(accessToken), false);
  assert.equal(JSON.stringify(env.state.batches).includes(accessToken), false);
});

test("revoked Instagram access token marks the connection revoked without saving provider text", async () => {
  const encrypted = await encryptFixtureToken(workspace.workspace_id);
  const env = instagramEnvironment({ connection: connectionRow(encrypted) });
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return Response.json({ error: { code: 190, message: `Expired token ${accessToken}` } }, { status: 400 });
  }, async () => syncInstagramInsights(env));

  assert.equal(calls, 1);
  const revoked = env.state.runs.find(({ sql }) => sql.includes("SET status='revoked'"));
  assert.ok(revoked);
  assert.deepEqual(revoked.values, [workspace.workspace_id]);
  assert.equal(JSON.stringify(env.state).includes(accessToken), false);
});

test("missing Instagram insights permission marks the connection for reauthorization", async () => {
  const encrypted = await encryptFixtureToken(workspace.workspace_id);
  const env = instagramEnvironment({ connection: connectionRow(encrypted) });
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return Response.json({ error: { code: 200, message: `Missing permission for ${accessToken}` } }, { status: 400 });
  }, async () => syncInstagramInsights(env));

  assert.equal(calls, 3);
  const batch = env.state.batches[0];
  assert.equal(batch.length, 6);
  const unavailable = batch.slice(0, 5);
  assert.ok(unavailable.every((statement) => statement.values[5] === null && statement.values[7] === "unavailable"));
  const connectionUpdate = batch[5];
  assert.match(connectionUpdate.sql, /status=CASE WHEN \?3=1 THEN 'error'/);
  assert.equal(connectionUpdate.values[1], "insufficient_permissions");
  assert.equal(connectionUpdate.values[2], 1);
  assert.equal(JSON.stringify(env.state.batches).includes(accessToken), false);
});
