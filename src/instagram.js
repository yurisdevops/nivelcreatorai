import { AuthError, assertSameOrigin, readJson } from "./auth.js";

const REQUIRED_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"];
const GRAPH_ORIGIN = "https://graph.instagram.com";
const TOKEN_ORIGIN = "https://api.instagram.com";
const CONSENT_VERSION = "instagram-insights-2026-10-15";

function apiVersion(env) {
  const value = env.META_GRAPH_API_VERSION;
  if (!/^v\d{1,2}\.\d$/.test(value)) throw new AuthError(503, "A versão da API Meta não está configurada corretamente.");
  return value;
}

function configured(env) {
  return Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET && env.INSTAGRAM_REDIRECT_URI &&
    env.INSTAGRAM_TOKEN_ENCRYPTION_KEY && /^v\d{1,2}\.\d$/.test(env.META_GRAPH_API_VERSION || "") && env.DB);
}

function callbackUrl(env, request) {
  const configuredUrl = new URL(env.INSTAGRAM_REDIRECT_URI);
  const requestUrl = new URL(request.url);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if ((configuredUrl.protocol !== "https:" && !localHosts.has(configuredUrl.hostname)) ||
      configuredUrl.username || configuredUrl.password || configuredUrl.search || configuredUrl.hash ||
      requestUrl.origin !== configuredUrl.origin ||
      !["/api/instagram/connect", "/auth/instagram/callback"].includes(requestUrl.pathname) ||
      configuredUrl.pathname !== "/auth/instagram/callback") {
    throw new AuthError(503, "A URL de retorno do Instagram não corresponde a este ambiente.");
  }
  return configuredUrl.toString();
}

function decodeBase64(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function encryptionKey(env) {
  let raw;
  try { raw = decodeBase64(env.INSTAGRAM_TOKEN_ENCRYPTION_KEY); } catch { raw = new Uint8Array(); }
  if (raw.length !== 32) throw new AuthError(503, "A chave de criptografia dos tokens do Instagram deve ter 32 bytes em Base64.");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptToken(env, workspaceId, token) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`nivel-creator:instagram-token:v1:${workspaceId}`);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key,
    new TextEncoder().encode(token));
  return `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(ciphertext))}`;
}

async function decryptToken(env, workspaceId, encrypted) {
  const [version, ivText, ciphertextText, extra] = String(encrypted || "").split(".");
  if (version !== "v1" || !ivText || !ciphertextText || extra) throw new Error("token_format");
  const key = await encryptionKey(env);
  const aad = new TextEncoder().encode(`nivel-creator:instagram-token:v1:${workspaceId}`);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64(ivText), additionalData: aad, tagLength: 128 },
    key, decodeBase64(ciphertextText));
  return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return encodeBase64(new Uint8Array(digest));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(12000) });
  let value;
  try { value = await response.json(); } catch { value = null; }
  if (!response.ok || !value || typeof value !== "object" || value.error) {
    const error = new Error("provider_error");
    const graphCode = Number(value?.error?.code);
    if (response.status === 401 || [102, 190].includes(graphCode)) error.code = "instagram_token_invalid";
    else if (response.status === 403 || [10, 200].includes(graphCode)) error.code = "instagram_permission_denied";
    throw error;
  }
  return value;
}

