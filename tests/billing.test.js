import test from "node:test";
import assert from "node:assert/strict";
import { checkoutPayload, monthAfter, validPixCheckoutPayment } from "../src/billing.js";

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
