import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "../src/auth.js";
import { releaseQuotaReservation, reserveQuota } from "../src/quota.js";

function quotaEnvironment({ used = 0, reservations = [] } = {}) {
  const state = { used, reservations: [...reservations] };
  let writeTail = Promise.resolve();
  const write = (operation) => {
    const result = writeTail.then(operation);
    writeTail = result.then(() => undefined, () => undefined);
    return result;
  };

  const DB = {
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        run() {
          if (sql.includes("INSERT INTO quota_reservations")) {
            return write(() => {
              const [id, workspaceId, cycleKey, operation, limit] = this.values;
              const reserved = state.reservations.filter((row) => row.workspaceId === workspaceId &&
                row.cycleKey === cycleKey && row.operation === operation && row.status === "reserved").length;
              if (state.used + reserved >= limit) return { meta: { changes: 0 } };
              state.reservations.push({ id, workspaceId, cycleKey, operation, status: "reserved", createdAt: Date.now() });
              return { meta: { changes: 1 } };
            });
          }
          if (sql.includes("UPDATE quota_reservations SET status='released'")) {
            return write(() => {
              if (sql.includes("created_at <")) {
                const [workspaceId, operation] = this.values;
                const staleBefore = Date.now() - 10 * 60 * 1000;
                for (const row of state.reservations) {
                  if (row.workspaceId === workspaceId && row.operation === operation && row.status === "reserved" && row.createdAt < staleBefore) {
                    row.status = "released";
                  }
                }
                return { meta: { changes: 1 } };
              }
              const [id] = this.values;
              const row = state.reservations.find((item) => item.id === id && item.status === "reserved");
              if (!row) return { meta: { changes: 0 } };
              row.status = "released";
              return { meta: { changes: 1 } };
            });
          }
          throw new Error(`Unexpected quota SQL: ${sql}`);
        }
      };
    }
  };
  return { DB, state };
}

const entitlement = { cycleKey: "trial:2026-10-15T00:00:00.000Z", limit: 1, plan: "trial" };

test("simultaneous reservations cannot both consume the last quota unit", async () => {
  const env = quotaEnvironment();
  const attempts = await Promise.allSettled([
    reserveQuota(env, "workspace-a", entitlement, "script_generation"),
    reserveQuota(env, "workspace-a", entitlement, "script_generation")
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  const rejected = attempts.find((attempt) => attempt.status === "rejected");
  assert.ok(rejected.reason instanceof AuthError);
  assert.equal(rejected.reason.status, 429);
  assert.equal(env.state.reservations.filter((row) => row.status === "reserved").length, 1);
});

test("released reservations do not count against a later quota request", async () => {
  const env = quotaEnvironment();
  const first = await reserveQuota(env, "workspace-a", entitlement, "script_generation");
  await releaseQuotaReservation(env, first);
  const second = await reserveQuota(env, "workspace-a", entitlement, "script_generation");

  assert.notEqual(second, first);
  assert.equal(env.state.reservations.find((row) => row.id === first).status, "released");
  assert.equal(env.state.reservations.find((row) => row.id === second).status, "reserved");
});

test("abandoned reservations older than ten minutes stop blocking quota", async () => {
  const env = quotaEnvironment({ reservations: [{ id: "stale", workspaceId: "workspace-a",
    cycleKey: entitlement.cycleKey, operation: "script_generation", status: "reserved",
    createdAt: Date.now() - 11 * 60 * 1000 }] });

  const next = await reserveQuota(env, "workspace-a", entitlement, "script_generation");

  assert.equal(env.state.reservations.find((row) => row.id === "stale").status, "released");
  assert.equal(env.state.reservations.find((row) => row.id === next).status, "reserved");
});
