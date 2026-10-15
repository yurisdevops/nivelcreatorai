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
import { accountDataHandler, processDeletionQueue } from "./account_data.js";
import { billingHandler, processAsaasQueue, receiveAsaasWebhook } from "./billing.js";
import { instagramCallback, instagramHandler, refreshInstagramTokens, syncInstagramInsights } from "./instagram.js";
import { filesHandler } from "./files.js";

const securityHeaders = {
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

const rateLimitedAuthPaths = new Set([
  "/api/auth/signup", "/api/auth/login", "/api/auth/recover", "/api/auth/password"
]);
const rateLimitedAiPaths = new Set([
  "/api/creative/generate", "/api/plans", "/api/plans/generate", "/api/agent/messages"
]);

async function enforceRateLimit(binding, key, description) {
  if (!binding) return;
  const { success } = await binding.limit({ key });
  if (!success) throw new AuthError(429, `Muitas solicitações para ${description}. Aguarde um minuto e tente novamente.`);
}

function response(body, status = 200, cookies = [], extraHeaders = {}) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
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
      trial: { status: account.trial_status, starts_at: account.trial_starts_at, ends_at: account.trial_ends_at },
      subscription: account.subscription_status ? { status: account.subscription_status,
        period_start: account.subscription_period_start, period_end: account.subscription_period_end,
        cancel_at_period_end: Boolean(account.cancel_at_period_end) } : null
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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/webhooks/asaas") {
        const webhook = await receiveAsaasWebhook(request, env);
        if (webhook.status === 200) ctx.waitUntil(processAsaasQueue(env));
        return webhook;
      }
      if (url.pathname === "/api/health" && request.method === "GET") {
        return response({ status: "ok", service: "nivel-creator-ai" });
      }

      if (request.method === "POST" && rateLimitedAuthPaths.has(url.pathname)) {
        const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
        await enforceRateLimit(env.AUTH_RATE_LIMITER, `${url.pathname}:${clientIp}`, "esta ação de acesso");
      }

      const auth = await authHandler(request, env, url.pathname);
      if (auth) return auth;

      if (url.pathname === "/auth/callback") return await callbackHandler(request, env);
      if (url.pathname === "/auth/instagram/callback") return await instagramCallback(request, env);

      const account = await accountHandler(request, env, url.pathname);
      if (account) return account;

      if (url.pathname.startsWith("/api/account/")) {
        if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para acessar os dados da conta.");
        const { user, cookies } = await requireUser(request, env);
        const workspace = await getWorkspace(env, user.id);
        if (!workspace) throw new AuthError(404, "Seu espaço não foi encontrado.");
        const result = await accountDataHandler(request, env, url.pathname, workspace);
        if (result?.export) return response(result.export, 200, cookies, {
          "content-disposition": `attachment; filename="nivel-creator-ai-export-${new Date().toISOString().slice(0, 10)}.json"`
        });
        if (result?.created !== undefined) return response(result, result.created ? 202 : 200,
          result.created ? clearSessionCookies() : cookies);
        if (result) return response(result, 200, cookies);
      }

      if (url.pathname.startsWith("/api/billing/")) {
        if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para acessar cobrança.");
        const { user, cookies } = await requireUser(request, env);
        const workspace = await getWorkspace(env, user.id);
        if (!workspace) throw new AuthError(404, "Seu espaço não foi encontrado.");
        const result = await billingHandler(request, env, url.pathname, workspace);
        if (result) return response(result, 200, cookies);
      }

      if (url.pathname.startsWith("/api/instagram/")) {
        if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para acessar sua conexão do Instagram.");
        const { user, cookies } = await requireUser(request, env);
        const workspace = await getWorkspace(env, user.id);
        if (!workspace) throw new AuthError(404, "Seu espaço não foi encontrado.");
        const result = await instagramHandler(request, env, url.pathname, workspace);
        if (result) return response(result, 200, cookies);
      }

      if (url.pathname.startsWith("/api/files")) {
        if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para acessar sua biblioteca.");
        const { user, cookies } = await requireUser(request, env);
        const workspace = await getWorkspace(env, user.id);
        if (!workspace) throw new AuthError(404, "Seu espaço não foi encontrado.");
        const result = await filesHandler(request, env, url.pathname, workspace);
        if (result instanceof Response) {
          const headers = new Headers(result.headers);
          for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
          for (const cookie of cookies) headers.append("set-cookie", cookie);
          return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
        }
        if (result) return response(result, 200, cookies);
      }

      if (url.pathname === "/api/dashboard" || url.pathname === "/api/results") {
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
        if (request.method === "POST" && rateLimitedAiPaths.has(url.pathname)) {
          await enforceRateLimit(env.AI_RATE_LIMITER, `${workspace.workspace_id}:${url.pathname}`, "geração de IA neste espaço");
        }
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
        if (request.method === "POST" && rateLimitedAiPaths.has(url.pathname)) {
          await enforceRateLimit(env.AI_RATE_LIMITER, `${workspace.workspace_id}:${url.pathname}`, "geração de IA neste espaço");
        }
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
    ctx.waitUntil(Promise.all([notificationCronHandler(env), processDeletionQueue(env), processAsaasQueue(env),
      refreshInstagramTokens(env), syncInstagramInsights(env)]));
  }
};
