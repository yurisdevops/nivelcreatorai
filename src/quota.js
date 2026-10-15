import { AuthError } from "./auth.js";

export async function resolveEntitlement(env, workspaceId, requireActive = true) {
  const row = await env.DB.prepare(`SELECT t.starts_at AS trial_start, t.ends_at AS trial_end, t.status AS trial_status,
      s.period_start, s.period_end, s.status AS subscription_status
    FROM trials t
    LEFT JOIN subscriptions s ON s.workspace_id=t.workspace_id
    WHERE t.workspace_id=?1 LIMIT 1`).bind(workspaceId).first();
  if (!row) {
    if (requireActive) throw new AuthError(402, "Seu acesso ainda não está ativo.");
    return null;
  }
  const now = Date.now();
  if (row.trial_status === "trialing" && Date.parse(row.trial_end) > now) {
    return { cycleKey: `trial:${row.trial_start}`, limit: 10, plan: "trial" };
  }
  if (["active", "canceled"].includes(row.subscription_status) && Date.parse(row.period_end || "") > now) {
    const start = row.period_start || row.period_end;
    return { cycleKey: `subscription:${start}`, limit: 60, plan: "paid" };
  }
  if (requireActive) throw new AuthError(402, "Seu período de acesso terminou. Consulte as opções de assinatura para continuar.");
  return null;
}

export async function reserveQuota(env, workspaceId, entitlement, operation, limit = entitlement.limit) {
  const id = crypto.randomUUID();
  const db = env.DB;
  await db.prepare(`UPDATE quota_reservations SET status='released'
    WHERE workspace_id=?1 AND operation=?2 AND status='reserved'
      AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes')`)
    .bind(workspaceId, operation).run();
  const result = await db.prepare(`INSERT INTO quota_reservations (id, workspace_id, cycle_key, operation, status)
    SELECT ?1, ?2, ?3, ?4, 'reserved'
    WHERE (SELECT COUNT(*) FROM ai_usage_events
      WHERE workspace_id=?2 AND cycle_key=?3 AND operation=?4)
      + (SELECT COUNT(*) FROM quota_reservations
      WHERE workspace_id=?2 AND cycle_key=?3 AND operation=?4 AND status='reserved') < ?5`)
    .bind(id, workspaceId, entitlement.cycleKey, operation, limit).run();
  if (!result.meta?.changes) throw new AuthError(429, "Você chegou ao limite deste recurso neste período.");
  return id;
}

export async function releaseQuotaReservation(env, reservationId) {
  await env.DB.prepare(`UPDATE quota_reservations SET status='released'
    WHERE id=?1 AND status='reserved'`).bind(reservationId).run();
}

export async function quotaCounts(env, workspaceId, entitlement, operation) {
  const [used, reserved] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM ai_usage_events WHERE workspace_id=?1 AND cycle_key=?2 AND operation=?3`)
      .bind(workspaceId, entitlement.cycleKey, operation).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM quota_reservations WHERE workspace_id=?1 AND cycle_key=?2 AND operation=?3 AND status='reserved'`)
      .bind(workspaceId, entitlement.cycleKey, operation).first()
  ]);
  return { used: used.count, reserved: reserved.count };
}
