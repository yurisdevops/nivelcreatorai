import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "../src/auth.js";
import { accountDataHandler } from "../src/account_data.js";
import { calendarHandler } from "../src/calendar.js";
import { campaignsHandler } from "../src/campaigns.js";
import { filesHandler } from "../src/files.js";

const workspaceA = "workspace-a";
const workspaceB = "workspace-b";
const eventB = "22222222-2222-4222-8222-222222222222";
const scriptB = "33333333-3333-4333-8333-333333333333";
const campaignB = "44444444-4444-4444-8444-444444444444";
const fileB = "55555555-5555-4555-8555-555555555555";
const accountA = { workspace_id: workspaceA, auth_subject: "auth-user-a", email: "a@example.com" };

function tenantDatabase() {
  const rows = {
    calendar_events: [{ id: eventB, workspace_id: workspaceB, status: "idea", title: "Conteúdo privado de B" }],
    scripts: [{ id: scriptB, workspace_id: workspaceB }],
    campaigns: [{ id: campaignB, workspace_id: workspaceB, brand_name: "Marca privada de B",
      brief_json: JSON.stringify({ title: "Campanha privada de B", deliverables: [], notes: "" }), status: "draft", due_at: null }],
    files: [{ id: fileB, workspace_id: workspaceB, r2_key: `private/${workspaceB}/${fileB}`,
      display_name: "arquivo privado.pdf", content_type: "application/pdf", byte_size: 100, sha256: "private-hash" }],
    metric_snapshots: [], strategies: [], editorial_plans: [], agent_messages: [], notifications: [],
    trials: [], subscriptions: [], instagram_connections: []
  };
  const effects = { queries: [], mutations: [], batch: [], filesRead: [], filesDeleted: [] };

  function tableIn(sql) {
    return sql.match(/\bFROM\s+([a-z_]+)/i)?.[1] || sql.match(/\bUPDATE\s+([a-z_]+)/i)?.[1] || null;
  }
  function withinWorkspace(sql, params, row) {
    const workspaceBinding = sql.match(/workspace_id\s*=\s*\?(\d+)/i);
    return !workspaceBinding || row.workspace_id === params[Number(workspaceBinding[1]) - 1];
  }

  return {
    rows,
    effects,
    prepare(sql) {
      const statement = {
        params: [],
        bind(...params) { this.params = params; return this; },
        async first() {
          effects.queries.push({ sql, params: this.params });
          const table = tableIn(sql);
          const idBinding = sql.match(/WHERE\s+id\s*=\s*\?(\d+)/i);
          if (table && idBinding) {
            return (rows[table] || []).find((row) => row.id === this.params[Number(idBinding[1]) - 1] && withinWorkspace(sql, this.params, row)) || null;
          }
          const authBinding = sql.match(/WHERE\s+auth_subject\s*=\s*\?(\d+)/i);
          if (table === "users" && authBinding) return null;
          return null;
        },
        async all() {
          effects.queries.push({ sql, params: this.params });
          const table = tableIn(sql);
          const source = rows[table] || [];
          const workspaceBinding = sql.match(/workspace_id\s*=\s*\?(\d+)/i);
          const results = workspaceBinding
            ? source.filter((row) => row.workspace_id === this.params[Number(workspaceBinding[1]) - 1])
            : [...source];
          return { results };
        },
        async run() {
          effects.mutations.push({ sql, params: this.params });
          const table = tableIn(sql);
          const idBinding = sql.match(/WHERE\s+id\s*=\s*\?(\d+)/i);
          const row = idBinding && (rows[table] || []).find((item) => item.id === this.params[Number(idBinding[1]) - 1] && withinWorkspace(sql, this.params, item));
          return { meta: { changes: row ? 1 : 0 } };
        }
      };
      return statement;
    },
    async batch(statements) { effects.batch.push(statements); return statements.map(() => ({ meta: { changes: 1 } })); }
  };
}

function jsonRequest(path, method, body) {
  return new Request(`https://app.example${path}`, {
    method,
    headers: { origin: "https://app.example", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function assertNotFound(operation) {
  await assert.rejects(operation, (error) => error instanceof AuthError && error.status === 404);
}

test("workspace A cannot edit workspace B calendar events or link B scripts", async () => {
  const db = tenantDatabase();
  await assertNotFound(calendarHandler(jsonRequest(`/api/calendar/events/${eventB}`, "PUT", { title: "Alterado" }), { DB: db },
    `/api/calendar/events/${eventB}`, accountA));
  await assertNotFound(calendarHandler(jsonRequest("/api/calendar/events", "POST", {
    title: "Novo conteúdo", script_id: scriptB
  }), { DB: db }, "/api/calendar/events", accountA));
  assert.equal(db.effects.mutations.length, 0);
});

test("workspace A cannot change a campaign belonging to workspace B", async () => {
  const db = tenantDatabase();
  await assertNotFound(campaignsHandler(jsonRequest(`/api/campaigns/${campaignB}`, "PUT", { title: "Alterado" }), { DB: db },
    `/api/campaigns/${campaignB}`, accountA));
  assert.equal(db.effects.mutations.length, 0);
});

test("workspace A cannot download or delete a file belonging to workspace B", async () => {
  const db = tenantDatabase();
  const files = {
    get: async (key) => { db.effects.filesRead.push(key); return { size: 100, body: new Uint8Array([1]) }; },
    delete: async (key) => { db.effects.filesDeleted.push(key); }
  };
  await assertNotFound(filesHandler(new Request(`https://app.example/api/files/${fileB}/content`), { DB: db, FILES: files },
    `/api/files/${fileB}/content`, accountA));
  await assertNotFound(filesHandler(jsonRequest(`/api/files/${fileB}`, "DELETE", { confirm: true }), { DB: db, FILES: files },
    `/api/files/${fileB}`, accountA));
  assert.deepEqual(db.effects.filesRead, []);
  assert.deepEqual(db.effects.filesDeleted, []);
  assert.equal(db.effects.batch.length, 0);
});

test("workspace export does not include records from another workspace", async () => {
  const db = tenantDatabase();
  const result = await accountDataHandler(new Request("https://app.example/api/account/export"), { DB: db }, "/api/account/export", accountA);
  assert.deepEqual(result.export.scripts, []);
  assert.deepEqual(result.export.campaigns, []);
  assert.deepEqual(result.export.files_metadata, []);
  assert.deepEqual(result.export.calendar_events, []);
  assert.equal(JSON.stringify(result.export).includes("privado de B"), false);
  assert.equal(db.effects.queries.some(({ sql, params }) => /FROM\s+(scripts|campaigns|files|calendar_events)\b/i.test(sql) &&
    !/workspace_id\s*=\s*\?/i.test(sql) && params.length), false);
});
