import { AuthError } from "./auth.js";

function requireDatabase(env) {
  if (!env.DB) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
  return env.DB;
}

export async function ensureWorkspace(env, user) {
  const db = requireDatabase(env);
  const userId = user.id;
  const email = user.email;
  const verifiedAt = user.email_confirmed_at || user.confirmed_at;
  if (!userId || !email || !verifiedAt) throw new AuthError(403, "Confirme seu e-mail antes de iniciar o período de teste.");

  const workspaceId = crypto.randomUUID();
  const trialStart = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";
  const trialEnd = "strftime('%Y-%m-%dT%H:%M:%SZ','now','+168 hours')";
  await db.batch([
    db.prepare(`INSERT INTO users (id, auth_subject, email, email_verified_at)
      VALUES (?1, ?1, ?2, ?3)
      ON CONFLICT(auth_subject) DO UPDATE SET email=excluded.email, email_verified_at=excluded.email_verified_at`)
      .bind(userId, email, verifiedAt),
    db.prepare(`INSERT INTO workspaces (id, owner_id, name)
      VALUES (?1, ?2, 'Meu espaço') ON CONFLICT(owner_id) DO NOTHING`).bind(workspaceId, userId),
    db.prepare(`INSERT INTO memberships (workspace_id, user_id, role)
      SELECT id, owner_id, 'owner' FROM workspaces WHERE owner_id=?1
      ON CONFLICT(workspace_id, user_id) DO NOTHING`).bind(userId),
    db.prepare(`INSERT INTO creator_profiles (workspace_id)
      SELECT id FROM workspaces WHERE owner_id=?1 ON CONFLICT(workspace_id) DO NOTHING`).bind(userId),
    db.prepare(`INSERT INTO trials (workspace_id, starts_at, ends_at, status)
      SELECT id, ${trialStart}, ${trialEnd}, 'trialing' FROM workspaces WHERE owner_id=?1
      ON CONFLICT(workspace_id) DO NOTHING`).bind(userId)
  ]);

  const account = await getWorkspace(env, userId);
  if (!account) throw new AuthError(503, "Não foi possível preparar seu espaço. Tente novamente.");
  return account;
}

export async function getWorkspace(env, userId) {
  const db = requireDatabase(env);
  const account = await db.prepare(`SELECT w.id AS workspace_id, w.name AS workspace_name,
      p.niche, p.goals_json, p.voice, p.onboarding_completed_at,
      p.ai_data_consent_at,
      t.starts_at AS trial_starts_at, t.ends_at AS trial_ends_at, t.status AS trial_status
    FROM users u
    JOIN memberships m ON m.user_id=u.id AND m.role='owner'
    JOIN workspaces w ON w.id=m.workspace_id AND w.owner_id=u.id
    JOIN creator_profiles p ON p.workspace_id=w.id
    LEFT JOIN trials t ON t.workspace_id=w.id
    WHERE u.auth_subject=?1 LIMIT 1`).bind(userId).first();
  return account;
}

export function cleanProfileInput(body) {
  const niche = typeof body.niche === "string" ? body.niche.trim() : "";
  const voice = typeof body.voice === "string" ? body.voice.trim() : "";
  const goals = Array.isArray(body.goals) ? body.goals : body.goal ? [body.goal] : [];
  if (niche.length > 100 || voice.length > 500 || goals.length > 5) throw new AuthError(400, "Revise os limites dos campos do perfil.");
  const safeGoals = goals.map((goal) => typeof goal === "string" ? goal.trim() : "").filter((goal) => goal && goal.length <= 100);
  if (safeGoals.length !== goals.length) throw new AuthError(400, "Revise os objetivos informados.");
  return { niche, voice, goals: safeGoals, aiConsent: body.ai_consent === true };
}

export async function saveProfile(env, userId, profile) {
  const db = requireDatabase(env);
  const completed = profile.niche && profile.voice && profile.goals.length > 0 ? new Date().toISOString() : null;
  const result = await db.prepare(`UPDATE creator_profiles
    SET niche=?1, voice=?2, goals_json=?3,
        onboarding_completed_at=COALESCE(?4, onboarding_completed_at),
        ai_data_consent_at=CASE WHEN ?5=1 THEN COALESCE(ai_data_consent_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NULL END,
        ai_data_consent_version=CASE WHEN ?5=1 THEN 'ai-data-2026-10-15' ELSE NULL END,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE workspace_id IN (
      SELECT m.workspace_id FROM memberships m
      JOIN users u ON u.id=m.user_id
      JOIN workspaces w ON w.id=m.workspace_id AND w.owner_id=u.id
      WHERE u.auth_subject=?6 AND m.role='owner'
    )`).bind(profile.niche || null, profile.voice || null, JSON.stringify(profile.goals), completed, profile.aiConsent ? 1 : 0, userId).run();
  if (!result.meta?.changes) throw new AuthError(404, "Seu espaço não foi encontrado.");
}
