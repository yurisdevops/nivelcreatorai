import test from "node:test";
import assert from "node:assert/strict";
import { assertSameOrigin, AuthError, requireUser } from "../src/auth.js";

const env = (adminRequired = false) => ({
  SUPABASE_URL: "https://auth.example",
  SUPABASE_ANON_KEY: "public-test-key",
  DB: { prepare: () => ({ bind: () => ({ first: async () => ({ required: adminRequired ? 1 : 0 }) }) }) }
});

function token(aal = "aal1", label = "session") {
  return `header.${Buffer.from(JSON.stringify({ aal, sub: label })).toString("base64url")}.signature`;
}

function sessionRequest({ accessToken = token(), refreshToken } = {}) {
  const cookie = [accessToken && `__Host-nivel_access=${accessToken}`,
    refreshToken && `__Host-nivel_refresh=${refreshToken}`].filter(Boolean).join("; ");
  return new Request("https://app.example/api/private", { headers: { cookie } });
}

async function withMockAuth(handler, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  try { await run(); } finally { globalThis.fetch = previous; }
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("Supabase rejects invalid or revoked access sessions before private access", async () => {
  await withMockAuth(async (url) => {
    assert.equal(new URL(url).pathname, "/auth/v1/user");
    return response({ message: "invalid token" }, 401);
  }, async () => {
    await assert.rejects(requireUser(sessionRequest(), env()),
      (error) => error instanceof AuthError && error.status === 401);
  });
});

test("expired access token refreshes only through Supabase and rotates HttpOnly cookies", async () => {
  const freshAccessToken = token("aal1", "fresh-session");
  const calls = [];
  await withMockAuth(async (url, options) => {
    const parsed = new URL(url);
    calls.push(`${options.method || "GET"} ${parsed.pathname}${parsed.search}`);
    if (parsed.pathname === "/auth/v1/user") return response({ message: "expired" }, 401);
    if (parsed.pathname === "/auth/v1/token") return response({
      access_token: freshAccessToken, refresh_token: "rotated-refresh", expires_in: 3600,
      user: { id: "creator-a", email: "a@example.com", email_confirmed_at: "2026-10-15T12:00:00Z" }
    });
    if (parsed.pathname === "/auth/v1/factors") return response({ totp: [] });
    throw new Error(`Unexpected auth request: ${parsed.pathname}`);
  }, async () => {
    const session = await requireUser(sessionRequest({ refreshToken: "old-refresh" }), env());
    assert.equal(session.user.id, "creator-a");
    assert.equal(session.assuranceLevel, "aal1");
    assert.ok(session.cookies.some((cookie) => cookie.startsWith(`__Host-nivel_access=${freshAccessToken};`) && cookie.includes("HttpOnly")));
    assert.ok(session.cookies.some((cookie) => cookie.startsWith("__Host-nivel_refresh=rotated-refresh;") && cookie.includes("HttpOnly")));
  });
  assert.deepEqual(calls, [
    "GET /auth/v1/user",
    "POST /auth/v1/token?grant_type=refresh_token",
    "GET /auth/v1/factors"
  ]);
});

test("a revoked refresh token is rejected without returning a session", async () => {
  await withMockAuth(async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") return response({}, 401);
    if (parsed.pathname === "/auth/v1/token") return response({ message: "refresh token revoked" }, 401);
    throw new Error(`Unexpected auth request: ${parsed.pathname}`);
  }, async () => {
    await assert.rejects(requireUser(sessionRequest({ refreshToken: "revoked-refresh" }), env()),
      (error) => error instanceof AuthError && error.status === 401);
  });
});

test("a verified TOTP factor requires an AAL2 session for private APIs", async () => {
  await withMockAuth(async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") return response({ id: "creator-a", email_confirmed_at: "2026-10-15T12:00:00Z" });
    if (parsed.pathname === "/auth/v1/factors") return response({ totp: [{ id: "totp-a", status: "verified" }] });
    throw new Error(`Unexpected auth request: ${parsed.pathname}`);
  }, async () => {
    await assert.rejects(requireUser(sessionRequest(), env()),
      (error) => error instanceof AuthError && error.status === 403 && error.code === "mfa_required");
  });
});

test("admin membership without TOTP is denied until MFA enrollment", async () => {
  await withMockAuth(async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") return response({ id: "admin-a", email_confirmed_at: "2026-10-15T12:00:00Z" });
    if (parsed.pathname === "/auth/v1/factors") return response({ totp: [] });
    throw new Error(`Unexpected auth request: ${parsed.pathname}`);
  }, async () => {
    await assert.rejects(requireUser(sessionRequest(), env(true)),
      (error) => error instanceof AuthError && error.status === 403 && error.code === "mfa_enrollment_required");
  });
});

test("unsafe cross-origin state changes are rejected", () => {
  assertSameOrigin(new Request("https://app.example/api/private", { method: "POST", headers: {
    origin: "https://app.example", "content-type": "application/json"
  } }));
  assert.throws(() => assertSameOrigin(new Request("https://app.example/api/private", { method: "POST", headers: {
    origin: "https://attacker.example", "content-type": "application/json"
  } })), (error) => error instanceof AuthError && error.status === 403);
  assert.throws(() => assertSameOrigin(new Request("https://app.example/api/private", { method: "POST", headers: {
    origin: "https://app.example", "sec-fetch-site": "cross-site", "content-type": "application/json"
  } })), (error) => error instanceof AuthError && error.status === 403);
});
