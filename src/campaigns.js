import { AuthError, assertSameOrigin, readJson } from "./auth.js";

const STATUSES = ["draft", "submitted", "negotiation", "in_progress", "delivered", "completed", "archived"];

function cleanCampaign(body, partial = false) {
  const brand = body.brand_name === undefined && partial ? undefined : typeof body.brand_name === "string" ? body.brand_name.trim() : "";
  const title = body.title === undefined && partial ? undefined : typeof body.title === "string" ? body.title.trim() : "";
  const status = body.status === undefined && partial ? undefined : typeof body.status === "string" ? body.status : "draft";
  const dueAt = body.due_at === undefined && partial ? undefined : body.due_at;
  const deliverables = body.deliverables === undefined && partial ? undefined : Array.isArray(body.deliverables) ? body.deliverables : [];
  const notes = body.notes === undefined && partial ? undefined : typeof body.notes === "string" ? body.notes.trim() : "";
  if (brand !== undefined && (!brand || brand.length > 120)) throw new AuthError(400, "Informe uma marca com até 120 caracteres.");
  if (title !== undefined && (!title || title.length > 160)) throw new AuthError(400, "Informe um título com até 160 caracteres.");
  if (status !== undefined && !STATUSES.includes(status)) throw new AuthError(400, "Status de campanha inválido.");
  if (dueAt !== undefined && dueAt !== null && (typeof dueAt !== "string" || !Number.isFinite(Date.parse(dueAt)))) throw new AuthError(400, "Informe um prazo válido.");
  if (deliverables !== undefined && (deliverables.length > 12 || !deliverables.every((item) => typeof item === "string" && item.trim() && item.length <= 120))) {
    throw new AuthError(400, "Revise os entregáveis (até 12 itens, com 120 caracteres cada).");
  }
  if (notes !== undefined && notes.length > 1500) throw new AuthError(400, "As observações devem ter até 1.500 caracteres.");
  return { brand, title, status, dueAt, deliverables, notes };
}

function mapCampaign(row) {
  let brief = {};
  try { brief = JSON.parse(row.brief_json); } catch { /* Invalid historical data remains contained to this row. */ }
  return { id: row.id, brand_name: row.brand_name, title: brief.title || row.brand_name,
    deliverables: Array.isArray(brief.deliverables) ? brief.deliverables : [], notes: brief.notes || "",
    due_at: row.due_at, status: row.status, created_at: row.created_at };
}

export async function campaignsHandler(request, env, path, account) {
  if (path === "/api/campaigns" && request.method === "GET") {
    const { results } = await env.DB.prepare(`SELECT id, brand_name, brief_json, status, due_at, created_at
      FROM campaigns WHERE workspace_id=?1 ORDER BY COALESCE(due_at,created_at), created_at DESC LIMIT 100`)
      .bind(account.workspace_id).all();
    return { campaigns: (results || []).map(mapCampaign) };
  }
  if (path === "/api/campaigns" && request.method === "POST") {
    assertSameOrigin(request);
    const data = cleanCampaign(await readJson(request));
    const id = crypto.randomUUID();
    const brief = JSON.stringify({ title: data.title, deliverables: data.deliverables, notes: data.notes });
    await env.DB.prepare(`INSERT INTO campaigns (id, workspace_id, brand_name, brief_json, status, due_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(id, account.workspace_id, data.brand, brief, data.status, data.dueAt || null).run();
    return { saved: true, id };
  }
  const match = path.match(/^\/api\/campaigns\/([0-9a-f-]{36})$/i);
  if (match && request.method === "PUT") {
    assertSameOrigin(request);
    const data = cleanCampaign(await readJson(request), true);
    const row = await env.DB.prepare("SELECT brand_name, brief_json, status, due_at FROM campaigns WHERE id=?1 AND workspace_id=?2")
      .bind(match[1], account.workspace_id).first();
    if (!row) throw new AuthError(404, "Esta campanha não foi encontrada no seu espaço.");
    const existing = mapCampaign({ ...row, id: match[1], created_at: "" });
    const nextBrief = JSON.stringify({
      title: data.title ?? existing.title,
      deliverables: data.deliverables ?? existing.deliverables,
      notes: data.notes ?? existing.notes
    });
    const result = await env.DB.prepare(`UPDATE campaigns SET brand_name=?1, brief_json=?2,
      status=COALESCE(?3,status), due_at=CASE WHEN ?4=1 THEN ?5 ELSE due_at END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?6 AND workspace_id=?7`)
      .bind(data.brand ?? existing.brand_name, nextBrief, data.status ?? null, data.dueAt !== undefined ? 1 : 0,
        data.dueAt || null, match[1], account.workspace_id).run();
    if (!result.meta?.changes) throw new AuthError(404, "Esta campanha não foi encontrada no seu espaço.");
    return { saved: true };
  }
  throw new AuthError(request.method === "GET" || request.method === "POST" || request.method === "PUT" ? 404 : 405,
    "Rota ou método não disponível.");
}
