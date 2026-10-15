const ACCESS_COOKIE = "__Host-nivel_access";
const REFRESH_COOKIE = "__Host-nivel_refresh";
const ACCESS_MAX_AGE = 60 * 60;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export class AuthError extends Error {
  constructor(status = 401, message = "Entre na sua conta para continuar.", code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function authConfigured(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

function baseUrl(env) {
  if (!authConfigured(env)) throw new AuthError(503, "A autenticação ainda não foi configurada.");
  const url = new URL(env.SUPABASE_URL);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol !== "https:" && !localHosts.has(url.hostname)) throw new AuthError(503, "A configuração de autenticação é inválida.");
  return url.origin;
}

async function authFetch(env, path, { method = "GET", body, accessToken } = {}) {
  const headers = new Headers({ apikey: env.SUPABASE_ANON_KEY, accept: "application/json" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return fetch(`${baseUrl(env)}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(8000)
  });
}

async function listMfaFactors(env, accessToken) {
  const result = await authFetch(env, "/auth/v1/factors", { accessToken });
  if (!result.ok) throw new AuthError(503, "Não foi possível consultar a configuração de autenticação adicional.");
  const data = await result.json();
  return Array.isArray(data.totp) ? data.totp : [];
}

// getUser validates the signature and session with Supabase Auth before claims are read here.
function validatedAssuranceLevel(accessToken) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return "aal1";
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.get("cookie") || "").split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return ["", ""];
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
}

function sessionCookies(session) {
  if (!session?.access_token || !session?.refresh_token) return [];
  const accessAge = Math.max(60, Math.min(Number(session.expires_in) || ACCESS_MAX_AGE, ACCESS_MAX_AGE));
  return [
    `${ACCESS_COOKIE}=${session.access_token}; Path=/; Max-Age=${accessAge}; Secure; HttpOnly; SameSite=Lax`,
    `${REFRESH_COOKIE}=${session.refresh_token}; Path=/; Max-Age=${REFRESH_MAX_AGE}; Secure; HttpOnly; SameSite=Lax`
  ];
}

export function clearSessionCookies() {
  return [
    `${ACCESS_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`,
    `${REFRESH_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`
  ];
}

export function sessionFromResponse(data) {
  return sessionCookies(data?.access_token ? data : data?.session);
}

export async function signUp(env, email, password, redirectTo) {
  const path = `/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`;
  return authFetch(env, path, { method: "POST", body: { email, password } });
}

export async function signIn(env, email, password) {
  return authFetch(env, "/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
}

export async function recoverPassword(env, email, redirectTo) {
  return authFetch(env, `/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST", body: { email } });
}

export async function updatePassword(env, accessToken, password) {
  return authFetch(env, "/auth/v1/user", { method: "PUT", body: { password }, accessToken });
}

export async function verifyEmail(env, tokenHash, type) {
  return authFetch(env, "/auth/v1/verify", { method: "POST", body: { token_hash: tokenHash, type } });
}

export async function signOut(env, accessToken) {
  if (!accessToken || !authConfigured(env)) return;
  try {
    await authFetch(env, "/auth/v1/logout?scope=global", { method: "POST", accessToken });
  } catch {
    // Session cookies are cleared locally even if the provider is unavailable.
  }
}

async function getUser(env, accessToken) {
  const response = await authFetch(env, "/auth/v1/user", { accessToken });
  if (response.ok) return response.json();
  if (response.status !== 401) throw new AuthError(503, "A autenticação está temporariamente indisponível.");
  return null;
}

export async function requireUser(request, env, { allowMfaPending = false } = {}) {
  if (!authConfigured(env)) throw new AuthError(503, "A autenticação ainda não foi configurada.");
  const cookies = parseCookies(request);
  const accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];
  if (!accessToken && !refreshToken) throw new AuthError();

  if (accessToken) {
    const user = await getUser(env, accessToken);
    if (user?.id && user.email_confirmed_at) {
      const mfaFactors = await listMfaFactors(env, accessToken);
      const verifiedFactors = mfaFactors.filter((factor) => factor.status === "verified");
      const assuranceLevel = validatedAssuranceLevel(accessToken);
      if (!allowMfaPending && verifiedFactors.length && assuranceLevel !== "aal2") {
        throw new AuthError(403, "Confirme o código do seu autenticador para continuar.", "mfa_required");
      }
      return { user, cookies: [], accessToken, assuranceLevel, verifiedFactors, mfaFactors };
    }
  }

  if (!refreshToken) throw new AuthError();
  const response = await authFetch(env, "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken }
  });
  if (!response.ok) throw authResponseError(response.status);
  const session = await response.json();
  if (!session?.user?.id || !session.user.email_confirmed_at) throw new AuthError();
  const mfaFactors = await listMfaFactors(env, session.access_token);
  const verifiedFactors = mfaFactors.filter((factor) => factor.status === "verified");
  const assuranceLevel = validatedAssuranceLevel(session.access_token);
  if (!allowMfaPending && verifiedFactors.length && assuranceLevel !== "aal2") {
    throw new AuthError(403, "Confirme o código do seu autenticador para continuar.", "mfa_required");
  }
  return { user: session.user, cookies: sessionCookies(session), accessToken: session.access_token,
    assuranceLevel, verifiedFactors, mfaFactors };
}

export async function enrollTotp(env, accessToken, friendlyName) {
  return authFetch(env, "/auth/v1/factors", { method: "POST", accessToken,
    body: { factor_type: "totp", friendly_name: friendlyName } });
}

export async function challengeTotp(env, accessToken, factorId) {
  return authFetch(env, `/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, { method: "POST", accessToken, body: {} });
}

export async function verifyTotp(env, accessToken, factorId, challengeId, code) {
  return authFetch(env, `/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, { method: "POST", accessToken,
    body: { challenge_id: challengeId, code } });
}

export async function removeTotp(env, accessToken, factorId) {
  return authFetch(env, `/auth/v1/factors/${encodeURIComponent(factorId)}`, { method: "DELETE", accessToken });
}

export async function verifiedTotpFactors(env, accessToken) {
  return (await listMfaFactors(env, accessToken)).filter((factor) => factor.status === "verified");
}

export async function allTotpFactors(env, accessToken) {
  return listMfaFactors(env, accessToken);
}

export function accessTokenFromRequest(request) {
  return parseCookies(request)[ACCESS_COOKIE] || null;
}

export function assertSameOrigin(request, contentType = "application/json") {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new AuthError(403, "Origem da solicitação inválida.");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new AuthError(403, "Origem da solicitação inválida.");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith(contentType)) {
    throw new AuthError(415, contentType === "application/json" ? "Envie os dados em formato JSON." : "O tipo do arquivo enviado não é compatível.");
  }
}

export async function readJson(request, maxBytes = 8192) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new AuthError(413, "A solicitação é muito grande.");
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, "Os dados enviados não são válidos.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AuthError(413, "A solicitação é muito grande.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid object");
    return value;
  } catch {
    throw new AuthError(400, "Os dados enviados não são válidos.");
  }
}

export function validCredentials(body) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(400, "Informe um e-mail válido.");
  if (password.length < 8 || password.length > 128) throw new AuthError(400, "A senha deve ter entre 8 e 128 caracteres.");
  return { email, password };
}

export function authResponseError(status) {
  if (status === 429) return new AuthError(429, "Muitas tentativas. Aguarde um pouco e tente novamente.");
  if (status >= 500) return new AuthError(503, "A autenticação está temporariamente indisponível.");
  return new AuthError(401, "Não foi possível autenticar. Confira seus dados ou confirme seu e-mail.");
}
