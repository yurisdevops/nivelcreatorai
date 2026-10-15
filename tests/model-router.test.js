import test from "node:test";
import assert from "node:assert/strict";
import { reserveAiBudget } from "../src/ai_budget.js";
import { resolveGeminiRoute } from "../src/model_router.js";

test("routes simple agent work to Flash-Lite and complex creative work to Flash", () => {
  const env = {};
  assert.deepEqual(resolveGeminiRoute(env, "simple"), {
    provider: "gemini", tier: "simple", model: "gemini-3.5-flash-lite"
  });
  assert.deepEqual(resolveGeminiRoute(env, "complex"), {
    provider: "gemini", tier: "complex", model: "gemini-3.8-flash"
  });
});

test("route configuration is validated and retains the legacy complex model fallback", () => {
  assert.equal(resolveGeminiRoute({ GEMINI_MODEL: "gemini-custom" }, "complex").model, "gemini-custom");
  assert.equal(resolveGeminiRoute({ GEMINI_SIMPLE_MODEL: "invalid/model" }, "simple").model, "gemini-3.5-flash-lite");
  assert.equal(resolveGeminiRoute({ GEMINI_COMPLEX_MODEL: "gemini-3.7-flash", GEMINI_MODEL: "legacy" }).model, "gemini-3.7-flash");
});

test("simple model budget reservation stores its own configured input and output rates", async () => {
  let insertValues;
  const env = {
    AI_DAILY_BUDGET_USD: "10",
    GEMINI_INPUT_USD_PER_MILLION: "1.5",
    GEMINI_OUTPUT_USD_PER_MILLION: "7.5",
    DB: {
      prepare(sql) {
        return {
          bind(...values) { if (sql.includes("INSERT INTO ai_budget_reservations")) insertValues = values; return this; },
          async run() { return { meta: { changes: 1 } }; }
        };
      }
    }
  };

  await reserveAiBudget(env, "reservation-simple", 900, "simple");
  assert.equal(insertValues[4], 0.30);
  assert.equal(insertValues[5], 2.50);
  assert.equal(insertValues[1], Math.ceil(64_000 * 0.30 + 900 * 2.50));
});

test("custom simple model cannot reserve against the default model prices", async () => {
  const env = {
    AI_DAILY_BUDGET_USD: "10",
    GEMINI_SIMPLE_MODEL: "gemini-custom-lite",
    GEMINI_INPUT_USD_PER_MILLION: "1.5",
    GEMINI_OUTPUT_USD_PER_MILLION: "7.5",
    DB: { prepare() { throw new Error("budget should reject before database access"); } }
  };

  await assert.rejects(reserveAiBudget(env, "reservation-custom", 900, "simple"),
    (error) => error.status === 503 && /tarifas de entrada e saída/.test(error.message));
});
