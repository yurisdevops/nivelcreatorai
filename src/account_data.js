import { AuthError, assertSameOrigin, readJson } from "./auth.js";

function database(env) {
  if (!env.DB) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
  return env.DB;
}

async function exportWorkspace(env, account) {
  const db = database(env);
  const id = account.workspace_id;
  const [user, workspace, profile, trial, subscription, instagram, metrics, scripts, strategies,
    campaigns, files, calendar, plans, conversations, notifications] = await Promise.all([
    db.prepare("SELECT email, email_verified_at, created_at FROM users WHERE auth_subject=?1").bind(account.auth_subject).first(),
    db.prepare("SELECT name, created_at FROM workspaces WHERE id=?1").bind(id).first(),
    db.prepare(`SELECT niche, goals_json, voice, onboarding_completed_at, ai_data_consent_at, ai_data_consent_version, updated_at
      FROM creator_profiles WHERE workspace_id=?1`).bind(id).first(),
    db.prepare("SELECT starts_at, ends_at, status FROM trials WHERE workspace_id=?1").bind(id).first(),
    db.prepare(`SELECT status, period_start, period_end, cancel_at_period_end FROM subscriptions WHERE workspace_id=?1`).bind(id).first(),
    db.prepare(`SELECT meta_account_id, username, account_type, expires_at, status, consent_at, consent_version, last_sync_at, last_error, created_at
      FROM instagram_connections WHERE workspace_id=?1`).bind(id).first(),
    db.prepare(`SELECT metric, period_start, period_end, value, source, fetched_at, availability FROM metric_snapshots
      WHERE workspace_id=?1 ORDER BY fetched_at DESC LIMIT 5000`).bind(id).all(),
    db.prepare(`SELECT id, version, status, content_json, created_at, updated_at FROM scripts
      WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 2000`).bind(id).all(),
    db.prepare(`SELECT id, evidence_json, hypothesis, recommendations_json, created_at FROM strategies
      WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 1000`).bind(id).all(),
    db.prepare(`SELECT id, brand_name, brief_json, status, due_at, created_at, updated_at FROM campaigns
      WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 2000`).bind(id).all(),
    db.prepare(`SELECT id, display_name, content_type, byte_size, sha256, created_at, expires_at FROM files
      WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 2000`).bind(id).all(),
    db.prepare(`SELECT id, script_id, title, format, scheduled_at, status, notes, created_at, updated_at FROM calendar_events
      WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 2000`).bind(id).all(),
    db.prepare(`SELECT id, title, objective, start_date, end_date, items_json, created_at FROM editorial_plans
      WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 500`).bind(id).all(),
    db.prepare(`SELECT role, content, created_at FROM agent_messages
      WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 5000`).bind(id).all(),
    db.prepare(`SELECT kind, content_json, read_at, created_at FROM notifications
      WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 1000`).bind(id).all()
  ]);
  return {
    exported_at: new Date().toISOString(),
    product: "Nivel Creator AI",
    account: user,
    workspace,
    profile: profile ? { ...profile, goals: safeJson(profile.goals_json, []) } : null,
    trial,
    subscription,
    instagram_connection: instagram,
    metric_snapshots: metrics.results || [],
    scripts: (scripts.results || []).map((row) => ({ ...row, content: safeJson(row.content_json, null) })),
    strategies: (strategies.results || []).map((row) => ({ ...row, evidence: safeJson(row.evidence_json, []), recommendations: safeJson(row.recommendations_json, {}) })),
    campaigns: (campaigns.results || []).map((row) => ({ ...row, brief: safeJson(row.brief_json, {}) })),
    files_metadata: files.results || [],
    calendar_events: calendar.results || [],
    editorial_plans: (plans.results || []).map((row) => ({ ...row, items: safeJson(row.items_json, []) })),
    agent_messages: conversations.results || [],
    notifications: (notifications.results || []).map((row) => ({ ...row, content: safeJson(row.content_json, {}) })),
    limits: { note: "A exportação tem limites por coleção; a Biblioteca inclui até 2.000 itens por arquivo de dados. Os objetos R2 são exportados como metadados; baixe cada conteúdo na própria Biblioteca." }
  };
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

async function requestDeletion(env, account, body) {
  if (!env.SUPABASE_SECRET_KEY) throw new AuthError(503, "A exclusão automática ainda não está configurada neste ambiente.");
  if (body.confirmation !== "EXCLUIR") throw new AuthError(400, "Digite EXCLUIR para confirmar a solicitação.");
  const db = database(env);
  const existing = await db.prepare(`SELECT id, requested_at, scheduled_for, status FROM deletion_requests
    WHERE workspace_id=?1 AND status IN ('pending','processing') ORDER BY requested_at DESC LIMIT 1`).bind(account.workspace_id).first();
  if (existing) return { request: existing, created: false };
  const id = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(`INSERT INTO deletion_requests (id, workspace_id, requested_at, scheduled_for, status)
      VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'pending')`)
      .bind(id, account.workspace_id),
    db.prepare(`INSERT INTO deletion_ledger (id, requested_at, status)
      VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'pending')`).bind(id)
  ]);
  if (result.some((item) => !item.meta?.changes)) throw new AuthError(503, "Não foi possível registrar a solicitação.");
  return { request: { id, status: "pending" }, created: true };
}

