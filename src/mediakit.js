import { AuthError, assertSameOrigin, readJson } from "./auth.js";

const SLUG = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const RESERVED = new Set(["api", "auth", "admin", "lista", "entrar", "kit", "termos", "privacidade", "nivel", "suporte", "app"]);
const METRIC_LABELS = { followers: "Seguidores", reach: "Alcance", interactions: "Interações", views: "Visualizações" };

function text(value, max, label, required = false) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (required && !clean) throw new AuthError(400, `Preencha ${label}.`);
  if (clean.length > max) throw new AuthError(400, `${label[0].toUpperCase()}${label.slice(1)} deve ter até ${max} caracteres.`);
  return clean;
}

function list(value, maxItems, maxLength, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new AuthError(400, `Revise ${label} (até ${maxItems} itens).`);
  return value.map((item) => text(item, maxLength, label)).filter(Boolean);
}

export function cleanMediaKit(body) {
  const slug = text(body.slug, 30, "o endereço", true).toLowerCase().replace(/^@/, "");
  if (!SLUG.test(slug) || RESERVED.has(slug)) {
    throw new AuthError(400, "Use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado no endereço.");
  }
  const email = text(body.contact_email, 254, "o e-mail").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(400, "Informe um e-mail de contato válido.");
  const instagram = text(body.instagram, 31, "o Instagram").replace(/^@/, "");
  if (instagram && !/^[a-z0-9._]{1,30}$/i.test(instagram)) throw new AuthError(400, "Informe o @ do Instagram sem espaços.");
  return {
    slug, email, instagram,
    displayName: text(body.display_name, 80, "o nome de exibição", true),
    bio: text(body.bio, 600, "a bio"),
    city: text(body.city, 80, "a cidade"),
    brands: list(body.brands, 20, 60, "as marcas"),
    highlights: list(body.highlights, 6, 160, "os destaques"),
    showMetrics: body.show_metrics !== false,
    showDeliveredBrands: body.show_delivered_brands !== false,
    published: body.published === true
  };
}

function mapKit(row) {
  if (!row) return null;
  const parse = (value) => { try { return JSON.parse(value); } catch { return []; } };
  return { slug: row.slug, display_name: row.display_name, bio: row.bio, city: row.city, contact_email: row.contact_email,
    instagram: row.instagram, brands: parse(row.brands_json), highlights: parse(row.highlights_json),
    show_metrics: Boolean(row.show_metrics), show_delivered_brands: Boolean(row.show_delivered_brands),
    published: Boolean(row.published), updated_at: row.updated_at };
}

