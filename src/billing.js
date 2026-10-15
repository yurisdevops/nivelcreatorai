import { AuthError, assertSameOrigin, readJson } from "./auth.js";

const ASAAS_API = "https://api-sandbox.asaas.com/v3";
const CHECKOUT_LINK = "https://asaas.com/checkoutSession/show?id=";
const PRICE = 59.9;
const PRODUCT_REFERENCE = "nivel-creator-checkout:";

async function asaasRequest(env, path, options = {}) {
  if (!env.ASAAS_API_KEY) throw new AuthError(503, "A cobrança em sandbox ainda não está configurada.");
  return fetch(`${ASAAS_API}${path}`, {
    ...options,
    headers: { accept: "application/json", "content-type": "application/json", access_token: env.ASAAS_API_KEY, ...(options.headers || {}) },
    redirect: "error", signal: AbortSignal.timeout(12000)
  });
}

function dueDateFor(account) {
  const today = new Date();
  const minimum = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)).toISOString().slice(0, 10);
  const trialDate = account.trial_ends_at
    ? new Date(new Date(account.trial_ends_at).getTime() + 86400000).toISOString().slice(0, 10)
    : minimum;
  return trialDate > minimum ? trialDate : minimum;
}

export function monthAfter(dateValue) {
  const source = new Date(dateValue);
  if (!Number.isFinite(source.getTime())) return new Date(Date.now() + 30 * 86400000).toISOString();
  const day = source.getUTCDate();
  const end = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 1));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  end.setUTCHours(source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds());
  return end.toISOString();
}

export function validPixCheckoutPayment(checkout) {
  if (checkout?.status !== "PAID" || !Array.isArray(checkout?.billingTypes) || !checkout.billingTypes.includes("PIX") ||
      !Array.isArray(checkout?.chargeTypes) || !checkout.chargeTypes.includes("DETACHED") ||
      !Array.isArray(checkout.items) || !checkout.items.length) return false;
  const cents = checkout.items.reduce((total, item) => {
    const value = Number(item?.value);
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return NaN;
    return total + Math.round(value * 100) * quantity;
  }, 0);
  return cents === Math.round(PRICE * 100);
}

export function checkoutPayload(origin, externalReference, billingType, firstDueDate) {
  const recurring = billingType === "CREDIT_CARD";
  const successCode = recurring ? "aguardando-webhook" : "pix-aguardando-webhook";
  return {
    billingTypes: [billingType],
    chargeTypes: [recurring ? "RECURRENT" : "DETACHED"],
    minutesToExpire: 1440,
    externalReference,
    callback: {
      successUrl: `${origin}/?pagamento=${successCode}`,
      cancelUrl: `${origin}/?pagamento=cancelado`,
      expiredUrl: `${origin}/?pagamento=expirado`
    },
    items: [{ name: "Nivel Creator AI", description: recurring ? "Assinatura mensal recorrente" : "Acesso por um ciclo mensal, pagamento avulso", quantity: 1, value: PRICE }],
    ...(recurring ? { subscription: { cycle: "MONTHLY", nextDueDate: firstDueDate } } : {})
  };
}