async function deleteAuthUser(env, userId) {
  const base = new URL(env.SUPABASE_URL);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if ((base.protocol !== "https:" && !localHosts.has(base.hostname)) || !env.SUPABASE_SECRET_KEY) {
    throw new Error("admin_config");
  }
  const result = await fetch(`${base.origin}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    redirect: "error", signal: AbortSignal.timeout(10000)
  });
  if (result.ok || result.status === 404) return;
  throw new Error(`auth_${result.status}`);
}

async function deleteWorkspaceFiles(env, workspaceId) {
  const { results } = await env.DB.prepare("SELECT r2_key FROM files WHERE workspace_id=?1").bind(workspaceId).all();
  if (!results?.length) return;
  if (!env.FILES) throw new Error("storage_config");
  for (const file of results) await env.FILES.delete(file.r2_key);
}

export async function processDeletionQueue(env) {
  if (!env.DB || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return;
  const { results } = await env.DB.prepare(`SELECT d.id, d.workspace_id, u.id AS user_id
    FROM deletion_requests d JOIN workspaces w ON w.id=d.workspace_id
    JOIN users u ON u.id=w.owner_id
    WHERE d.status='pending' AND d.scheduled_for<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    ORDER BY d.requested_at LIMIT 5`).all();
  for (const request of results || []) {
    try {
      await deleteWorkspaceFiles(env, request.workspace_id);
      await deleteAuthUser(env, request.user_id);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM workspaces WHERE id=?1").bind(request.workspace_id),
        env.DB.prepare("DELETE FROM users WHERE id=?1").bind(request.user_id),
        env.DB.prepare(`UPDATE deletion_ledger SET status='completed', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1`).bind(request.id)
      ]);
    } catch (error) {
      const code = typeof error?.message === "string" && /^auth_\d{3}$/.test(error.message) ? error.message : "temporary_failure";
      await env.DB.prepare(`UPDATE deletion_requests SET attempt_count=attempt_count+1, last_attempt_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?1 AND status='pending'`).bind(request.id).run();
      await env.DB.prepare(`UPDATE deletion_ledger SET status='pending' WHERE id=?1`).bind(request.id).run();
      // The failure code is deliberately not persisted with account content or provider response bodies.
      if (code === "admin_config") continue;
    }
  }
}

export async function accountDataHandler(request, env, path, account) {
  if (path === "/api/account/export" && request.method === "GET") return { export: await exportWorkspace(env, account) };
  if (path === "/api/account/deletion" && request.method === "GET") {
    const row = await database(env).prepare(`SELECT id, requested_at, scheduled_for, status, attempt_count
      FROM deletion_requests WHERE workspace_id=?1 ORDER BY requested_at DESC LIMIT 1`).bind(account.workspace_id).first();
    return { deletion_request: row || null };
  }
  if (path === "/api/account/deletion" && request.method === "POST") {
    assertSameOrigin(request);
    return requestDeletion(env, account, await readJson(request));
  }
  if (path.startsWith("/api/account/")) throw new AuthError(405, "Rota ou método não disponível.");
  return null;
}
