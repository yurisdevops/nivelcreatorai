import {
  AuthError, accessTokenFromRequest, assertSameOrigin, authConfigured, authResponseError,
  clearSessionCookies, readJson, requireUser, sessionFromResponse, signIn, signOut,
  signUp, validCredentials, verifyEmail, recoverPassword, updatePassword
} from "./auth.js";
import { cleanProfileInput, ensureWorkspace, getWorkspace, saveProfile } from "./account.js";
import { creativeHandler } from "./creative.js";
import { calendarHandler } from "./calendar.js";
import { agentHandler } from "./agent.js";
import { campaignsHandler } from "./campaigns.js";
import { diagnosticsHandler } from "./diagnostics.js";
import { planningHandler } from "./planning.js";
import { dashboardHandler } from "./dashboard.js";
import { notificationCronHandler, notificationHandler } from "./notifications.js";

const securityHeaders = {
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

function response(body, status = 200, cookies = []) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(request, path, cookies = []) {
  const url = new URL(path, request.url);
  const headers = new Headers({ location: url.toString(), "cache-control": "no-store" });
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function isProviderConfigured(env) {
  return authConfigured(env) && Boolean(env.DB);
}

async function authHandler(request, env, path) {
  if (path === "/api/auth/status" && request.method === "GET") {
    return response({ configured: isProviderConfigured(env), auth_configured: authConfigured(env), database_configured: Boolean(env.DB) });
  }

  if (path === "/api/auth/signup" && request.method === "POST") {
    if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para ativar o cadastro.");
    assertSameOrigin(request);
    const credentials = validCredentials(await readJson(request));
    const callback = new URL("/auth/callback", request.url).toString();
    const result = await signUp(env, credentials.email, credentials.password, callback);
    if (!result.ok) throw authResponseError(result.status);
    const payload = await result.json();
    const cookies = payload.user?.email_confirmed_at ? sessionFromResponse(payload) : [];
    if (cookies.length) await ensureWorkspace(env, payload.user);
    return response({ verification_required: !cookies.length }, 201, cookies);
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para ativar o acesso.");
    assertSameOrigin(request);
    const credentials = validCredentials(await readJson(request));
    const result = await signIn(env, credentials.email, credentials.password);
    if (!result.ok) throw authResponseError(result.status);
    const payload = await result.json();
    if (!payload.user?.email_confirmed_at) throw new AuthError(403, "Confirme seu e-mail antes de entrar.");
    return response({ ok: true }, 200, sessionFromResponse(payload));
  }

  if (path === "/api/auth/recover" && request.method === "POST") {
    if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para recuperar o acesso.");
    assertSameOrigin(request);
    const body = await readJson(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(400, "Informe um e-mail válido.");
    const callback = new URL("/auth/callback", request.url).toString();
    const result = await recoverPassword(env, email, `${callback}?type=recovery`);
    if (result.status === 429) throw authResponseError(result.status);
    if (!result.ok && result.status >= 500) throw authResponseError(result.status);
    // Do not reveal whether an account exists for this address.
    return response({ accepted: true });
  }

  if (path === "/api/auth/password" && request.method === "POST") {
    if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para atualizar a senha.");
    assertSameOrigin(request);
    const body = await readJson(request);
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8 || password.length > 128) throw new AuthError(400, "A nova senha deve ter entre 8 e 128 caracteres.");
    const { user, accessToken } = await requireUser(request, env);
    if (!accessToken) throw new AuthError(401, "Abra o link de recuperação novamente para continuar.");
    const result = await updatePassword(env, accessToken, password);
    if (!result.ok) throw authResponseError(result.status);
    await signOut(env, accessToken);
    return response({ updated: true, user: user.id }, 200, clearSessionCookies());
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    assertSameOrigin(request);
    await signOut(env, accessTokenFromRequest(request));
    return response({ ok: true }, 200, clearSessionCookies());
  }

  return null;
}

async function callbackHandler(request, env) {
  if (request.method !== "GET") return response({ error: "Método não permitido." }, 405);
  if (!isProviderConfigured(env)) return redirect(request, "/entrar.html?erro=configuracao");
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (!tokenHash || tokenHash.length > 2048 || !["signup", "email", "magiclink", "recovery"].includes(type)) {
    return redirect(request, "/entrar.html?erro=confirmacao");
  }
  try {
    const result = await verifyEmail(env, tokenHash, type);
    if (!result.ok) return redirect(request, "/entrar.html?erro=confirmacao");
    const payload = await result.json();
    if (!payload.user?.email_confirmed_at || !sessionFromResponse(payload).length) {
      return redirect(request, "/entrar.html?verificado=1");
    }
    await ensureWorkspace(env, payload.user);
    if (type === "recovery") return redirect(request, "/entrar.html?redefinir=1", sessionFromResponse(payload));
    return redirect(request, "/", sessionFromResponse(payload));
  } catch {
    return redirect(request, "/entrar.html?erro=confirmacao");
  }
}

async function accountHandler(request, env, path) {
  if (path !== "/api/me" && path !== "/api/profile") return null;
  if (path === "/api/me" && request.method !== "GET") return response({ error: "Método não permitido." }, 405);
  if (path === "/api/profile" && request.method !== "PUT") return response({ error: "Método não permitido." }, 405);
  if (path === "/api/profile") assertSameOrigin(request);
  if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para usar sua conta.");

  const { user, cookies } = await requireUser(request, env);
  const account = await getWorkspace(env, user.id);
  if (!account) throw new AuthError(404, "Seu espaço ainda não foi preparado. Confirme o e-mail novamente ou entre em contato com o suporte.");
  if (path === "/api/me" && request.method === "GET") {
    return response({
      user: { id: user.id, email: user.email },
      workspace: { name: account.workspace_name },
      profile: { niche: account.niche, goals: JSON.parse(account.goals_json), voice: account.voice,
        completed: Boolean(account.onboarding_completed_at), ai_consent: Boolean(account.ai_data_consent_at) },
      trial: { status: account.trial_status, starts_at: account.trial_starts_at, ends_at: account.trial_ends_at }
    }, 200, cookies);
  }

  if (path === "/api/profile" && request.method === "PUT") {
    const profile = cleanProfileInput(await readJson(request));
    await saveProfile(env, user.id, profile);
    return response({ saved: true }, 200, cookies);
  }

  return response({ error: "Método não permitido." }, 405, cookies);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return response({ status: "ok", service: "nivel-creator-ai" });
      }

      const auth = await authHandler(request, env, url.pathname);
      if (auth) return auth;

      if (url.pathname === "/auth/callback") return await callbackHandler(request, env);

      const account = await accountHandler(request, env, url.pathname);
      if (account) return account;

      if (url.pathname === "/api/dashboard") {
        if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para acessar seu painel.");
        const { user, cookies } = await requireUser(request, env);
        const workspace = await getWorkspace(env, user.id);
        if (!workspace) throw new AuthError(404, "Seu espaço ainda não foi preparado.");
        const result = await dashboardHandler(request, env, url.pathname, workspace);
        if (result) return response(result, 200, cookies);
      }

      if (url.pathname.startsWith("/api/notifications")) {
        if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para acessar notificações.");
        const { user, cookies } = await requireUser(request, env);
        const workspace = await getWorkspace(env, user.id);
        if (!workspace) throw new AuthError(404, "Seu espaço ainda não foi preparado.");
        const result = await notificationHandler(request, env, url.pathname, workspace);
        if (result) return response(result, 200, cookies);
      }

      if (url.pathname.startsWith("/api/diagnostics")) {
        if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para acessar diagnósticos.");
        const { user, cookies } = await requireUser(request, env);
        const workspace = await getWorkspace(env, user.id);
        if (!workspace) throw new AuthError(404, "Seu espaço ainda não foi preparado.");
        const result = await diagnosticsHandler(request, env, url.pathname, workspace);
        if (result) return response(result, 200, cookies);
      }

      if (url.pathname.startsWith("/api/creative/") || url.pathname.startsWith("/api/calendar/") ||
          url.pathname.startsWith("/api/plans") ||
          url.pathname.startsWith("/api/agent/") || url.pathname.startsWith("/api/campaigns")) {
        if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para usar esta área.");
        const { user, cookies } = await requireUser(request, env);
        const workspace = await getWorkspace(env, user.id);
        if (!workspace) throw new AuthError(404, "Seu espaço ainda não foi preparado.");
        let result = await creativeHandler(request, env, url.pathname, workspace);
        if (!result) result = await calendarHandler(request, env, url.pathname, workspace);
        if (!result) result = await planningHandler(request, env, url.pathname, workspace);
        if (!result) result = await agentHandler(request, env, url.pathname, workspace);
        if (!result) result = await campaignsHandler(request, env, url.pathname, workspace);
        if (result) return response(result, 200, cookies);
      }

      if (url.pathname.startsWith("/api/")) return response({ error: "Rota não encontrada." }, 404);
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    } catch (error) {
      if (error instanceof AuthError) return response({ error: error.message }, error.status);
      if (error?.name === "TimeoutError" || error instanceof TypeError) {
        return response({ error: "Serviço temporariamente indisponível. Tente novamente." }, 503);
      }
      return response({ error: "Não foi possível concluir a solicitação." }, 500);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(notificationCronHandler(env));
  }
};