async function createCheckout(request, env, account, billingType = "CREDIT_CARD") {
  if (!env.ASAAS_API_KEY || !env.ASAAS_WEBHOOK_TOKEN) throw new AuthError(503, "Configure a chave e o token do webhook do Asaas sandbox antes de habilitar cobrança.");
  if (!env.DB) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
  assertSameOrigin(request);
  const body = await readJson(request);
  const recurring = billingType === "CREDIT_CARD";
  if (recurring && body.accept_recurring !== true) throw new AuthError(400, "Confirme a recorrência mensal antes de abrir o checkout.");
  if (!recurring && body.accept_one_time !== true) throw new AuthError(400, "Confirme que o Pix é um pagamento avulso, sem renovação automática.");
  const existingSubscription = await env.DB.prepare(`SELECT status, period_end FROM subscriptions WHERE workspace_id=?1`)
    .bind(account.workspace_id).first();
  const paidPeriodEnd = Date.parse(existingSubscription?.period_end || "");
  const hasPaidAccess = (existingSubscription?.status === "active" && paidPeriodEnd > Date.now()) ||
    (["canceled", "past_due"].includes(existingSubscription?.status) &&
      paidPeriodEnd + (existingSubscription.status === "past_due" ? 72 * 60 * 60 * 1000 : 0) > Date.now());
  if (hasPaidAccess) {
    throw new AuthError(409, "Você já tem uma assinatura com acesso vigente.");
  }
  const existing = await env.DB.prepare(`SELECT id, checkout_url, first_due_date, created_at, billing_type FROM billing_checkout_intents
    WHERE workspace_id=?1 AND status='pending' ORDER BY created_at DESC LIMIT 1`).bind(account.workspace_id).first();
  if (existing && existing.billing_type !== billingType) {
    throw new AuthError(409, "Existe um checkout pendente de outra modalidade. Retome esse checkout ou aguarde a expiração.");
  }
  if (existing?.checkout_url && Date.now() - Date.parse(existing.created_at) < 24 * 60 * 60 * 1000) {
    return { checkout_url: existing.checkout_url, first_due_date: existing.first_due_date, price: PRICE, reused: true };
  }
  if (existing && !existing.checkout_url && Date.now() - Date.parse(existing.created_at) < 10 * 60 * 1000) {
    throw new AuthError(409, "A preparação do checkout já está em andamento. Aguarde alguns minutos.");
  }
  const latest = await env.DB.prepare(`SELECT id, status FROM billing_checkout_intents WHERE workspace_id=?1
    ORDER BY created_at DESC LIMIT 1`).bind(account.workspace_id).first();
  if (latest?.status === "paid" && existingSubscription?.status === "pending" && existingSubscription.checkout_intent_id === latest.id) {
    throw new AuthError(409, "O pagamento foi confirmado e a assinatura está sendo sincronizada. Atualize esta página em instantes.");
  }
  if (existing) await env.DB.prepare(`UPDATE billing_checkout_intents SET status='expired', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=?1 AND status='pending'`).bind(existing.id).run();

  const intentId = crypto.randomUUID();
  const externalReference = `${PRODUCT_REFERENCE}${intentId}`;
  const firstDueDate = recurring ? dueDateFor(account) : new Date().toISOString().slice(0, 10);
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO billing_checkout_intents
        (id, workspace_id, external_reference, billing_type, first_due_date, status)
        VALUES (?1, ?2, ?3, ?4, ?5, 'pending')`).bind(intentId, account.workspace_id, externalReference, billingType, firstDueDate),
      env.DB.prepare(`INSERT INTO subscriptions (id, workspace_id, provider_id, status, checkout_intent_id)
        VALUES (?1, ?2, ?3, 'pending', ?4)
        ON CONFLICT(workspace_id) DO UPDATE SET provider_id=excluded.provider_id, status='pending',
          period_start=NULL, period_end=NULL, cancel_at_period_end=0, checkout_intent_id=excluded.checkout_intent_id`)
        .bind(crypto.randomUUID(), account.workspace_id, `checkout:${intentId}`, intentId)
    ]);
  } catch {
    const competing = await env.DB.prepare(`SELECT checkout_url, first_due_date, billing_type FROM billing_checkout_intents
      WHERE workspace_id=?1 AND status='pending' ORDER BY created_at DESC LIMIT 1`).bind(account.workspace_id).first();
    if (competing && competing.billing_type !== billingType) {
      throw new AuthError(409, "Existe um checkout pendente de outra modalidade. Retome esse checkout ou aguarde a expiração.");
    }
    if (competing?.checkout_url) return { checkout_url: competing.checkout_url, first_due_date: competing.first_due_date, price: PRICE, reused: true };
    throw new AuthError(409, "Já existe um checkout sendo preparado. Aguarde alguns minutos e tente novamente.");
  }

  const payload = checkoutPayload(new URL(request.url).origin, externalReference, billingType, firstDueDate);
  let result;
  try {
    result = await asaasRequest(env, "/checkouts", { method: "POST", body: JSON.stringify(payload) });
  } catch {
    throw new AuthError(503, "O Asaas sandbox está indisponível. Nenhum acesso pago foi ativado.");
  }
  if (!result.ok) {
    await env.DB.prepare(`UPDATE billing_checkout_intents SET status='failed', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1 AND status='pending'`)
      .bind(intentId).run();
    await env.DB.prepare(`UPDATE subscriptions SET status='expired' WHERE checkout_intent_id=?1 AND status='pending'`).bind(intentId).run();
    throw new AuthError(502, "Não foi possível criar o checkout no Asaas sandbox.");
  }
  const checkout = await result.json();
  if (typeof checkout.id !== "string" || checkout.id.length > 120) throw new AuthError(502, "O Asaas não retornou um checkout válido.");
  const checkoutUrl = `${CHECKOUT_LINK}${encodeURIComponent(checkout.id)}`;
  await env.DB.prepare(`UPDATE billing_checkout_intents SET provider_checkout_id=?1, checkout_url=?2,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?3 AND status='pending'`)
    .bind(checkout.id, checkoutUrl, intentId).run();
  return { checkout_url: checkoutUrl, first_due_date: firstDueDate, price: PRICE, reused: false };
}

async function cancelSubscription(request, env, account) {
  if (!env.DB) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
  assertSameOrigin(request);
  const body = await readJson(request);
  if (body.confirm_cancel !== true) throw new AuthError(400, "Confirme o cancelamento da renovação.");
  const subscription = await env.DB.prepare(`SELECT s.id, s.provider_id, s.status, s.period_end, i.billing_type
    FROM subscriptions s LEFT JOIN billing_checkout_intents i ON i.id=s.checkout_intent_id WHERE s.workspace_id=?1`)
    .bind(account.workspace_id).first();
  if (!subscription || subscription.billing_type === "PIX" || !["active", "past_due"].includes(subscription.status) || subscription.provider_id.startsWith("checkout:")) {
    throw new AuthError(409, "Não há uma assinatura ativa para cancelar.");
  }
  let result;
  try { result = await asaasRequest(env, `/subscriptions/${encodeURIComponent(subscription.provider_id)}`, { method: "DELETE" }); }
  catch { throw new AuthError(503, "O Asaas não respondeu ao pedido. A renovação continua ativa até a confirmação do cancelamento."); }
  if (!result.ok && result.status !== 404) throw new AuthError(502, "O Asaas não confirmou o cancelamento. A renovação continua ativa.");
  await env.DB.batch([
    env.DB.prepare(`UPDATE subscriptions SET status='canceled', cancel_at_period_end=1
      WHERE workspace_id=?1 AND provider_id=?2`).bind(account.workspace_id, subscription.provider_id),
    env.DB.prepare(`INSERT INTO audit_logs (id, workspace_id, actor_user_id, action, target_type, target_id, metadata_json)
      VALUES (?1, ?2, ?3, 'subscription.canceled', 'subscription', ?4, ?5)`)
      .bind(crypto.randomUUID(), account.workspace_id, account.auth_subject, subscription.provider_id,
        JSON.stringify({ provider: "asaas", access_until: subscription.period_end || null }))
  ]);
  return { canceled: true, access_until: subscription.period_end };
}

function safeWebhookPayload(body) {
  const payload = { id: body.id, event: body.event, dateCreated: body.dateCreated };
  if (body.checkout && typeof body.checkout === "object") {
    const checkout = body.checkout;
    payload.checkout = {
      id: checkout.id, status: checkout.status, externalReference: checkout.externalReference,
      customer: checkout.customer,
      billingTypes: Array.isArray(checkout.billingTypes) ? checkout.billingTypes.filter((type) => ["PIX", "CREDIT_CARD"].includes(type)) : undefined,
      chargeTypes: Array.isArray(checkout.chargeTypes) ? checkout.chargeTypes.filter((type) => ["DETACHED", "RECURRENT", "INSTALLMENT"].includes(type)) : undefined,
      items: Array.isArray(checkout.items) ? checkout.items.slice(0, 10).map((item) => ({ name: item.name, value: item.value, quantity: item.quantity })) : undefined
    };
  }
  if (body.subscription && typeof body.subscription === "object") {
    const sub = body.subscription;
    payload.subscription = { id: sub.id, customer: sub.customer, status: sub.status, value: sub.value,
      nextDueDate: sub.nextDueDate, cycle: sub.cycle, billingType: sub.billingType,
      externalReference: sub.externalReference, deleted: sub.deleted };
  }
  if (body.payment && typeof body.payment === "object") {
    const payment = body.payment;
    payload.payment = { id: payment.id, subscription: payment.subscription, status: payment.status, value: payment.value,
      dueDate: payment.dueDate, paymentDate: payment.paymentDate, confirmedDate: payment.confirmedDate,
      externalReference: payment.externalReference };
  }
  return payload;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tokenMatches(expected, received) {
  if (typeof received !== "string" || received.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return mismatch === 0;
}

export async function receiveAsaasWebhook(request, env) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const expected = env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || expected.length < 32 || !tokenMatches(expected, request.headers.get("asaas-access-token") || "")) {
    return new Response(null, { status: 401 });
  }
  if (!env.DB) return new Response(null, { status: 503 });
  let body;
  try { body = await readJson(request, 32768); } catch { return new Response(null, { status: 400 }); }
  if (typeof body.id !== "string" || body.id.length < 6 || body.id.length > 200 || typeof body.event !== "string" || body.event.length > 100) {
    return new Response(null, { status: 400 });
  }
  const payload = safeWebhookPayload(body);
  const serialized = JSON.stringify(payload);
  const hash = await sha256(JSON.stringify(body));
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO payment_events (provider_event_id, payload_hash, payload_json)
        VALUES (?1, ?2, ?3) ON CONFLICT(provider_event_id) DO NOTHING`).bind(body.id, hash, serialized),
      env.DB.prepare(`INSERT INTO jobs (id, workspace_id, kind, idempotency_key, status, payload_json)
        SELECT ?1, NULL, 'asaas_webhook', ?2, 'queued', payload_json FROM payment_events
        WHERE provider_event_id=?2 AND payload_json IS NOT NULL ON CONFLICT(idempotency_key) DO NOTHING`)
        .bind(id, body.id)
    ]);
    const saved = await env.DB.prepare("SELECT payload_hash FROM payment_events WHERE provider_event_id=?1").bind(body.id).first();
    if (!saved || saved.payload_hash !== hash) return new Response(null, { status: 409 });
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}

