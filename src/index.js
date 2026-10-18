import {
  AuthError, accessTokenFromRequest, assertSameOrigin, authConfigured, authResponseError,
  clearSessionCookies, hasSessionCookie, readJson, requireUser, requiresAdminMfa, sessionFromResponse, signIn, signOut,
  signUp, validCredentials, verifyEmail, recoverPassword, updatePassword,
  enrollTotp, challengeTotp, verifyTotp, removeTotp, verifiedTotpFactors, allTotpFactors
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
import { billingHandler, processAsaasQueue, receiveAsaasWebhook, reconcileAsaasSubscriptions } from "./billing.js";
import { instagramCallback, instagramHandler, refreshInstagramTokens, syncInstagramInsights } from "./instagram.js";
import { filesHandler } from "./files.js";
import { assertBetaApproved, waitlistHandler } from "./waitlist.js";

const securityHeaders = {
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

const rateLimitedAuthPaths = new Set([
  "/api/auth/signup", "/api/auth/login", "/api/auth/recover", "/api/auth/password",
  "/api/auth/mfa/verify-login", "/api/auth/mfa/verify-enrollment", "/api/waitlist"
]);
const rateLimitedAiPaths = new Set([
  "/api/creative/generate", "/api/creative/ideas", "/api/plans", "/api/plans/generate", "/api/agent/messages"
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

function providerError(status) {
  if (status === 429) throw authResponseError(429);
  if (status >= 500) throw authResponseError(status);
  throw new AuthError(400, "Não foi possível concluir a configuração do autenticador. Confira o código e tente novamente.");
}

async function mfaHandler(request, env, path) {
  if (!path.startsWith("/api/auth/mfa/")) return null;
  if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para gerenciar a autenticação adicional.");

  if (path === "/api/auth/mfa/status" && request.method === "GET") {
    const session = await requireUser(request, env, { allowMfaPending: true });
    const factors = session.verifiedFactors || await verifiedTotpFactors(env, session.accessToken);
    const allFactors = session.mfaFactors || await allTotpFactors(env, session.accessToken);
    return response({ enabled: factors.length > 0, required: factors.length > 0 && session.assuranceLevel !== "aal2",
      admin_mfa_required: session.adminMfaRequired,
      enroll_required: session.adminMfaRequired && factors.length === 0,
      factors: factors.map(({ id, friendly_name, created_at }) => ({ id, friendly_name, created_at })),
      pending: allFactors.filter((factor) => factor.status !== "verified").map(({ id, friendly_name, created_at }) => ({ id, friendly_name, created_at })) }, 200, session.cookies);
  }

  if (path === "/api/auth/mfa/enroll" && request.method === "POST") {
    assertSameOrigin(request);
    const body = await readJson(request);
    const session = await requireUser(request, env, { allowMfaPending: true });
    const factors = session.verifiedFactors || [];
    if (factors.length && session.assuranceLevel !== "aal2") throw new AuthError(403, "Confirme o código atual antes de alterar seus fatores.", "mfa_required");
    const friendlyName = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "Autenticador";
    const result = await enrollTotp(env, session.accessToken, friendlyName || "Autenticador");
    if (!result.ok) providerError(result.status);
    const factor = await result.json();
    if (factor.type !== "totp" || typeof factor.id !== "string" || typeof factor.totp?.secret !== "string" || typeof factor.totp?.qr_code !== "string") {
      throw new AuthError(502, "O Supabase não retornou os dados esperados para configurar o autenticador.");
    }
    return response({ factor: { id: factor.id, friendly_name: factor.friendly_name, qr_code: factor.totp.qr_code,
      secret: factor.totp.secret, uri: factor.totp.uri } }, 200, session.cookies);
  }

  if ((path === "/api/auth/mfa/verify-login" || path === "/api/auth/mfa/verify-enrollment") && request.method === "POST") {
    assertSameOrigin(request);
    const body = await readJson(request);
    const session = await requireUser(request, env, { allowMfaPending: true });
    const factorId = typeof body.factor_id === "string" ? body.factor_id : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(factorId) || !/^\d{6,8}$/.test(code)) throw new AuthError(400, "Informe o código de 6 a 8 dígitos do autenticador.");
    const factors = session.verifiedFactors || [];
    const enrollment = path.endsWith("verify-enrollment");
    if (enrollment ? factors.length > 0 && session.assuranceLevel !== "aal2" : !factors.some((factor) => factor.id === factorId)) {
      throw new AuthError(403, "Este autenticador não está disponível para esta sessão.");
    }
    const challenge = await challengeTotp(env, session.accessToken, factorId);
    if (!challenge.ok) providerError(challenge.status);
    const challengeData = await challenge.json();
    if (typeof challengeData.id !== "string") throw new AuthError(502, "Não foi possível iniciar a verificação do autenticador.");
    const verified = await verifyTotp(env, session.accessToken, factorId, challengeData.id, code);
    if (!verified.ok) providerError(verified.status);
    const result = await verified.json();
    if (!result.access_token || !result.refresh_token) throw new AuthError(502, "O Supabase não retornou uma sessão autenticada.");
    return response({ ok: true }, 200, sessionFromResponse(result));
  }

  const factorMatch = path.match(/^\/api\/auth\/mfa\/factors\/([0-9a-f-]{36})$/i);
  if (factorMatch && request.method === "DELETE") {
    assertSameOrigin(request);
    const session = await requireUser(request, env, { allowMfaPending: true });
    const factor = (session.mfaFactors || []).find((item) => item.id === factorMatch[1]);
    if (!factor) throw new AuthError(404, "Autenticador não encontrado.");
    if (factor.status === "verified" && session.assuranceLevel !== "aal2") {
      throw new AuthError(403, "Confirme o código atual antes de alterar seus fatores.", "mfa_required");
    }
    if (session.adminMfaRequired && factor.status === "verified" && (session.verifiedFactors || []).length <= 1) {
      throw new AuthError(409, "Administradores precisam manter pelo menos um autenticador ativo.", "mfa_last_factor_required");
    }
    const result = await removeTotp(env, session.accessToken, factorMatch[1]);
    if (!result.ok) providerError(result.status);
    return response({ removed: true }, 200, session.cookies);
  }

  return null;
}

async function authHandler(request, env, path) {
  if (path === "/api/auth/status" && request.method === "GET") {
    return response({ configured: isProviderConfigured(env), auth_configured: authConfigured(env), database_configured: Boolean(env.DB) });
  }

  if (path === "/api/auth/signup" && request.method === "POST") {
    if (!isProviderConfigured(env)) throw new AuthError(503, "Configure Supabase Auth e D1 para ativar o cadastro.");
    assertSameOrigin(request);
    const credentials = validCredentials(await readJson(request));
    await assertBetaApproved(env, credentials.email);
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
    const factors = await verifiedTotpFactors(env, payload.access_token);
    const adminMfaRequired = await requiresAdminMfa(env, payload.user.id);
    return response({ ok: true, mfa_required: factors.length > 0,
      mfa_setup_required: adminMfaRequired && factors.length === 0,
      factors: factors.map(({ id, friendly_name }) => ({ id, friendly_name })) },
      200, sessionFromResponse(payload));
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
  const account = await getWorkspace(env, user.id) || await ensureWorkspace(env, user);
  if (!account) throw new AuthError(404, "Seu espaço ainda não foi preparado. Confirme o e-mail novamente ou entre em contato com o suporte.");
  if (path === "/api/me" && request.method === "GET") {
    return response({
      user: { id: user.id, email: user.email },
      workspace: { name: account.workspace_name },
      profile: { niche: account.niche, goals: JSON.parse(account.goals_json), voice: account.voice,
        completed: Boolean(account.onboarding_completed_at), ai_consent: Boolean(account.ai_data_consent_at) },
      data_retention: { automatic_purge_enabled: env.DATA_RETENTION_ENABLED === "true" &&
        Boolean(env.DB && env.FILES && env.SUPABASE_URL && env.SUPABASE_SECRET_KEY), retention_days: 30 },
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
      if (request.method === "POST" && ["/api/auth/mfa/verify-login", "/api/auth/mfa/verify-enrollment"].includes(url.pathname)) {
        const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
        await enforceRateLimit(env.MFA_RATE_LIMITER, `${url.pathname}:${clientIp}`, "a verificação do autenticador");
      }

      const waitlist = await waitlistHandler(request, env, url.pathname);
      if (waitlist) return response(waitlist);

      const auth = await authHandler(request, env, url.pathname);
      if (auth) return auth;

      const mfa = await mfaHandler(request, env, url.pathname);
      if (mfa) return mfa;

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
        if (request.method === "POST" && (rateLimitedAiPaths.has(url.pathname) || /^\/api\/campaigns\/[^/]+\/checklist$/.test(url.pathname))) {
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
      // Without a session the app shell would flash before the client redirects, so send visitors to sign-in first.
      if ((url.pathname === "/" || url.pathname === "/index.html") && request.method === "GET" && !hasSessionCookie(request)) {
        return redirect(request, "/entrar?redirect=%2F");
      }
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    } catch (error) {
      if (error instanceof AuthError) return response({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
      if (error?.name === "TimeoutError" || error instanceof TypeError) {
        return response({ error: "Serviço temporariamente indisponível. Tente novamente." }, 503);
      }
      return response({ error: "Não foi possível concluir a solicitação." }, 500);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([notificationCronHandler(env), processDeletionQueue(env), processAsaasQueue(env),
      reconcileAsaasSubscriptions(env),
      refreshInstagramTokens(env), syncInstagramInsights(env)]));
  }
};
