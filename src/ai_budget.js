import { AuthError } from "./auth.js";
import { reserveQuota, releaseQuotaReservation } from "./quota.js";

const MAX_INPUT_TOKENS = 64000;
const MAX_INPUT_BYTES = 64000;
const MAX_DAILY_BUDGET_USD = 100000;

function pricing(env, tier = "complex") {
  const dailyUsd = Number(env.AI_DAILY_BUDGET_USD);
  const simple = tier === "simple";
  const customSimpleModel = simple && env.GEMINI_SIMPLE_MODEL && env.GEMINI_SIMPLE_MODEL !== "gemini-3.5-flash-lite";
  if (customSimpleModel && (env.GEMINI_SIMPLE_INPUT_USD_PER_MILLION === undefined || env.GEMINI_SIMPLE_OUTPUT_USD_PER_MILLION === undefined)) {
    throw new AuthError(503, "Configure as tarifas de entrada e saída do modelo simples junto com a troca do modelo.");
  }
  const inputUsdPerMillion = Number(simple
    ? (env.GEMINI_SIMPLE_INPUT_USD_PER_MILLION ?? 0.30)
    : env.GEMINI_INPUT_USD_PER_MILLION);
  const outputUsdPerMillion = Number(simple
    ? (env.GEMINI_SIMPLE_OUTPUT_USD_PER_MILLION ?? 2.50)
    : env.GEMINI_OUTPUT_USD_PER_MILLION);
  if (!Number.isFinite(dailyUsd) || dailyUsd < 0 || dailyUsd > MAX_DAILY_BUDGET_USD ||
      !Number.isFinite(inputUsdPerMillion) || inputUsdPerMillion <= 0 ||
      !Number.isFinite(outputUsdPerMillion) || outputUsdPerMillion <= 0) {
    throw new AuthError(503, "O controle global de orçamento de IA não está configurado corretamente.");
  }
  return { budgetMicroUsd: Math.floor(dailyUsd * 1_000_000), inputUsdPerMillion, outputUsdPerMillion };
}

export function serializeAiRequest(payload, maxBytes = MAX_INPUT_BYTES) {
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new AuthError(413, "O contexto enviado à IA excede o limite técnico permitido.", "ai_payload_too_large");
  }
  return body;
}

function circuitOpenError() {
  return new AuthError(503, "A geração por IA está pausada após falhas recentes. Tente novamente em alguns minutos.", "ai_circuit_open");
}

async function acquireCircuitProbe(env) {
  let row;
  try {
    row = await env.DB.prepare(`SELECT state, open_until, probe_started_at FROM ai_provider_circuits
      WHERE provider='gemini'`).first();
  } catch {
    throw new AuthError(503, "O controle de disponibilidade da IA ainda não foi configurado.", "ai_circuit_unavailable");
  }
  if (!row) throw new AuthError(503, "O controle de disponibilidade da IA ainda não foi configurado.", "ai_circuit_unavailable");
  if (row.state === "closed") return null;

  const token = crypto.randomUUID();
  let result;
  try {
    if (row.state === "open") {
      result = await env.DB.prepare(`UPDATE ai_provider_circuits SET state='half_open', probe_token=?1,
          probe_started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE provider='gemini' AND state='open' AND julianday(open_until)<=julianday('now')`).bind(token).run();
    } else if (row.state === "half_open") {
      result = await env.DB.prepare(`UPDATE ai_provider_circuits SET probe_token=?1,
          probe_started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE provider='gemini' AND state='half_open' AND julianday(probe_started_at)<julianday('now','-45 seconds')`)
        .bind(token).run();
    }
  } catch {
    throw new AuthError(503, "O controle de disponibilidade da IA está temporariamente indisponível.", "ai_circuit_unavailable");
  }
  if (result?.meta?.changes) return token;
  throw circuitOpenError();
}

async function recordCircuitSuccess(env, probeToken) {
  const query = probeToken
    ? `UPDATE ai_provider_circuits SET state='closed', consecutive_failures=0, open_until=NULL,
        probe_token=NULL, probe_started_at=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE provider='gemini' AND state='half_open' AND probe_token=?1`
    : `UPDATE ai_provider_circuits SET consecutive_failures=0,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE provider='gemini' AND state='closed'`;
  const statement = env.DB.prepare(query);
  await (probeToken ? statement.bind(probeToken) : statement).run();
}