async function processWebhookEvent(env, event) {
  const db = env.DB;
  if (["CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"].includes(event.event) && event.checkout) {
    const checkout = event.checkout;
    let intent = checkout.externalReference
      ? await db.prepare("SELECT * FROM billing_checkout_intents WHERE external_reference=?1").bind(checkout.externalReference).first() : null;
    if (!intent && checkout.id) intent = await db.prepare("SELECT * FROM billing_checkout_intents WHERE provider_checkout_id=?1").bind(checkout.id).first();
    if (!intent) return checkout.externalReference?.startsWith(PRODUCT_REFERENCE) ? "retry" : "ignored";
    if (event.event === "CHECKOUT_PAID") {
      if (checkout.status !== "PAID") return "retry";
      if (!['pending', 'paid'].includes(intent.status)) return "ignored";
      const customerId = typeof checkout.customer === "string" ? checkout.customer : null;
      if (intent.billing_type === "PIX") {
        if (!validPixCheckoutPayment(checkout)) return "ignored";
        const periodStart = new Date().toISOString();
        const periodEnd = monthAfter(periodStart);
        await db.batch([
          db.prepare(`UPDATE billing_checkout_intents SET status='paid', provider_customer_id=COALESCE(?1,provider_customer_id),
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND status='pending'`)
            .bind(customerId, intent.id),
          db.prepare(`UPDATE subscriptions SET provider_id=?1, status='active', period_start=?2, period_end=?3,
            cancel_at_period_end=0 WHERE checkout_intent_id=?4 AND provider_id=?5 AND status='pending'`)
            .bind(`pix:${intent.id}`, periodStart, periodEnd, intent.id, `checkout:${intent.id}`)
        ]);
        return "processed";
      }
      await db.prepare(`UPDATE billing_checkout_intents SET status='paid', provider_customer_id=COALESCE(?1,provider_customer_id),
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND status IN ('pending','paid')`)
        .bind(customerId, intent.id).run();
      return "processed";
    }
    const nextStatus = event.event === "CHECKOUT_CANCELED" ? "canceled" : "expired";
    await db.batch([
      db.prepare(`UPDATE billing_checkout_intents SET status=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?2 AND status='pending'`).bind(nextStatus, intent.id),
      db.prepare("UPDATE subscriptions SET status='expired' WHERE checkout_intent_id=?1 AND status='pending'").bind(intent.id)
    ]);
    return "processed";
  }

  if (event.event.startsWith("SUBSCRIPTION_") && event.subscription) {
    const subscription = event.subscription;
    let intent = subscription.externalReference
      ? await db.prepare("SELECT * FROM billing_checkout_intents WHERE external_reference=?1").bind(subscription.externalReference).first() : null;
    if (!intent && subscription.customer) intent = await db.prepare(`SELECT * FROM billing_checkout_intents
      WHERE provider_customer_id=?1 ORDER BY created_at DESC LIMIT 1`).bind(subscription.customer).first();
    if (!intent) return subscription.externalReference?.startsWith(PRODUCT_REFERENCE) ? "retry" : "ignored";
    if ((subscription.value !== undefined && Math.round(Number(subscription.value) * 100) !== 5990) ||
        (subscription.cycle && subscription.cycle !== "MONTHLY")) return "ignored";
    const isDeleted = event.event === "SUBSCRIPTION_DELETED" || subscription.deleted === true;
    const providerActive = subscription.status === "ACTIVE";
    const providerInactive = ["INACTIVE", "EXPIRED", "DELETED"].includes(subscription.status);
    const status = isDeleted || providerInactive ? "canceled" : ["canceled", "expired", "failed"].includes(intent.status)
      ? "expired" : intent.status === "paid" && providerActive ? "active" : "pending";
    const periodStart = intent.first_due_date ? `${intent.first_due_date}T00:00:00.000Z` : null;
    const periodEnd = periodStart ? monthAfter(periodStart) : null;
    await db.batch([
      db.prepare(`UPDATE billing_checkout_intents SET provider_subscription_id=COALESCE(?1,provider_subscription_id),
        provider_customer_id=COALESCE(?2,provider_customer_id),
        status=CASE WHEN ?4=1 THEN 'canceled' WHEN ?5=1 AND status='pending' THEN 'expired' ELSE status END,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?3`)
        .bind(subscription.id || null, subscription.customer || null, intent.id, isDeleted ? 1 : 0, providerInactive ? 1 : 0),
      db.prepare(`UPDATE subscriptions SET provider_id=?1, status=?2, period_start=COALESCE(period_start,?3),
        period_end=COALESCE(period_end,?4), checkout_intent_id=?5 WHERE workspace_id=?6 AND checkout_intent_id=?5`)
        .bind(subscription.id, status, periodStart, periodEnd, intent.id, intent.workspace_id)
    ]);
    return "processed";
  }

  if (event.payment) {
    const payment = event.payment;
    if (!payment.subscription) {
      if (typeof payment.externalReference !== "string" || !payment.externalReference.startsWith(PRODUCT_REFERENCE)) return "ignored";
      const intent = await db.prepare(`SELECT id, billing_type FROM billing_checkout_intents WHERE external_reference=?1`)
        .bind(payment.externalReference).first();
      if (!intent || intent.billing_type !== "PIX") return "ignored";
      if (["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_RECEIVED_IN_CASH_UNDONE"].includes(event.event)) {
        await db.prepare(`UPDATE subscriptions SET status='suspended' WHERE checkout_intent_id=?1 AND provider_id=?2`)
          .bind(intent.id, `pix:${intent.id}`).run();
        return "processed";
      }
      return "ignored";
    }
    const current = await db.prepare(`SELECT s.workspace_id, s.status, s.period_start, i.status AS intent_status
      FROM subscriptions s LEFT JOIN billing_checkout_intents i ON i.id=s.checkout_intent_id WHERE s.provider_id=?1`)
      .bind(payment.subscription).first();
    if (!current) return "retry";
    if (["canceled", "expired", "failed"].includes(current.intent_status)) return "ignored";
    if (event.event === "PAYMENT_RECEIVED" || event.event === "PAYMENT_CONFIRMED") {
      const date = payment.paymentDate || payment.confirmedDate || payment.dueDate || event.dateCreated;
      const periodStart = Number.isFinite(Date.parse(date || "")) ? new Date(date).toISOString() : new Date().toISOString();
      const periodEnd = monthAfter(periodStart);
      await db.prepare(`UPDATE subscriptions SET status='active', period_start=?1, period_end=?2,
        cancel_at_period_end=0 WHERE provider_id=?3 AND (period_start IS NULL OR period_start<?1)`)
        .bind(periodStart, periodEnd, payment.subscription).run();
      return "processed";
    }
    if (event.event === "PAYMENT_OVERDUE") {
      await db.prepare(`UPDATE subscriptions SET status='past_due' WHERE provider_id=?1 AND status IN ('active','past_due')
        AND period_end IS NOT NULL AND julianday(period_end)<=julianday('now')`).bind(payment.subscription).run();
      return "processed";
    }
    if (["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_RECEIVED_IN_CASH_UNDONE"].includes(event.event)) {
      await db.prepare("UPDATE subscriptions SET status='suspended' WHERE provider_id=?1").bind(payment.subscription).run();
      return "processed";
    }
    return "ignored";
  }
  return "ignored";
}

