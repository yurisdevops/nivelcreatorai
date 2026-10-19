import { AuthError, assertSameOrigin, readJson } from "./auth.js";
import { pushConfigured, sendPush } from "./webpush.js";

const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function notificationEmailAvailable(env) {
  const sender = String(env.EMAIL_FROM_ADDRESS || "");
  return Boolean(env.EMAIL && sender.length <= 254 && emailAddressPattern.test(sender));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function renderNotificationEmail(kind, contentJson) {
  if (kind !== "trial_ending") return null;
  let content;
  try { content = JSON.parse(contentJson); } catch { return null; }
  if (typeof content.title !== "string" || typeof content.body !== "string") return null;
  const title = content.title.slice(0, 160);
  const body = content.body.slice(0, 1000);
  return {
    subject: title,
    text: `${title}\n\n${body}\n\nAcesse sua conta do Nivel Creator AI para revisar suas opções.`,
    html: `<main style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;padding:24px;color:#18213d"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(body)}</p><p style="font-size:14px;color:#58627d">Acesse sua conta do Nivel Creator AI para revisar suas opções.</p></main>`
  };
}

async function createTrialReminders(db) {
  const statements = [
    db.prepare(`INSERT INTO notifications (id, workspace_id, kind, content_json, dedupe_key, email_status)
      SELECT 'trial-reminder-48h:' || t.workspace_id, t.workspace_id, 'trial_ending',
        json_object('title', 'Seu período de teste termina em breve',
          'body', 'Seu trial termina nas próximas 24 a 48 horas. Consulte o acesso e as opções da sua conta.',
          'action_url', '/#configuracoes'),
        'trial-reminder-48h:' || t.workspace_id,
        CASE WHEN COALESCE(p.email_enabled,0)=1 THEN 'pending' ELSE 'not_requested' END
      FROM trials t LEFT JOIN notification_preferences p ON p.workspace_id=t.workspace_id
      WHERE t.status='trialing' AND julianday(t.ends_at) > julianday('now','+24 hours')
        AND julianday(t.ends_at) <= julianday('now','+48 hours')
        AND (COALESCE(p.in_app_enabled,1)=1 OR COALESCE(p.email_enabled,0)=1)
      ON CONFLICT DO NOTHING`),
    db.prepare(`INSERT INTO notifications (id, workspace_id, kind, content_json, dedupe_key, email_status)
      SELECT 'trial-reminder-24h:' || t.workspace_id, t.workspace_id, 'trial_ending',
        json_object('title', 'Seu período de teste termina em até 24 horas',
          'body', 'Revise seu acesso e suas opções de conta antes do fim do trial. Não haverá cobrança automática sem uma assinatura confirmada.',
          'action_url', '/#configuracoes'),
        'trial-reminder-24h:' || t.workspace_id,
        CASE WHEN COALESCE(p.email_enabled,0)=1 THEN 'pending' ELSE 'not_requested' END
      FROM trials t LEFT JOIN notification_preferences p ON p.workspace_id=t.workspace_id
      WHERE t.status='trialing' AND julianday(t.ends_at) > julianday('now')
        AND julianday(t.ends_at) <= julianday('now','+24 hours')
        AND (COALESCE(p.in_app_enabled,1)=1 OR COALESCE(p.email_enabled,0)=1)
      ON CONFLICT DO NOTHING`)
  ];
  await db.batch(statements);
}

async function deliverTrialReminderEmails(env) {
  if (!notificationEmailAvailable(env) || !env.DB) return;
  const now = new Date().toISOString();
  const rows = await env.DB.prepare(`SELECT n.id, n.workspace_id, n.kind, n.content_json, u.email
    FROM notifications n
    JOIN notification_preferences p ON p.workspace_id=n.workspace_id AND p.email_enabled=1
    JOIN workspaces w ON w.id=n.workspace_id
    JOIN users u ON u.id=w.owner_id AND u.email_verified_at IS NOT NULL
    WHERE n.kind='trial_ending' AND n.created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')
      AND ((n.email_status='pending' AND COALESCE(n.email_next_attempt_at,'')<=?1)
        OR (n.email_status='sending' AND n.email_lease_until<=?1))
    ORDER BY n.created_at LIMIT 10`).bind(now).all();

  for (const row of rows.results || []) {
    const claim = await env.DB.prepare(`UPDATE notifications SET email_status='sending',
      email_attempts=email_attempts+1, email_lease_until=?2, email_next_attempt_at=NULL
      WHERE id=?1 AND ((email_status='pending' AND COALESCE(email_next_attempt_at,'')<=?3)
        OR (email_status='sending' AND email_lease_until<=?3))
        AND EXISTS (SELECT 1 FROM notification_preferences p WHERE p.workspace_id=notifications.workspace_id AND p.email_enabled=1)
      RETURNING email_attempts`).bind(row.id, new Date(Date.now() + 10 * 60 * 1000).toISOString(), now).first();
    if (!claim) continue;
    const message = renderNotificationEmail(row.kind, row.content_json);
    if (!message) {
      await env.DB.prepare(`UPDATE notifications SET email_status='failed', email_lease_until=NULL WHERE id=?1`).bind(row.id).run();
      continue;
    }
    try {
      await env.EMAIL.send({
        to: row.email,
        from: { email: env.EMAIL_FROM_ADDRESS, name: env.EMAIL_FROM_NAME || "Nivel Creator AI" },
        ...message
      });
      await env.DB.prepare(`UPDATE notifications SET email_status='sent', email_sent_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        email_lease_until=NULL, email_next_attempt_at=NULL WHERE id=?1 AND email_status='sending'`).bind(row.id).run();
    } catch {
      const attempts = Number(claim.email_attempts) || 1;
      const retryAt = new Date(Date.now() + Math.min(60, 5 * (2 ** attempts)) * 60 * 1000).toISOString();
      await env.DB.prepare(`UPDATE notifications SET email_status=?2, email_next_attempt_at=?3,
        email_lease_until=NULL WHERE id=?1 AND email_status='sending'`)
        .bind(row.id, attempts >= 5 ? 'failed' : 'pending', retryAt).run();
    }
  }
}


// Brazil has no daylight saving time, so UTC-3 is a stable local clock for reminders.
function brazilDate(offsetDays = 0) {
  const now = new Date(Date.now() - 3 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return now.toISOString().slice(0, 10);
}

async function createWorkReminders(db) {
  const today = brazilDate();
  const tomorrow = brazilDate(1);
  const hourBrazil = new Date(Date.now() - 3 * 3600 * 1000).getUTCHours();
  const statements = [
    db.prepare(`INSERT INTO notifications (id, workspace_id, kind, content_json, dedupe_key)
      SELECT 'campaign-due:' || c.id || ':' || c.due_at, c.workspace_id, 'campaign_due',
        json_object('title', CASE WHEN c.due_at=?1 THEN 'Entrega hoje: ' ELSE 'Entrega amanhã: ' END || c.brand_name,
          'body', COALESCE(json_extract(c.brief_json, '$.title'), c.brand_name) || ' tem prazo ' ||
            CASE WHEN c.due_at=?1 THEN 'hoje' ELSE 'amanhã' END || '. Confira os entregáveis que faltam.',
          'action_url', '/#campanhas'),
        'campaign-due:' || c.id || ':' || c.due_at
      FROM campaigns c LEFT JOIN notification_preferences p ON p.workspace_id=c.workspace_id
      WHERE c.status IN ('draft','submitted','negotiation','in_progress') AND c.due_at IN (?1, ?2)
        AND COALESCE(p.in_app_enabled,1)=1
      ON CONFLICT DO NOTHING`).bind(today, tomorrow)
  ];
  if (hourBrazil >= 8) {
    statements.push(db.prepare(`INSERT INTO notifications (id, workspace_id, kind, content_json, dedupe_key)
      SELECT 'content-today:' || e.workspace_id || ':' || ?1, e.workspace_id, 'content_today',
        json_object('title', 'Conteúdos de hoje',
          'body', CASE WHEN COUNT(*)=1 THEN 'Você tem 1 conteúdo planejado para hoje: ' || MIN(e.title) || '.'
            ELSE 'Você tem ' || COUNT(*) || ' conteúdos planejados para hoje. Bora gravar!' END,
          'action_url', '/#planejamento'),
        'content-today:' || e.workspace_id || ':' || ?1
      FROM calendar_events e LEFT JOIN notification_preferences p ON p.workspace_id=e.workspace_id
      WHERE e.status <> 'published' AND date(e.scheduled_at, '-3 hours') = ?1 AND COALESCE(p.in_app_enabled,1)=1
      GROUP BY e.workspace_id
      ON CONFLICT DO NOTHING`).bind(today));
  }
  await db.batch(statements);
}

async function deliverPushNotifications(env) {
  if (!pushConfigured(env)) return;
  const { results } = await env.DB.prepare(`SELECT n.id, n.workspace_id, n.content_json FROM notifications n
    WHERE n.push_sent_at IS NULL AND julianday(n.created_at) >= julianday('now','-2 days')
      AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.workspace_id=n.workspace_id)
    ORDER BY n.created_at LIMIT 50`).all();
  for (const row of results || []) {
    // Mark first so a slow or failing push service never sends the same reminder twice.
    const claimed = await env.DB.prepare(`UPDATE notifications SET push_sent_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=?1 AND push_sent_at IS NULL`).bind(row.id).run();
    if (!claimed.meta?.changes) continue;
    let content = {};
    try { content = JSON.parse(row.content_json); } catch { continue; }
    const { results: subscriptions } = await env.DB.prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions
      WHERE workspace_id=?1 LIMIT 10`).bind(row.workspace_id).all();
    for (const subscription of subscriptions || []) {
      try {
        const response = await sendPush(env, subscription, {
          title: String(content.title || "Nível Creator").slice(0, 120),
          body: String(content.body || "").slice(0, 300),
          url: typeof content.action_url === "string" && content.action_url.startsWith("/") ? content.action_url : "/"
        });
        if (response.status === 404 || response.status === 410) {
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?1").bind(subscription.id).run();
        } else if (!response.ok) {
          console.error("push_delivery_error", { status: response.status });
        }
      } catch (error) {
        console.error("push_delivery_error", { kind: error?.name });
      }
    }
  }
}

export async function notificationCronHandler(env) {
  if (!env.DB) return;
  await createTrialReminders(env.DB);
  await createWorkReminders(env.DB);
  await deliverTrialReminderEmails(env);
  await deliverPushNotifications(env);
}

export async function notificationHandler(request, env, path, account) {
  const db = env.DB;
  if (!db) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
  const workspaceId = account.workspace_id;
  if (path === "/api/notifications" && request.method === "GET") {
    const [notifications, preferences, unread] = await Promise.all([
      db.prepare(`SELECT id, kind, content_json, read_at, created_at FROM notifications
        WHERE workspace_id=?1 AND COALESCE((SELECT in_app_enabled FROM notification_preferences WHERE workspace_id=?1),1)=1
        ORDER BY created_at DESC LIMIT 30`).bind(workspaceId).all(),
      db.prepare(`SELECT in_app_enabled, email_enabled FROM notification_preferences WHERE workspace_id=?1`).bind(workspaceId).first(),
      db.prepare(`SELECT COUNT(*) AS count FROM notifications WHERE workspace_id=?1 AND read_at IS NULL
        AND COALESCE((SELECT in_app_enabled FROM notification_preferences WHERE workspace_id=?1),1)=1`).bind(workspaceId).first()
    ]);
    return {
      notifications: (notifications.results || []).map((row) => ({ ...row, content: JSON.parse(row.content_json) })),
      unread_count: unread?.count || 0,
      preferences: { in_app_enabled: preferences ? Boolean(preferences.in_app_enabled) : true,
        email_enabled: preferences ? Boolean(preferences.email_enabled) : false, email_available: notificationEmailAvailable(env) }
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
    const preferences = await db.prepare(`SELECT in_app_enabled, email_enabled FROM notification_preferences WHERE workspace_id=?1`).bind(workspaceId).first();
    return { in_app_enabled: preferences ? Boolean(preferences.in_app_enabled) : true,
      email_enabled: preferences ? Boolean(preferences.email_enabled) : false, email_available: notificationEmailAvailable(env) };
  }
  if (path === "/api/notifications/preferences" && request.method === "PUT") {
    assertSameOrigin(request);
    const body = await readJson(request);
    if (typeof body.in_app_enabled !== "boolean") throw new AuthError(400, "Informe se deseja receber notificações internas.");
    if (body.email_enabled !== undefined && typeof body.email_enabled !== "boolean") throw new AuthError(400, "Informe se deseja receber e-mails transacionais.");
    if (body.email_enabled === true && !notificationEmailAvailable(env)) throw new AuthError(503, "O envio de e-mail ainda não está configurado neste ambiente.");
    if (body.email_enabled === true && !account.email) throw new AuthError(403, "Confirme seu endereço de e-mail antes de ativar avisos por e-mail.");
    const emailEnabled = body.email_enabled === undefined ? null : body.email_enabled ? 1 : 0;
    const preferenceUpdate = db.prepare(`INSERT INTO notification_preferences (workspace_id, in_app_enabled, email_enabled)
      VALUES (?1, ?2, COALESCE(?3,0)) ON CONFLICT(workspace_id) DO UPDATE SET
        in_app_enabled=excluded.in_app_enabled,
        email_enabled=COALESCE(?3,notification_preferences.email_enabled),
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(workspaceId, body.in_app_enabled ? 1 : 0, emailEnabled);
    if (emailEnabled === 0) await db.batch([preferenceUpdate, db.prepare(`UPDATE notifications SET email_status='not_requested',
      email_lease_until=NULL, email_next_attempt_at=NULL WHERE workspace_id=?1 AND email_status IN ('pending','sending')`)
      .bind(workspaceId)]);
    else await preferenceUpdate.run();
    return { saved: true, in_app_enabled: body.in_app_enabled,
      email_enabled: emailEnabled === null ? undefined : Boolean(emailEnabled), email_available: notificationEmailAvailable(env) };
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
  if (path === "/api/notifications/push" && request.method === "GET") {
    const row = await db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE workspace_id=?1").bind(workspaceId).first();
    return { available: pushConfigured(env), public_key: env.VAPID_PUBLIC_KEY || null, devices: row?.count || 0 };
  }
  if (path === "/api/notifications/push/test" && request.method === "POST") {
    assertSameOrigin(request);
    await readJson(request);
    if (!pushConfigured(env)) throw new AuthError(503, "As notificações no celular ainda não estão disponíveis.");
    const { results } = await db.prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE workspace_id=?1 LIMIT 10")
      .bind(workspaceId).all();
    if (!results?.length) throw new AuthError(400, "Ative os avisos no celular antes de enviar um teste.");
    let delivered = 0;
    for (const subscription of results) {
      const response = await sendPush(env, subscription, { title: "Avisos ativados ✨", body: "Assim chegam os lembretes de prazos e conteúdos do dia.", url: "/" });
      if (response.ok) delivered += 1;
      else if (response.status === 404 || response.status === 410) {
        await db.prepare("DELETE FROM push_subscriptions WHERE id=?1").bind(subscription.id).run();
      } else console.error("push_delivery_error", { status: response.status });
    }
    if (!delivered) throw new AuthError(502, "O serviço de avisos do celular não aceitou o envio. Desative e ative de novo.");
    return { delivered };
  }
  if (path === "/api/notifications/push" && (request.method === "POST" || request.method === "DELETE")) {
    assertSameOrigin(request);
    const body = await readJson(request);
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    let endpointUrl;
    try { endpointUrl = new URL(endpoint); } catch { throw new AuthError(400, "Inscrição de notificação inválida."); }
    if (endpointUrl.protocol !== "https:" || endpoint.length > 1000) throw new AuthError(400, "Inscrição de notificação inválida.");
    if (request.method === "DELETE") {
      await db.prepare("DELETE FROM push_subscriptions WHERE endpoint=?1 AND workspace_id=?2").bind(endpoint, workspaceId).run();
      return { saved: true };
    }
    if (!pushConfigured(env)) throw new AuthError(503, "As notificações no celular ainda não estão disponíveis.");
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,30}$/.test(auth)) throw new AuthError(400, "Inscrição de notificação inválida.");
    await db.prepare(`INSERT INTO push_subscriptions (id, workspace_id, endpoint, p256dh, auth) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(endpoint) DO UPDATE SET workspace_id=excluded.workspace_id, p256dh=excluded.p256dh, auth=excluded.auth`)
      .bind(crypto.randomUUID(), workspaceId, endpoint, p256dh, auth).run();
    return { saved: true };
  }
  if (path.startsWith("/api/notifications")) throw new AuthError(405, "Rota ou método não disponível.");
  return null;
}
