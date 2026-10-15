import { AuthError } from "./auth.js";

const METRICS = ["reach", "interactions", "profile_visits", "followers"];

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export async function dashboardHandler(request, env, path, account) {
  if (path !== "/api/dashboard") return null;
  if (request.method !== "GET") throw new AuthError(405, "Método não permitido.");
  const db = env.DB;
  const workspaceId = account.workspace_id;
  const [metricRows, strategy, upcoming, trial] = await Promise.all([
    db.prepare(`SELECT metric, period_start, period_end, value, source, fetched_at, availability
      FROM metric_snapshots WHERE workspace_id=?1 ORDER BY fetched_at DESC LIMIT 100`).bind(workspaceId).all(),
    db.prepare(`SELECT hypothesis, recommendations_json, evidence_json, created_at
      FROM strategies WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 1`).bind(workspaceId).first(),
    db.prepare(`SELECT id, title, format, scheduled_at, status FROM calendar_events
      WHERE workspace_id=?1 AND scheduled_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      ORDER BY scheduled_at LIMIT 4`).bind(workspaceId).all(),
    db.prepare(`SELECT status, starts_at, ends_at FROM trials WHERE workspace_id=?1`).bind(workspaceId).first()
  ]);
  const metrics = Object.fromEntries(METRICS.map((name) => [name, null]));
  for (const row of metricRows.results || []) {
    if (Object.hasOwn(metrics, row.metric) && metrics[row.metric] === null) metrics[row.metric] = row;
  }
  let recommendations = { strengths: [], gaps: [], opportunities: [] };
  try {
    const parsed = parseJson(strategy?.recommendations_json, recommendations);
    recommendations = {
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : []
    };
  } catch { /* Keep dashboard usable if an old recommendation row is malformed. */ }
  const actions = [...recommendations.opportunities, ...recommendations.gaps, ...recommendations.strengths]
    .slice(0, 3).map(({ title, action, evidence }) => ({ title, action, evidence }));
  return {
    metrics,
    diagnostic: strategy ? { summary: strategy.hypothesis, created_at: strategy.created_at } : null,
    actions,
    upcoming: upcoming.results || [],
    trial: trial || null
  };
}
