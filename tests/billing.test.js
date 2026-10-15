import test from "node:test";
import assert from "node:assert/strict";
import { checkoutPayload, monthAfter, paymentWasReversed, receiveAsaasWebhook, validPixCheckoutPayment } from "../src/billing.js";

test("Pix checkout creates one detached payment and no recurring authorization", () => {
  const payload = checkoutPayload("https://creator.example", "nivel-creator-checkout:pix-1", "PIX", "2026-10-15");

  assert.deepEqual(payload.billingTypes, ["PIX"]);
  assert.deepEqual(payload.chargeTypes, ["DETACHED"]);
  assert.equal(payload.subscription, undefined);
  assert.match(payload.callback.successUrl, /pix-aguardando-webhook/);
  assert.equal(payload.items[0].value, 59.9);
  assert.match(payload.items[0].description, /avulso/);
});

test("card checkout remains monthly and recurring", () => {
  const payload = checkoutPayload("https://creator.example", "nivel-creator-checkout:card-1", "CREDIT_CARD", "2026-11-01");

  assert.deepEqual(payload.billingTypes, ["CREDIT_CARD"]);
  assert.deepEqual(payload.chargeTypes, ["RECURRENT"]);
  assert.deepEqual(payload.subscription, { cycle: "MONTHLY", nextDueDate: "2026-11-01" });
  assert.match(payload.callback.successUrl, /pagamento=aguardando-webhook/);
});

test("only a paid Pix detached checkout for exactly R$ 59,90 is accepted", () => {
  const valid = { status: "PAID", billingTypes: ["PIX"], chargeTypes: ["DETACHED"], items: [{ value: 59.9, quantity: 1 }] };
  assert.equal(validPixCheckoutPayment(valid), true);
  assert.equal(validPixCheckoutPayment({ ...valid, billingTypes: ["CREDIT_CARD"] }), false);
  assert.equal(validPixCheckoutPayment({ ...valid, chargeTypes: ["RECURRENT"] }), false);
  assert.equal(validPixCheckoutPayment({ ...valid, items: [{ value: 59.89, quantity: 1 }] }), false);
  assert.equal(validPixCheckoutPayment({ ...valid, items: [{ value: 5.99, quantity: 10 }] }), true);
  assert.equal(validPixCheckoutPayment({ ...valid, items: [{ value: 59.9, quantity: 0 }] }), false);
  assert.equal(validPixCheckoutPayment({ ...valid, status: "ACTIVE" }), false);
});

test("monthly billing period clamps month ends and preserves UTC time", () => {
  assert.equal(monthAfter("2025-01-31T15:30:00.000Z"), "2025-02-28T15:30:00.000Z");
  assert.equal(monthAfter("2024-01-31T15:30:00.000Z"), "2024-02-29T15:30:00.000Z");
  assert.equal(monthAfter("2026-10-15T12:00:00.000Z"), "2026-11-15T12:00:00.000Z");
});

test("reconciliation only treats completed refunds or chargebacks as reversals", () => {
  assert.equal(paymentWasReversed({ status: "RECEIVED", refunds: [{ status: "PENDING", value: 59.9 }] }), false);
  assert.equal(paymentWasReversed({ status: "RECEIVED", refunds: [{ status: "DONE", value: 10 }] }), true);
  assert.equal(paymentWasReversed({ status: "CHARGEBACK_REQUESTED" }), true);
});

function webhookEnvironment() {
  const state = { events: new Map(), jobs: new Map() };
  const db = {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("SELECT payload_hash FROM payment_events")) {
            const event = state.events.get(this.values[0]);
            return event ? { payload_hash: event.hash } : null;
          }
          return null;
        }
      };
    },
    async batch(statements) {
      for (const statement of statements) {
        if (statement.sql.includes("INSERT INTO payment_events")) {
          const [id, hash, payload] = statement.values;
          if (!state.events.has(id)) state.events.set(id, { hash, payload });
        } else if (statement.sql.includes("INSERT INTO jobs")) {
          const [, eventId] = statement.values;
          const event = state.events.get(eventId);
          if (event && !state.jobs.has(eventId)) state.jobs.set(eventId, event.payload);
        }
      }
      return statements.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return { DB: db, ASAAS_WEBHOOK_TOKEN: "a".repeat(40), state };
}

function webhookRequest(body, token = "a".repeat(40), method = "POST") {
  return new Request("https://app.example/webhooks/asaas", {
    method,
    headers: { "asaas-access-token": token, "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined
  });
}

test("Asaas webhook rejects missing or incorrect authentication before touching the database", async () => {
  const env = webhookEnvironment();
  const body = { id: "evt_123456", event: "PAYMENT_RECEIVED" };

  assert.equal((await receiveAsaasWebhook(webhookRequest(body, "wrong"), env)).status, 401);
  assert.equal((await receiveAsaasWebhook(webhookRequest(body, ""), { DB: env.DB })).status, 401);
  assert.equal(env.state.events.size, 0);
  assert.equal(env.state.jobs.size, 0);
});

test("Asaas webhook deduplicates identical events and rejects reused IDs with changed payloads", async () => {
  const env = webhookEnvironment();
  const event = { id: "evt_123456", event: "PAYMENT_RECEIVED", payment: { id: "pay_123", status: "RECEIVED" } };

  assert.equal((await receiveAsaasWebhook(webhookRequest(event), env)).status, 200);
  assert.equal((await receiveAsaasWebhook(webhookRequest(event), env)).status, 200);
  assert.equal(env.state.events.size, 1);
  assert.equal(env.state.jobs.size, 1);

  const changed = { ...event, payment: { ...event.payment, status: "REFUNDED" } };
  assert.equal((await receiveAsaasWebhook(webhookRequest(changed), env)).status, 409);
  assert.equal(env.state.events.size, 1);
  assert.equal(env.state.jobs.size, 1);
});

test("Asaas webhook persists only allowlisted provider fields for queued processing", async () => {
  const env = webhookEnvironment();
  const body = { id: "evt_abcdef", event: "PAYMENT_RECEIVED", secret: "must-not-be-stored",
    payment: { id: "pay_123", status: "RECEIVED", externalReference: "nivel-creator-checkout:x", access_token: "do-not-store" } };

  assert.equal((await receiveAsaasWebhook(webhookRequest(body), env)).status, 200);
  const persisted = JSON.parse(env.state.jobs.get(body.id));
  assert.equal(persisted.secret, undefined);
  assert.equal(persisted.payment.access_token, undefined);
  assert.deepEqual(persisted.payment, { id: "pay_123", status: "RECEIVED", externalReference: "nivel-creator-checkout:x" });
});

test("Asaas webhook rejects malformed event identifiers and non-POST requests", async () => {
  const env = webhookEnvironment();

  assert.equal((await receiveAsaasWebhook(webhookRequest({ id: "short", event: "PAYMENT_RECEIVED" }), env)).status, 400);
  assert.equal((await receiveAsaasWebhook(webhookRequest({}, "a".repeat(40), "GET"), env)).status, 405);
  assert.equal(env.state.events.size, 0);
});