async function exchangeCode(env, code, redirectUri) {
  const form = new URLSearchParams({ client_id: env.INSTAGRAM_APP_ID, client_secret: env.INSTAGRAM_APP_SECRET,
    grant_type: "authorization_code", redirect_uri: redirectUri, code });
  const shortToken = await fetchJson(`${TOKEN_ORIGIN}/oauth/access_token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form
  });
  if (typeof shortToken.access_token !== "string" || shortToken.access_token.length > 8192) throw new Error("provider_error");
  const longUrl = new URL(`${GRAPH_ORIGIN}/access_token`);
  longUrl.search = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: env.INSTAGRAM_APP_SECRET,
    access_token: shortToken.access_token }).toString();
  const longToken = await fetchJson(longUrl);
  if (typeof longToken.access_token !== "string" || longToken.access_token.length > 8192) throw new Error("provider_error");
  return { accessToken: longToken.access_token, expiresIn: Number(longToken.expires_in) };
}

async function loadProfile(env, accessToken) {
  const url = new URL(`${GRAPH_ORIGIN}/${apiVersion(env)}/me`);
  url.search = new URLSearchParams({ fields: "user_id,username,account_type,media_count", access_token: accessToken }).toString();
  const profile = await fetchJson(url);
  const id = String(profile.user_id ?? profile.id ?? "");
  if (!/^\d{1,100}$/.test(id) || typeof profile.username !== "string" || profile.username.length > 100) throw new Error("profile_error");
  const accountType = typeof profile.account_type === "string" ? profile.account_type.slice(0, 40) : null;
  if (accountType && !["BUSINESS", "MEDIA_CREATOR"].includes(accountType.toUpperCase())) throw new Error("professional_account_required");
  return { id, username: profile.username, accountType };
}

async function connectStart(request, env, account) {
  if (!configured(env)) throw new AuthError(503, "Configure o app profissional do Instagram e a chave de criptografia deste Worker.");
  assertSameOrigin(request);
  const body = await readJson(request);
  if (body.consent !== true) throw new AuthError(400, "Confirme a autorização de leitura de dados básicos e insights do Instagram.");
  const redirectUri = callbackUrl(env, request);
  await encryptionKey(env);
  const state = encodeBase64(crypto.getRandomValues(new Uint8Array(32)));
  const stateHash = await sha256(state);
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM instagram_oauth_states WHERE expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        OR (consumed_at IS NOT NULL AND consumed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'))`),
      env.DB.prepare(`INSERT INTO instagram_oauth_states (state_hash, workspace_id, expires_at)
        VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 minutes'))`).bind(stateHash, account.workspace_id)
    ]);
  } catch { throw new AuthError(409, "Já existe uma conexão Instagram sendo autorizada. Conclua ou aguarde alguns minutos."); }
  const authorizeUrl = new URL("https://www.instagram.com/oauth/authorize");
  authorizeUrl.search = new URLSearchParams({ client_id: env.INSTAGRAM_APP_ID, redirect_uri: redirectUri,
    response_type: "code", scope: REQUIRED_SCOPES.join(","), state, enable_fb_login: "0" }).toString();
  return { authorize_url: authorizeUrl.toString() };
}

async function markStateConsumed(db, state) {
  const stateHash = await sha256(state);
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE instagram_oauth_states SET consumed_at=?1
    WHERE state_hash=?2 AND consumed_at IS NULL AND expires_at>?1`).bind(now, stateHash).run();
  if (!result.meta?.changes) return null;
  return db.prepare("SELECT workspace_id FROM instagram_oauth_states WHERE state_hash=?1").bind(stateHash).first();
}

function redirectResult(request, result) {
  const url = new URL("/", request.url);
  url.searchParams.set("instagram", result);
  return new Response(null, { status: 303, headers: { location: url.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

export async function instagramCallback(request, env) {
  if (request.method !== "GET" || !configured(env)) return redirectResult(request, "erro");
  let redirectUri;
  try { redirectUri = callbackUrl(env, request); } catch { return redirectResult(request, "erro"); }
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  if (state.length < 32 || state.length > 200) return redirectResult(request, "erro");
  const claimed = await markStateConsumed(env.DB, state).catch(() => null);
  if (!claimed) return redirectResult(request, "erro");
  if (url.searchParams.has("error") || url.searchParams.has("error_reason")) return redirectResult(request, "cancelado");
  let code = url.searchParams.get("code") || "";
  code = code.replace(/#_$/, "");
  if (!code || code.length > 2048) return redirectResult(request, "erro");
  try {
    const token = await exchangeCode(env, code, redirectUri);
    const profile = await loadProfile(env, token.accessToken);
    const encrypted = await encryptToken(env, claimed.workspace_id, token.accessToken);
    const expiresAt = Number.isFinite(token.expiresIn) && token.expiresIn > 0
      ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : null;
    const previous = await env.DB.prepare("SELECT id FROM instagram_connections WHERE workspace_id=?1").bind(claimed.workspace_id).first();
    const connectionId = previous?.id || crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO instagram_connections
        (id, workspace_id, meta_account_id, encrypted_token, expires_at, status, username, account_type, consent_at, consent_version,
          token_refresh_attempt_at, last_sync_at, last_sync_attempt_at, last_error)
        VALUES (?1, ?2, ?3, ?4, ?5, 'connected', ?6, ?7, ?8, ?9, NULL, NULL, NULL, NULL)
        ON CONFLICT(workspace_id) DO UPDATE SET meta_account_id=excluded.meta_account_id,
          encrypted_token=excluded.encrypted_token, expires_at=excluded.expires_at, status='connected',
          username=excluded.username, account_type=excluded.account_type, consent_at=excluded.consent_at,
          consent_version=excluded.consent_version, token_refresh_attempt_at=NULL, last_sync_at=NULL,
          last_sync_attempt_at=NULL, last_error=NULL`)
        .bind(connectionId, claimed.workspace_id, profile.id, encrypted, expiresAt, profile.username,
          profile.accountType, new Date().toISOString(), CONSENT_VERSION),
      env.DB.prepare(`INSERT INTO audit_logs (id, workspace_id, actor_user_id, action, target_type, target_id, metadata_json)
        SELECT ?1, ?2, w.owner_id, 'instagram.connected', 'instagram_account', ?3, ?4 FROM workspaces w WHERE w.id=?2`)
        .bind(crypto.randomUUID(), claimed.workspace_id, profile.id, JSON.stringify({ username: profile.username, scopes: REQUIRED_SCOPES }))
    ]);
    return redirectResult(request, "conectado");
  } catch {
    return redirectResult(request, "erro");
  }
}

