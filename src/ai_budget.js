import { AuthError } from "./auth.js";
import { reserveQuota, releaseQuotaReservation } from "./quota.js";

const MAX_INPUT_TOKENS = 64000;
const MAX_INPUT_BYTES = 64000;
const MAX_DAILY_BUDGET_USD = 100000;

function pricing(env) {
  const dailyUsd = Number(env.AI_DAILY_BUDGET_USD);
  const inputUsdPerMillion = Number(env.GEMINI_INPUT_USD_PER_MILLION);
  const outputUsdPerMillion = Number(env.GEMINI_OUTPUT_USD_PER_MILLION);
  if (!Number.isFinite(dailyUsd) || dailyUsd < 0 || dailyUsd > MAX_DAILY_BUDGET_USD ||
      !Number.isFinite(inputUsdPerMillion) || inputUsdPerMillion <= 0 ||
      !Number.isFinite(outputUsdPerMillion) || outputUsdPerMillion <= 0) {
    throw new AuthError(503, "O controle global de orçamento de IA não está configurado corretamente.");
  }
  return { budgetMicroUsd: Math.floor(dailyUsd * 1_000_000), inputUsdPerMillion, outputUsdPerMillion };
}

export function serializeAiRequest(payload) {
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > MAX_INPUT_BYTES) {
    throw new AuthError(413, "O contexto enviado à IA excede o limite técnico permitido.");
  }
  return body;
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

export async function reserveAiBudget(env, reservationId, maxOutputTokens) {
  if (!env.DB) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 8192) {
    throw new AuthError(500, "O limite de geração da IA está inválido.");
  }
  const { budgetMicroUsd, inputUsdPerMillion, outputUsdPerMillion } = pricing(env);
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

export async function reserveAiQuota(env, workspaceId, entitlement, operation, limit, maxOutputTokens) {
  const reservationId = await reserveQuota(env, workspaceId, entitlement, operation, limit);
  try {
    await reserveAiBudget(env, reservationId, maxOutputTokens);
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
  const outputTokens = usage?.promptTokens !== null && usage?.totalTokens !== null
    ? usage.totalTokens - usage.promptTokens : null;
  const usableCounts = usage?.promptTokens !== null && usage?.totalTokens !== null &&
    usage.promptTokens <= reservation.max_input_tokens && outputTokens >= 0 && outputTokens <= reservation.max_output_tokens;
  const actualMicroUsd = usableCounts
    ? Math.ceil(usage.promptTokens * reservation.input_usd_per_million + outputTokens * reservation.output_usd_per_million)
    : reservation.reserved_micro_usd;
  const result = await env.DB.prepare(`UPDATE ai_budget_reservations SET status='completed', actual_micro_usd=?2,
      completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1 AND status='reserved'`)
    .bind(reservationId, actualMicroUsd).run();
  if (!result.meta?.changes) throw new AuthError(503, "Não foi possível concluir o registro do consumo global de IA.");
  return actualMicroUsd / 1_000_000;
}