async function recordCircuitFailure(env, probeToken) {
  const query = probeToken
    ? `UPDATE ai_provider_circuits SET state='open', consecutive_failures=5,
        open_until=strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 minutes'), probe_token=NULL, probe_started_at=NULL,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE provider='gemini' AND state='half_open' AND probe_token=?1`
    : `UPDATE ai_provider_circuits SET consecutive_failures=consecutive_failures+1,
        state=CASE WHEN consecutive_failures+1>=5 THEN 'open' ELSE 'closed' END,
        open_until=CASE WHEN consecutive_failures+1>=5 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 minutes') ELSE NULL END,
        probe_token=NULL, probe_started_at=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE provider='gemini' AND state='closed'`;
  const statement = env.DB.prepare(query);
  await (probeToken ? statement.bind(probeToken) : statement).run();
}

export async function requestGemini(env, model, payload, unavailableMessage, { maxBytes } = {}) {
  const provider = env.GEMINI_PROVIDER || "gemini-api";
  const vertex = provider === "vertex";
  if (!env.GEMINI_API_KEY || (vertex && !env.GOOGLE_CLOUD_PROJECT)) {
    throw new AuthError(503, "A integração de IA ainda não foi configurada corretamente.", "ai_provider_unconfigured");
  }
  if (!vertex && provider !== "gemini-api") {
    throw new AuthError(503, "O provedor de IA configurado não é reconhecido.", "ai_provider_unconfigured");
  }
  const requestPayload = vertex ? {
    ...payload,
    generationConfig: payload?.generationConfig ? Object.fromEntries(
      Object.entries(payload.generationConfig).filter(([key]) => key !== "temperature" && key !== "topP" && key !== "topK")
    ) : undefined
  } : payload;
  const apiUrl = vertex
    ? `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(env.GOOGLE_CLOUD_PROJECT)}/locations/${encodeURIComponent(env.GOOGLE_CLOUD_LOCATION || "global")}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  // Image requests (screenshots) may pass a larger byte limit; text requests keep the default.
  const body = serializeAiRequest(requestPayload, maxBytes);
  // Keys pasted into a terminal often carry quotes, spaces or line breaks, which make the header invalid.
  const apiKey = String(env.GEMINI_API_KEY).trim().replace(/^["']|["']$/g, "");
  const probeToken = await acquireCircuitProbe(env);
  let response;
  try {
    response = await fetch(apiUrl, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body, redirect: "manual", signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    console.error("ai_provider_error", { provider, model, kind: error?.name, message: String(error?.message || "").slice(0, 200) });
    await recordCircuitFailure(env, probeToken);
    throw new AuthError(502, `${unavailableMessage} (falha de conexão: ${error?.name || "erro"})`);
  }
  if (!response.ok) {
    // Log only the provider status and reason so failures can be diagnosed without exposing prompts or keys.
    const detail = await response.json().catch(() => null);
    console.error("ai_provider_error", { provider, model, status: response.status,
      reason: detail?.error?.status, message: String(detail?.error?.message || "").slice(0, 200) });
    await recordCircuitFailure(env, probeToken);
    // The provider's status code helps the creator report problems; it never contains the key or the prompt.
    throw new AuthError(502, `${unavailableMessage} (código ${response.status}${detail?.error?.status ? ` ${detail.error.status}` : ""})`);
  }
  await recordCircuitSuccess(env, probeToken);
  return response;
}

export function usageFromGemini(payload) {
  const metadata = payload?.usageMetadata || {};
  const promptTokens = metadata.promptTokenCount;
  const totalTokens = metadata.totalTokenCount;
  return {
    promptTokens: typeof promptTokens === "number" && Number.isSafeInteger(promptTokens) && promptTokens >= 0 ? promptTokens : null,
    totalTokens: typeof totalTokens === "number" && Number.isSafeInteger(totalTokens) && totalTokens >= 0 ? totalTokens : null
  };
}

export async function reserveAiBudget(env, reservationId, maxOutputTokens, tier = "complex") {
  if (!env.DB) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 8192) {
    throw new AuthError(500, "O limite de geração da IA está inválido.");
  }
  const { budgetMicroUsd, inputUsdPerMillion, outputUsdPerMillion } = pricing(env, tier);
  const reservedMicroUsd = Math.ceil(MAX_INPUT_TOKENS * inputUsdPerMillion + maxOutputTokens * outputUsdPerMillion);
  if (budgetMicroUsd < reservedMicroUsd) {
    throw new AuthError(429, "O limite diário global de IA já foi atingido. Tente novamente após a renovação diária.");
  }
  await env.DB.prepare("DELETE FROM ai_budget_reservations WHERE day_utc < date('now','-90 days')").run();
  const result = await env.DB.prepare(`INSERT INTO ai_budget_reservations
      (id, day_utc, reserved_micro_usd, actual_micro_usd, max_input_tokens, max_output_tokens,
       input_usd_per_million, output_usd_per_million, status)
    SELECT ?1, date('now'), ?2, NULL, ?3, ?4, ?5, ?6, 'reserved'
    WHERE (SELECT COALESCE(SUM(CASE WHEN status='completed' THEN actual_micro_usd ELSE reserved_micro_usd END), 0)
      FROM ai_budget_reservations WHERE day_utc=date('now') AND status IN ('reserved','completed')) + ?2 <= ?7`)
    .bind(reservationId, reservedMicroUsd, MAX_INPUT_TOKENS, maxOutputTokens,
      inputUsdPerMillion, outputUsdPerMillion, budgetMicroUsd).run();
  if (!result.meta?.changes) throw new AuthError(429, "O limite diário global de IA foi atingido. Tente novamente após a renovação diária.");
}

export async function reserveAiQuota(env, workspaceId, entitlement, operation, limit, maxOutputTokens, tier = "complex") {
  const reservationId = await reserveQuota(env, workspaceId, entitlement, operation, limit);
  try {
    await reserveAiBudget(env, reservationId, maxOutputTokens, tier);
    return reservationId;
  } catch (error) {
    await releaseQuotaReservation(env, reservationId).catch(() => {});
    throw error;
  }
}

export async function settleAiBudget(env, reservationId, usage) {
  const reservation = await env.DB.prepare(`SELECT reserved_micro_usd, max_input_tokens, max_output_tokens,
      input_usd_per_million, output_usd_per_million, status
    FROM ai_budget_reservations WHERE id=?1`).bind(reservationId).first();
  if (!reservation || reservation.status !== "reserved") throw new AuthError(503, "A reserva global de IA expirou ou já foi concluída.");
  const promptTokens = Number.isSafeInteger(usage?.promptTokens) && usage.promptTokens >= 0 ? usage.promptTokens : null;
  const totalTokens = Number.isSafeInteger(usage?.totalTokens) && usage.totalTokens >= 0 ? usage.totalTokens : null;
  const outputTokens = promptTokens !== null && totalTokens !== null ? totalTokens - promptTokens : null;
  const usableCounts = promptTokens !== null && totalTokens !== null && promptTokens <= reservation.max_input_tokens &&
    outputTokens >= 0 && outputTokens <= reservation.max_output_tokens;
  const actualMicroUsd = usableCounts
    ? Math.ceil(promptTokens * reservation.input_usd_per_million + outputTokens * reservation.output_usd_per_million)
    : reservation.reserved_micro_usd;
  const result = await env.DB.prepare(`UPDATE ai_budget_reservations SET status='completed', actual_micro_usd=?2,
      completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1 AND status='reserved'`)
    .bind(reservationId, actualMicroUsd).run();
  if (!result.meta?.changes) throw new AuthError(503, "Não foi possível concluir o registro do consumo global de IA.");
  return actualMicroUsd / 1_000_000;
}

export async function releaseAiBudgetReservation(env, reservationId) {
  await env.DB.prepare(`UPDATE ai_budget_reservations SET status='released'
    WHERE id=?1 AND status='reserved'`).bind(reservationId).run();
}