async function connectionStatus(env, account) {
  const row = await env.DB.prepare(`SELECT meta_account_id, username, account_type, status, expires_at, consent_at, last_sync_at, last_error
    FROM instagram_connections WHERE workspace_id=?1`).bind(account.workspace_id).first();
  if (!row) return { configured: configured(env), connection: null };
  const expired = row.expires_at && Date.parse(row.expires_at) <= Date.now();
  return { configured: configured(env), connection: { ...row, status: expired && row.status === "connected" ? "expired" : row.status } };
}

async function disconnect(request, env, account) {
  assertSameOrigin(request);
  const body = await readJson(request);
  if (body.confirm !== true) throw new AuthError(400, "Confirme a desconexão da conta do Instagram.");
  const connection = await env.DB.prepare("SELECT meta_account_id, username FROM instagram_connections WHERE workspace_id=?1").bind(account.workspace_id).first();
  if (!connection) return { disconnected: true };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM instagram_connections WHERE workspace_id=?1").bind(account.workspace_id),
    env.DB.prepare(`UPDATE instagram_oauth_states SET consumed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE workspace_id=?1 AND consumed_at IS NULL`).bind(account.workspace_id),
    env.DB.prepare(`INSERT INTO audit_logs (id, workspace_id, actor_user_id, action, target_type, target_id, metadata_json)
      VALUES (?1, ?2, ?3, 'instagram.disconnected', 'instagram_account', ?4, ?5)`)
      .bind(crypto.randomUUID(), account.workspace_id, account.auth_subject, connection.meta_account_id,
        JSON.stringify({ username: connection.username, local_token_deleted: true }))
  ]);
  return { disconnected: true };
}

export async function instagramHandler(request, env, path, account) {
  if (path === "/api/instagram/status" && request.method === "GET") return connectionStatus(env, account);
  if (path === "/api/instagram/connect" && request.method === "POST") return connectStart(request, env, account);
  if (path === "/api/instagram/disconnect" && request.method === "POST") return disconnect(request, env, account);
  if (path.startsWith("/api/instagram/")) throw new AuthError(405, "Rota ou método não disponível.");
  return null;
}

