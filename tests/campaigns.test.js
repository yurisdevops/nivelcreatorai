import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "../src/auth.js";
import { campaignsHandler, DEFAULT_CHECKLIST } from "../src/campaigns.js";

const account = { workspace_id: "workspace-a" };

function request(path, method, body) {
  return new Request(`https://app.example${path}`, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: "https://app.example", "content-type": "application/json", "sec-fetch-site": "same-origin" } });
}

function recordingDb(existing) {
  const calls = [];
  const statement = (sql) => ({
    bind(...params) {
      calls.push({ sql, params });
      return { run: async () => ({ meta: { changes: 1 } }), first: async () => existing };
    }
  });
  return { calls, prepare: statement };
}

test("new campaigns start as prospecting with the default recording checklist and a cleaned contact", async () => {
  const db = recordingDb();
  await campaignsHandler(request("/api/campaigns", "POST", { brand_name: "Natura", title: "Sérum",
    deliverables: ["1 Reels"], contact: { name: "Carla", email: "Carla@Natura.example", instagram: "@natura" } }),
  { DB: db }, "/api/campaigns", account);
  const [, , , brief, status] = db.calls[0].params;
  const saved = JSON.parse(brief);
  assert.equal(status, "prospecting");
  assert.deepEqual(saved.deliverables, [{ text: "1 Reels", done: false }]);
  assert.equal(saved.checklist.length, DEFAULT_CHECKLIST.length);
  assert.deepEqual(saved.contact, { name: "Carla", email: "carla@natura.example", instagram: "natura" });
});

test("checking a deliverable keeps the rest of the brief and legacy string items still load", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = recordingDb({ brand_name: "Natura", status: "in_progress", due_at: null,
    brief_json: JSON.stringify({ title: "Sérum", deliverables: ["1 Reels", "3 Stories"], notes: "briefing" }) });
  await campaignsHandler(request(`/api/campaigns/${id}`, "PUT", { deliverables: [{ text: "1 Reels", done: true }, { text: "3 Stories", done: false }] }),
    { DB: db }, `/api/campaigns/${id}`, account);
  const saved = JSON.parse(db.calls[1].params[1]);
  assert.deepEqual(saved.deliverables, [{ text: "1 Reels", done: true }, { text: "3 Stories", done: false }]);
  assert.equal(saved.notes, "briefing");
  assert.equal(saved.checklist.length, DEFAULT_CHECKLIST.length);
});

test("invalid contact data and unknown stages are rejected", async () => {
  const db = recordingDb();
  await assert.rejects(campaignsHandler(request("/api/campaigns", "POST", { brand_name: "A", title: "B", contact: { email: "sem-arroba" } }),
    { DB: db }, "/api/campaigns", account), AuthError);
  await assert.rejects(campaignsHandler(request("/api/campaigns", "POST", { brand_name: "A", title: "B", status: "won" }),
    { DB: db }, "/api/campaigns", account), AuthError);
});

test("campaign scripts are refused until the creator gives an opinion about the product", async () => {
  const { creativeHandler } = await import("../src/creative.js");
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ niche: "beleza", goals_json: "[]", voice: "natural", ai_data_consent_at: "2026-10-18" }) }) }) };
  const body = { campaign_id: "11111111-1111-4111-8111-111111111111", format: "Reels (vídeo curto)", opinion: { liked: "bom" } };
  await assert.rejects(creativeHandler(request("/api/creative/generate", "POST", body), { DB: db }, "/api/creative/generate", account),
    (error) => error instanceof AuthError && error.status === 400 && error.code === "opinion_required");
});

test("campaign routes are not swallowed by the calendar handler", async () => {
  const { calendarHandler } = await import("../src/calendar.js");
  assert.equal(await calendarHandler(request("/api/campaigns", "GET"), { DB: {} }, "/api/campaigns", account), null);
});

test("deleting calendar items and plans is scoped to the workspace", async () => {
  const { calendarHandler } = await import("../src/calendar.js");
  const { planningHandler } = await import("../src/planning.js");
  const id = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  const db = { prepare: (sql) => ({ bind: (...params) => { calls.push({ sql, params }); return { run: async () => ({ meta: { changes: 0 } }) }; } }) };
  await assert.rejects(calendarHandler(request(`/api/calendar/events/${id}`, "DELETE"), { DB: db }, `/api/calendar/events/${id}`, account),
    (error) => error instanceof AuthError && error.status === 404);
  await assert.rejects(planningHandler(request(`/api/plans/${id}`, "DELETE"), { DB: db }, `/api/plans/${id}`, account),
    (error) => error instanceof AuthError && error.status === 404);
  assert.ok(calls.every((call) => call.sql.includes("workspace_id=?2") && call.params[1] === account.workspace_id));
});

test("the AI checklist needs consent and stays inside the workspace", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const row = { id, brand_name: "Natura", status: "in_progress", due_at: null, created_at: "", brief_json: JSON.stringify({ title: "Sérum", notes: "Vídeo de 60s", deliverables: ["1 Reels"] }) };
  const db = { prepare: (sql) => ({ bind: (...params) => ({ first: async () => sql.includes("FROM campaigns") ? (params[1] === account.workspace_id ? row : null) : { ai_data_consent_at: null } }) }) };
  await assert.rejects(campaignsHandler(request(`/api/campaigns/${id}/checklist`, "POST", {}), { DB: db, GEMINI_API_KEY: "k" }, `/api/campaigns/${id}/checklist`, account),
    (error) => error instanceof AuthError && error.status === 403);
  await assert.rejects(campaignsHandler(request(`/api/campaigns/${id}/checklist`, "POST", {}), { DB: db }, `/api/campaigns/${id}/checklist`, { workspace_id: "other" }),
    (error) => error instanceof AuthError && error.status === 404);
});
