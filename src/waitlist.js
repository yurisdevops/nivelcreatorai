import { AuthError, assertSameOrigin, readJson } from "./auth.js";

export const WAITLIST_CONSENT_VERSION = "waitlist-2026-10-18";
const CAMPAIGN_RANGES = ["none", "1-2", "3-5", "6+"];
const EMAIL_PATTERN = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

function optionalText(value, max, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new AuthError(400, `Revise o campo ${label}.`);
  const text = value.trim();
  if (text.length > max) throw new AuthError(400, `O campo ${label} deve ter até ${max} caracteres.`);
  return text || null;
}

export function cleanWaitlistEntry(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name || name.length > 80) throw new AuthError(400, "Informe seu nome com até 80 caracteres.");
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) throw new AuthError(400, "Informe um e-mail válido.");
  let instagram = optionalText(body.instagram, 31, "Instagram");
  if (instagram) {
    instagram = instagram.replace(/^@/, "");
    if (!/^[a-z0-9._]{1,30}$/i.test(instagram)) throw new AuthError(400, "Informe o @ do Instagram sem espaços.");
  }
  const niche = optionalText(body.niche, 80, "nicho");
  const biggestPain = optionalText(body.biggest_pain, 500, "maior dificuldade");
  if (!CAMPAIGN_RANGES.includes(body.campaigns_per_month)) throw new AuthError(400, "Escolha quantas campanhas você fecha por mês.");
  if (body.consent !== true) throw new AuthError(400, "Confirme que podemos guardar seus dados para avisar sobre o lançamento.");
  const source = optionalText(body.source, 60, "origem");
  return { name, email, instagram, niche, biggestPain, campaignsPerMonth: body.campaigns_per_month,
    founderInterest: body.founder_interest === true ? 1 : 0, source };
}

export async function waitlistHandler(request, env, path) {
  if (path !== "/api/waitlist") return null;
  if (request.method !== "POST") throw new AuthError(405, "Método não permitido.");
  assertSameOrigin(request);
  if (!env.DB) throw new AuthError(503, "A lista de espera está temporariamente indisponível.");
  const body = await readJson(request, 4096);
  // Bots tend to fill every field; people never see this one.
  if (typeof body?.website === "string" && body.website.trim()) return { joined: true };
  const entry = cleanWaitlistEntry(body);
  // Re-sending the form updates the same entry, and the answer never reveals whether an e-mail was already listed.
  await env.DB.prepare(`INSERT INTO waitlist_entries
      (id, email, name, instagram, niche, campaigns_per_month, biggest_pain, founder_interest, consent_version, source)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(email) DO UPDATE SET name=excluded.name, instagram=excluded.instagram, niche=excluded.niche,
        campaigns_per_month=excluded.campaigns_per_month, biggest_pain=excluded.biggest_pain,
        founder_interest=MAX(waitlist_entries.founder_interest, excluded.founder_interest),
        consent_version=excluded.consent_version, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(crypto.randomUUID(), entry.email, entry.name, entry.instagram, entry.niche, entry.campaignsPerMonth,
      entry.biggestPain, entry.founderInterest, WAITLIST_CONSENT_VERSION, entry.source).run();
  return { joined: true };
}

export function betaInviteOnly(env) {
  return env.BETA_INVITE_ONLY === "true";
}

// During the closed beta only e-mails approved from the waitlist can create an account.
export async function assertBetaApproved(env, email) {
  if (!betaInviteOnly(env)) return;
  const row = await env.DB.prepare("SELECT approved_at FROM waitlist_entries WHERE email=?1")
    .bind(email).first();
  if (!row?.approved_at) {
    throw new AuthError(403, "O Nível Creator está em beta fechado. Entre na lista de espera em /lista e avisaremos quando sua vaga abrir.", "beta_not_approved");
  }
}