export async function refreshInstagramTokens(env) {
  if (!env.DB || !configured(env)) return;
  const { results } = await env.DB.prepare(`SELECT workspace_id, encrypted_token, expires_at FROM instagram_connections
    WHERE status='connected' AND expires_at IS NOT NULL
      AND julianday(expires_at)<=julianday('now','+10 days')
      AND (token_refresh_attempt_at IS NULL OR julianday(token_refresh_attempt_at)<=julianday('now','-6 hours'))
    ORDER BY expires_at LIMIT 10`).all();
  for (const connection of results || []) {
    await env.DB.prepare(`UPDATE instagram_connections SET token_refresh_attempt_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE workspace_id=?1 AND status='connected'`).bind(connection.workspace_id).run();
    try {
      const accessToken = await decryptToken(env, connection.workspace_id, connection.encrypted_token);
      const refreshUrl = new URL(`${GRAPH_ORIGIN}/refresh_access_token`);
      refreshUrl.search = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: accessToken }).toString();
      const refreshed = await fetchJson(refreshUrl);
      if (typeof refreshed.access_token !== "string" || refreshed.access_token.length > 8192) throw new Error("token_refresh_response");
      const encrypted = await encryptToken(env, connection.workspace_id, refreshed.access_token);
      const expiresAt = Number.isFinite(Number(refreshed.expires_in)) && Number(refreshed.expires_in) > 0
        ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString() : connection.expires_at;
      await env.DB.prepare(`UPDATE instagram_connections SET encrypted_token=?1, expires_at=?2, status='connected', last_error=NULL
        WHERE workspace_id=?3 AND status='connected'`).bind(encrypted, expiresAt, connection.workspace_id).run();
    } catch (error) {
      const expired = Date.parse(connection.expires_at) <= Date.now();
      if (error?.code === "instagram_token_invalid") {
        await env.DB.prepare(`UPDATE instagram_connections SET status='revoked', last_error='token_invalid'
          WHERE workspace_id=?1 AND status='connected'`).bind(connection.workspace_id).run();
      } else if (error?.code === "instagram_permission_denied") {
        await env.DB.prepare(`UPDATE instagram_connections SET status='error', last_error='insufficient_permissions'
          WHERE workspace_id=?1 AND status='connected'`).bind(connection.workspace_id).run();
      } else if (expired) {
        await env.DB.prepare(`UPDATE instagram_connections SET status='expired', last_error='token_expired'
          WHERE workspace_id=?1 AND status='connected'`).bind(connection.workspace_id).run();
      }
    }
  }
}

