import { AuthError, assertSameOrigin, readJson } from "./auth.js";

// "prospecting" is a campaign the creator is still aiming for; the rest follow the deal from pitch to delivery.
const STATUSES = ["prospecting", "draft", "submitted", "negotiation", "in_progress", "delivered", "completed", "archived"];
export const DEFAULT_CHECKLIST = ["Ler o briefing completo", "Preparar o roteiro", "Separar o produto e o cenário",
  "Gravar o vídeo principal", "Revisar o conteúdo", "Enviar os arquivos para a marca"];

function cleanItems(value, label, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) throw new AuthError(400, `Revise ${label} (até ${maxItems} itens).`);
  return value.map((item) => {
    const text = typeof item === "string" ? item.trim() : typeof item?.text === "string" ? item.text.trim() : "";
    if (!text || text.length > maxLength) throw new AuthError(400, `Revise ${label} (até ${maxLength} caracteres cada).`);
    return { text, done: typeof item === "object" && item.done === true };
  });
}

function cleanContact(value) {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new AuthError(400, "Revise o contato da marca.");
  const field = (key, max) => {
    const text = typeof value[key] === "string" ? value[key].trim() : "";
    if (text.length > max) throw new AuthError(400, "Revise o contato da marca.");
    return text;
  };
  const contact = { name: field("name", 80), email: field("email", 254).toLowerCase(), instagram: field("instagram", 31).replace(/^@/, "") };
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new AuthError(400, "Informe um e-mail válido para o contato.");
  if (contact.instagram && !/^[a-z0-9._]{1,30}$/i.test(contact.instagram)) throw new AuthError(400, "Informe o @ do contato sem espaços.");
  return contact.name || contact.email || contact.instagram ? contact : null;
}

function cleanCampaign(body, partial = false) {
  const has = (key) => body[key] !== undefined;
  const skip = (key) => partial && !has(key);
  const brand = skip("brand_name") ? undefined : typeof body.brand_name === "string" ? body.brand_name.trim() : "";
  const title = skip("title") ? undefined : typeof body.title === "string" ? body.title.trim() : "";
  const status = skip("status") ? undefined : typeof body.status === "string" ? body.status : "prospecting";
  const dueAt = skip("due_at") ? undefined : body.due_at;
  const deliverables = skip("deliverables") ? undefined : cleanItems(body.deliverables ?? [], "os entregáveis", 12, 120);
  const checklist = skip("checklist") ? undefined
    : cleanItems(has("checklist") ? body.checklist : DEFAULT_CHECKLIST, "o checklist", 15, 120);
  const notes = skip("notes") ? undefined : typeof body.notes === "string" ? body.notes.trim() : "";
  const contact = skip("contact") ? undefined : cleanContact(body.contact ?? null);
  if (brand !== undefined && (!brand || brand.length > 120)) throw new AuthError(400, "Informe uma marca com até 120 caracteres.");
  if (title !== undefined && (!title || title.length > 160)) throw new AuthError(400, "Informe um título com até 160 caracteres.");
  if (status !== undefined && !STATUSES.includes(status)) throw new AuthError(400, "Status de campanha inválido.");
  if (dueAt !== undefined && dueAt !== null && (typeof dueAt !== "string" || !Number.isFinite(Date.parse(dueAt)))) throw new AuthError(400, "Informe um prazo válido.");
  if (notes !== undefined && notes.length > 1500) throw new AuthError(400, "As observações devem ter até 1.500 caracteres.");
  return { brand, title, status, dueAt, deliverables, checklist, notes, contact };
}

function mapCampaign(row) {
  let brief = {};
  try { brief = JSON.parse(row.brief_json); } catch { /* Invalid historical data remains contained to this row. */ }
  const items = (value) => Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? { text: item, done: false } : { text: String(item?.text || ""), done: item?.done === true })
      .filter((item) => item.text)
    : [];
  return { id: row.id, brand_name: row.brand_name, title: brief.title || row.brand_name,
    deliverables: items(brief.deliverables),
    checklist: Array.isArray(brief.checklist) ? items(brief.checklist) : DEFAULT_CHECKLIST.map((text) => ({ text, done: false })),
    contact: brief.contact && typeof brief.contact === "object" ? brief.contact : null,
    notes: brief.notes || "", due_at: row.due_at, status: row.status, created_at: row.created_at };
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
    const brief = JSON.stringify({ title: data.title, deliverables: data.deliverables, checklist: data.checklist,
      contact: data.contact, notes: data.notes });
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
      checklist: data.checklist ?? existing.checklist,
      contact: data.contact !== undefined ? data.contact : existing.contact,
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