export async function processAsaasQueue(env) {
  if (!env.DB) return;
  await env.DB.batch([
    env.DB.prepare(`UPDATE payment_events SET payload_json=NULL
      WHERE payload_json IS NOT NULL AND received_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
        AND provider_event_id IN (SELECT idempotency_key FROM jobs
          WHERE kind='asaas_webhook' AND status IN ('completed','failed')
            AND updated_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'))`),
    env.DB.prepare(`UPDATE jobs SET payload_json='{}'
      WHERE kind='asaas_webhook' AND status IN ('completed','failed')
        AND updated_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') AND payload_json<>'{}'`)
  ]);
  const { results } = await env.DB.prepare(`SELECT id, idempotency_key, payload_json, attempts FROM jobs
    WHERE kind='asaas_webhook' AND status='queued' ORDER BY created_at LIMIT 20`).all();
  for (const job of results || []) {
    const claim = await env.DB.prepare(`UPDATE jobs SET status='running', attempts=attempts+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=?1 AND status='queued'`).bind(job.id).run();
    if (!claim.meta?.changes) continue;
    try {
      const outcome = await processWebhookEvent(env, JSON.parse(job.payload_json));
      if (outcome === "retry" && job.attempts < 47) {
        await env.DB.prepare(`UPDATE jobs SET status='queued', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1`)
          .bind(job.id).run();
        continue;
      }
      if (outcome === "retry") {
        await env.DB.prepare(`UPDATE jobs SET status='failed', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1`)
          .bind(job.id).run();
        continue;
      }
      await env.DB.batch([
        env.DB.prepare(`UPDATE jobs SET status='completed', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1`).bind(job.id),
        env.DB.prepare(`UPDATE payment_events SET processed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE provider_event_id=?1`).bind(job.idempotency_key)
      ]);
    } catch {
      const status = job.attempts >= 47 ? "failed" : "queued";
      await env.DB.prepare(`UPDATE jobs SET status=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2`)
        .bind(status, job.id).run();
    }
  }
}

export async function billingHandler(request, env, path, account) {
  if (path === "/api/billing/status" && request.method === "GET") {
    if (!env.DB) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
    const [subscription, intent] = await Promise.all([
      env.DB.prepare(`SELECT s.status, s.period_start, s.period_end, s.cancel_at_period_end, i.billing_type
        FROM subscriptions s LEFT JOIN billing_checkout_intents i ON i.id=s.checkout_intent_id WHERE s.workspace_id=?1`).bind(account.workspace_id).first(),
      env.DB.prepare(`SELECT status, billing_type, checkout_url, first_due_date, created_at FROM billing_checkout_intents
        WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 1`).bind(account.workspace_id).first()
    ]);
    return { subscription: subscription || null, checkout: intent || null,
      configured: Boolean(env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN) };
  }
  if (path === "/api/billing/checkout" && request.method === "POST") return createCheckout(request, env, account, "CREDIT_CARD");
  if (path === "/api/billing/pix-checkout" && request.method === "POST") return createCheckout(request, env, account, "PIX");
  if (path === "/api/billing/checkout" && request.method !== "POST") throw new AuthError(405, "Método não permitido.");
  if (path === "/api/billing/cancel" && request.method === "POST") return cancelSubscription(request, env, account);
  return null;
}
