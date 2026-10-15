import { AuthError, assertSameOrigin, readJson } from "./auth.js";

async function createTrialReminders(db) {
  const statements = [
    db.prepare(`INSERT INTO notifications (id, workspace_id, kind, content_json, dedupe_key)
      SELECT 'trial-reminder-48h:' || t.workspace_id, t.workspace_id, 'trial_ending',
        json_object('title', 'Seu período de teste termina em breve',
          'body', 'Seu trial termina nas próximas 24 a 48 horas. Consulte o acesso e as opções da sua conta.',
          'action_url', '/#configuracoes'),
        'trial-reminder-48h:' || t.workspace_id
      FROM trials t LEFT JOIN notification_preferences p ON p.workspace_id=t.workspace_id
      WHERE t.status='trialing' AND julianday(t.ends_at) > julianday('now','+24 hours')
        AND julianday(t.ends_at) <= julianday('now','+48 hours') AND COALESCE(p.in_app_enabled,1)=1
      ON CONFLICT DO NOTHING`),
    db.prepare(`INSERT INTO notifications (id, workspace_id, kind, content_json, dedupe_key)
      SELECT 'trial-reminder-24h:' || t.workspace_id, t.workspace_id, 'trial_ending',
        json_object('title', 'Seu período de teste termina em até 24 horas',
          'body', 'Revise seu acesso e suas opções de conta antes do fim do trial. Não haverá cobrança automática sem uma assinatura confirmada.',
          'action_url', '/#configuracoes'),
        'trial-reminder-24h:' || t.workspace_id
      FROM trials t LEFT JOIN notification_preferences p ON p.workspace_id=t.workspace_id
      WHERE t.status='trialing' AND julianday(t.ends_at) > julianday('now')
        AND julianday(t.ends_at) <= julianday('now','+24 hours') AND COALESCE(p.in_app_enabled,1)=1
      ON CONFLICT DO NOTHING`)
  ];
  await db.batch(statements);
}

export async function notificationCronHandler(env) {
  if (!env.DB) return;
  await createTrialReminders(env.DB);
}

export async function notificationHandler(request, env, path, account) {
  const db = env.DB;
  if (!db) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
  const workspaceId = account.workspace_id;
  if (path === "/api/notifications" && request.method === "GET") {
    const [notifications, preferences, unread] = await Promise.all([
      db.prepare(`SELECT id, kind, content_json, read_at, created_at FROM notifications
        WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 30`).bind(workspaceId).all(),
      db.prepare(`SELECT in_app_enabled, email_enabled FROM notification_preferences WHERE workspace_id=?1`).bind(workspaceId).first(),
      db.prepare(`SELECT COUNT(*) AS count FROM notifications WHERE workspace_id=?1 AND read_at IS NULL`).bind(workspaceId).first()
    ]);
    return {
      notifications: (notifications.results || []).map((row) => ({ ...row, content: JSON.parse(row.content_json) })),
      unread_count: unread?.count || 0,
      preferences: { in_app_enabled: preferences ? Boolean(preferences.in_app_enabled) : true, email_enabled: false }
    };
  }
  if (path === "/api/notifications/read-all" && request.method === "POST") {
    assertSameOrigin(request);
    await readJson(request);
    await db.prepare(`UPDATE notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE workspace_id=?1 AND read_at IS NULL`).bind(workspaceId).run();
    return { saved: true };
  }
  if (path === "/api/notifications/preferences" && request.method === "GET") {
    const preferences = await db.prepare(`SELECT in_app_enabled FROM notification_preferences WHERE workspace_id=?1`).bind(workspaceId).first();
    return { in_app_enabled: preferences ? Boolean(preferences.in_app_enabled) : true, email_enabled: false, email_available: false };
  }
  if (path === "/api/notifications/preferences" && request.method === "PUT") {
    assertSameOrigin(request);
    const body = await readJson(request);
    if (typeof body.in_app_enabled !== "boolean") throw new AuthError(400, "Informe se deseja receber notificações internas.");
    await db.prepare(`INSERT INTO notification_preferences (workspace_id, in_app_enabled, email_enabled)
      VALUES (?1, ?2, 0) ON CONFLICT(workspace_id) DO UPDATE SET
        in_app_enabled=excluded.in_app_enabled, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(workspaceId, body.in_app_enabled ? 1 : 0).run();
    return { saved: true, in_app_enabled: body.in_app_enabled };
  }
  const match = path.match(/^\/api\/notifications\/([A-Za-z0-9:_-]{1,160})\/read$/);
  if (match && request.method === "PUT") {
    assertSameOrigin(request);
    await readJson(request);
    const result = await db.prepare(`UPDATE notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=?1 AND workspace_id=?2 AND read_at IS NULL`).bind(match[1], workspaceId).run();
    if (!result.meta?.changes) {
      const exists = await db.prepare("SELECT id FROM notifications WHERE id=?1 AND workspace_id=?2").bind(match[1], workspaceId).first();
      if (!exists) throw new AuthError(404, "Notificação não encontrada.");
    }
    return { saved: true };
  }
  if (path.startsWith("/api/notifications")) throw new AuthError(405, "Rota ou método não disponível.");
  return null;
}