function metricNumber(entry, lastValue = false) {
  const value = lastValue
    ? entry?.values?.at(-1)?.value ?? entry?.total_value?.value
    : entry?.total_value?.value ?? (entry?.values?.length === 1 ? entry.values[0]?.value : undefined);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function requestInsights(env, accountId, accessToken, metrics, period, since, until, metricType) {
  const url = new URL(`${GRAPH_ORIGIN}/${apiVersion(env)}/${encodeURIComponent(accountId)}/insights`);
  const params = { metric: metrics.join(","), period, access_token: accessToken };
  if (metricType) params.metric_type = metricType;
  if (since) params.since = String(since);
  if (until) params.until = String(until);
  url.search = new URLSearchParams(params).toString();
  const payload = await fetchJson(url);
  return new Map((Array.isArray(payload.data) ? payload.data : []).map((entry) => [entry.name, entry]));
}

export async function syncInstagramInsights(env) {
  if (!env.DB || !configured(env)) return;
  apiVersion(env);
  const { results } = await env.DB.prepare(`SELECT workspace_id, meta_account_id, encrypted_token
    FROM instagram_connections WHERE status='connected' AND consent_at IS NOT NULL
      AND (last_sync_at IS NULL OR julianday(last_sync_at)<=julianday('now','-1 day'))
      AND (last_sync_attempt_at IS NULL OR julianday(last_sync_attempt_at)<=julianday('now','-6 hours'))
    ORDER BY COALESCE(last_sync_at,'1970-01-01T00:00:00.000Z') LIMIT 10`).all();
  for (const connection of results || []) {
    await env.DB.prepare(`UPDATE instagram_connections SET last_sync_attempt_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_error=NULL
      WHERE workspace_id=?1 AND status='connected'`).bind(connection.workspace_id).run();
    try {
      const token = await decryptToken(env, connection.workspace_id, connection.encrypted_token);
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
      const since = Math.floor(start.getTime() / 1000);
      const until = Math.floor(now.getTime() / 1000);
      const startDate = start.toISOString().slice(0, 10);
      const endDate = now.toISOString().slice(0, 10);
      let insights = new Map();
      let insightError = false;
      let permissionError = false;
      try {
        insights = await requestInsights(env, connection.meta_account_id, token,
          ["reach", "views", "total_interactions"], "day", since, until, "total_value");
      } catch (error) {
        if (error?.code === "instagram_token_invalid") {
          await env.DB.prepare(`UPDATE instagram_connections SET status='revoked', last_error='token_invalid'
            WHERE workspace_id=?1 AND status='connected'`).bind(connection.workspace_id).run();
          continue;
        }
        insightError = true;
        permissionError ||= error?.code === "instagram_permission_denied";
      }
      let followers = null;
      try {
        const followerInsights = await requestInsights(env, connection.meta_account_id, token,
          ["follower_count"], "lifetime", null, null, null);
        followers = metricNumber(followerInsights.get("follower_count"), true);
      } catch (error) {
        if (error?.code === "instagram_token_invalid") {
          await env.DB.prepare(`UPDATE instagram_connections SET status='revoked', last_error='token_invalid'
            WHERE workspace_id=?1 AND status='connected'`).bind(connection.workspace_id).run();
          continue;
        }
        permissionError ||= error?.code === "instagram_permission_denied";
        /* Follower count may be unavailable for accounts below Meta's privacy threshold. */
      }
      let profileVisits = null;
      try {
        const profileInsights = await requestInsights(env, connection.meta_account_id, token,
          ["profile_views"], "day", since, until, "total_value");
        profileVisits = metricNumber(profileInsights.get("profile_views"));
      } catch (error) {
        if (error?.code === "instagram_token_invalid") {
          await env.DB.prepare(`UPDATE instagram_connections SET status='revoked', last_error='token_invalid'
            WHERE workspace_id=?1 AND status='connected'`).bind(connection.workspace_id).run();
          continue;
        }
        permissionError ||= error?.code === "instagram_permission_denied";
        /* Some API versions or account permissions may not provide this metric. */
      }

      const mapping = [
        { key: "reach", api: "reach" },
        { key: "views", api: "views" },
        { key: "interactions", api: "total_interactions" },
        { key: "followers", api: "follower_count" },
        { key: "profile_visits", api: "profile_views" }
      ];
      const statements = mapping.map(({ key, api }) => {
        const value = key === "followers" ? followers : key === "profile_visits" ? profileVisits : metricNumber(insights.get(api));
        const availability = value === null ? "unavailable" : "available";
        const periodStart = key === "followers" ? endDate : startDate;
        return env.DB.prepare(`INSERT INTO metric_snapshots
          (id, workspace_id, metric, period_start, period_end, value, source, fetched_at, availability)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'Instagram API (Login profissional)', ?7, ?8)
          ON CONFLICT(workspace_id, metric, period_start, period_end, source) DO UPDATE SET
            value=excluded.value, fetched_at=excluded.fetched_at, availability=excluded.availability`)
          .bind(crypto.randomUUID(), connection.workspace_id, key, periodStart, endDate, value, now.toISOString(), availability);
      });
      statements.push(env.DB.prepare(`UPDATE instagram_connections SET last_sync_at=?1, last_error=?2,
        status=CASE WHEN ?3=1 THEN 'error' ELSE status END
        WHERE workspace_id=?4 AND status='connected'`)
        .bind(now.toISOString(), permissionError ? "insufficient_permissions" : insightError ? "insights_unavailable" : null,
          permissionError ? 1 : 0, connection.workspace_id));
      await env.DB.batch(statements);
    } catch (error) {
      // Never persist provider response bodies, access tokens, or profile data in an error log.
      await env.DB.prepare(`UPDATE instagram_connections SET last_error='sync_failed'
        WHERE workspace_id=?1 AND status='connected'`).bind(connection.workspace_id).run();
    }
  }
}