export async function mediaKitHandler(request, env, path, account) {
  if (path !== "/api/media-kit") return null;
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM media_kits WHERE workspace_id=?1").bind(account.workspace_id).first();
    return { kit: mapKit(row) };
  }
  if (request.method !== "PUT") throw new AuthError(405, "Método não permitido.");
  assertSameOrigin(request);
  const kit = cleanMediaKit(await readJson(request, 16384));
  const taken = await env.DB.prepare("SELECT workspace_id FROM media_kits WHERE slug=?1").bind(kit.slug).first();
  if (taken && taken.workspace_id !== account.workspace_id) throw new AuthError(409, "Esse endereço já está em uso. Escolha outro.");
  await env.DB.prepare(`INSERT INTO media_kits (workspace_id, slug, display_name, bio, city, contact_email, instagram,
      brands_json, highlights_json, show_metrics, show_delivered_brands, published)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    ON CONFLICT(workspace_id) DO UPDATE SET slug=excluded.slug, display_name=excluded.display_name, bio=excluded.bio,
      city=excluded.city, contact_email=excluded.contact_email, instagram=excluded.instagram, brands_json=excluded.brands_json,
      highlights_json=excluded.highlights_json, show_metrics=excluded.show_metrics,
      show_delivered_brands=excluded.show_delivered_brands, published=excluded.published,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(account.workspace_id, kit.slug, kit.displayName, kit.bio, kit.city, kit.email, kit.instagram,
      JSON.stringify(kit.brands), JSON.stringify(kit.highlights), kit.showMetrics ? 1 : 0, kit.showDeliveredBrands ? 1 : 0,
      kit.published ? 1 : 0).run();
  return { saved: true, url: `/kit/${kit.slug}` };
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

export async function renderPublicMediaKit(env, slug) {
  if (!SLUG.test(slug)) return null;
  const row = await env.DB.prepare("SELECT * FROM media_kits WHERE slug=?1 AND published=1").bind(slug).first();
  const kit = mapKit(row);
  if (!kit) return null;
  const metrics = [];
  if (kit.show_metrics) {
    const { results } = await env.DB.prepare(`SELECT metric, value FROM metric_snapshots
      WHERE workspace_id=?1 AND availability='available' ORDER BY fetched_at DESC LIMIT 60`).bind(row.workspace_id).all();
    const seen = new Set();
    for (const item of results || []) {
      if (METRIC_LABELS[item.metric] && !seen.has(item.metric) && Number.isFinite(item.value)) {
        seen.add(item.metric);
        metrics.push({ label: METRIC_LABELS[item.metric], value: formatNumber(item.value) });
      }
    }
  }
  let brands = [...kit.brands];
  if (kit.show_delivered_brands) {
    const { results } = await env.DB.prepare(`SELECT DISTINCT brand_name FROM campaigns WHERE workspace_id=?1
      AND status IN ('delivered','completed') LIMIT 30`).bind(row.workspace_id).all();
    for (const item of results || []) if (!brands.some((brand) => brand.toLowerCase() === item.brand_name.toLowerCase())) brands.push(item.brand_name);
  }
  brands = brands.slice(0, 24);
  const name = escapeHtml(kit.display_name);
  const contact = kit.contact_email
    ? `<a class="button primary" href="mailto:${escapeHtml(kit.contact_email)}?subject=${encodeURIComponent("Parceria com " + kit.display_name)}">Quero fazer uma parceria</a>`
    : "";
  const instagram = kit.instagram
    ? `<a class="button ghost" href="https://instagram.com/${encodeURIComponent(kit.instagram)}" rel="noopener" target="_blank">@${escapeHtml(kit.instagram)}</a>` : "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#070d20">
<title>${name} · Media kit</title>
<meta name="description" content="${escapeHtml((kit.bio || `Media kit de ${kit.display_name}`).slice(0, 160))}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/lista.css"><link rel="stylesheet" href="/kit.css">
</head>
<body>
<main class="kit">
  <header class="kit-hero">
    <span class="kit-avatar" aria-hidden="true">${escapeHtml(kit.display_name.charAt(0).toUpperCase())}</span>
    <p class="eyebrow">MEDIA KIT · CRIADOR UGC</p>
    <h1>${name}</h1>
    ${kit.city ? `<p class="kit-city">${escapeHtml(kit.city)}</p>` : ""}
    ${kit.bio ? `<p class="kit-bio">${escapeHtml(kit.bio)}</p>` : ""}
    <div class="kit-actions">${contact}${instagram}</div>
  </header>
  ${metrics.length ? `<section class="kit-section"><h2>Números do Instagram</h2><div class="kit-metrics">${metrics.map((item) => `<div><b>${escapeHtml(item.value)}</b><small>${escapeHtml(item.label)}</small></div>`).join("")}</div><p class="kit-note">Dados da API oficial do Instagram, atualizados automaticamente.</p></section>` : ""}
  ${kit.highlights.length ? `<section class="kit-section"><h2>Destaques</h2><ul class="kit-highlights">${kit.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
  ${brands.length ? `<section class="kit-section"><h2>Marcas que já confiaram</h2><div class="kit-brands">${brands.map((brand) => `<span>${escapeHtml(brand)}</span>`).join("")}</div></section>` : ""}
  <footer class="foot"><p>Media kit criado com o <a href="/lista">Nível Creator IA</a>.</p></footer>
</main>
</body>
</html>`;
}
