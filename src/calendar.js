import { AuthError, assertSameOrigin, readJson } from "./auth.js";

const STATUSES = ["idea", "draft", "ready_to_record", "recorded", "approved", "published"];
const FORMATS = ["Reels (vídeo curto)", "Stories", "TikTok", "Shorts", "Carrossel", "UGC", "Live", "Outro"];

function cleanEvent(body, partial = false) {
  const title = body.title === undefined && partial ? undefined : typeof body.title === "string" ? body.title.trim() : "";
  const format = body.format === undefined && partial ? undefined : typeof body.format === "string" ? body.format : "Reels (vídeo curto)";
  const status = body.status === undefined && partial ? undefined : typeof body.status === "string" ? body.status : "idea";
  const notes = body.notes === undefined && partial ? undefined : typeof body.notes === "string" ? body.notes.trim() : "";
  const scheduledAt = body.scheduled_at === undefined && partial ? undefined : body.scheduled_at;
  const scriptId = body.script_id === undefined && partial ? undefined : body.script_id;
  if (title !== undefined && (!title || title.length > 140)) throw new AuthError(400, "O título deve ter até 140 caracteres.");
  if (format !== undefined && !FORMATS.includes(format)) throw new AuthError(400, "Escolha um formato válido.");
  if (status !== undefined && !STATUSES.includes(status)) throw new AuthError(400, "Escolha um status válido.");
  if (notes !== undefined && notes.length > 1000) throw new AuthError(400, "As observações devem ter até 1.000 caracteres.");
  if (scheduledAt !== undefined && scheduledAt !== null && (typeof scheduledAt !== "string" || !Number.isFinite(Date.parse(scheduledAt)))) {
    throw new AuthError(400, "Informe uma data e horário válidos.");
  }
  if (scriptId !== undefined && scriptId !== null && (typeof scriptId !== "string" || scriptId.length > 80)) {
    throw new AuthError(400, "O roteiro vinculado não é válido.");
  }
  return { title, format, status, notes, scheduledAt, scriptId };
}

export async function calendarHandler(request, env, path, account) {
  if (!path.startsWith("/api/calendar/")) return null;
  const db = env.DB;
  if (path === "/api/calendar/events" && request.method === "GET") {
    const { results } = await db.prepare(`SELECT id, script_id, title, format, scheduled_at, status, notes, created_at, updated_at
      FROM calendar_events WHERE workspace_id=?1 ORDER BY COALESCE(scheduled_at, created_at), created_at DESC LIMIT 100`)
      .bind(account.workspace_id).all();
    return { events: results || [] };
  }
  if (path === "/api/calendar/events" && request.method === "POST") {
    assertSameOrigin(request);
    const event = cleanEvent(await readJson(request));
    if (event.scriptId) {
      const script = await db.prepare("SELECT id FROM scripts WHERE id=?1 AND workspace_id=?2")
        .bind(event.scriptId, account.workspace_id).first();
      if (!script) throw new AuthError(404, "O roteiro vinculado não foi encontrado neste espaço.");
    }
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO calendar_events (id, workspace_id, script_id, title, format, scheduled_at, status, notes)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
      .bind(id, account.workspace_id, event.scriptId || null, event.title, event.format, event.scheduledAt || null, event.status, event.notes).run();
    return { saved: true, id };
  }
  const match = path.match(/^\/api\/calendar\/events\/([0-9a-f-]{36})$/i);
  if (match && request.method === "DELETE") {
    assertSameOrigin(request);
    const result = await db.prepare("DELETE FROM calendar_events WHERE id=?1 AND workspace_id=?2")
      .bind(match[1], account.workspace_id).run();
    if (!result.meta?.changes) throw new AuthError(404, "Este conteúdo não foi encontrado no seu espaço.");
    return { deleted: true };
  }
  if (match && request.method === "PUT") {
    assertSameOrigin(request);
    const changes = cleanEvent(await readJson(request), true);
    const current = await db.prepare("SELECT status FROM calendar_events WHERE id=?1 AND workspace_id=?2")
      .bind(match[1], account.workspace_id).first();
    if (!current) throw new AuthError(404, "Este conteúdo não foi encontrado no seu espaço.");
    if (changes.status && Math.abs(STATUSES.indexOf(changes.status) - STATUSES.indexOf(current.status)) > 1) {
      throw new AuthError(409, "Avance ou volte uma etapa por vez no fluxo do conteúdo.");
    }
    if (changes.scriptId) {
      const script = await db.prepare("SELECT id FROM scripts WHERE id=?1 AND workspace_id=?2")
        .bind(changes.scriptId, account.workspace_id).first();
      if (!script) throw new AuthError(404, "O roteiro vinculado não foi encontrado neste espaço.");
    }
    const result = await db.prepare(`UPDATE calendar_events SET
      title=COALESCE(?1,title), format=COALESCE(?2,format), status=COALESCE(?3,status), notes=COALESCE(?4,notes),
      scheduled_at=CASE WHEN ?5=1 THEN ?6 ELSE scheduled_at END,
      script_id=CASE WHEN ?7=1 THEN ?8 ELSE script_id END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?9 AND workspace_id=?10`)
      .bind(changes.title ?? null, changes.format ?? null, changes.status ?? null, changes.notes ?? null,
        changes.scheduledAt !== undefined ? 1 : 0, changes.scheduledAt || null,
        changes.scriptId !== undefined ? 1 : 0, changes.scriptId || null, match[1], account.workspace_id).run();
    if (!result.meta?.changes) throw new AuthError(404, "Este conteúdo não foi encontrado no seu espaço.");
    return { saved: true };
  }
  throw new AuthError(request.method === "GET" || request.method === "POST" || request.method === "PUT" ? 404 : 405,
    "Rota ou método não disponível.");
}
