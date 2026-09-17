/**
 * Anteprima dei destinatari: stesse regole del giro reale, stato dal server,
 * NESSUNA scrittura (né registro né stato clienti). Stessa forma di prima
 * (buildRecipientsPayload) per non cambiare l'interfaccia.
 */
const rules = require("./marketingRules");
const { normalizeAutomation } = require("../marketingConfig");

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const STATUS_LABEL = {
  SENT: "Già inviata",
  QUEUED: "Già in coda di invio",
  CLAIMED: "Invio in corso",
  HELD: "In attesa di approvazione",
  FAILED: "Invio da ritentare",
  UNCERTAIN: "Esito incerto: verifica in Gmail",
  DEAD: "Invio non riuscito",
  CANCELLED: "Annullata",
  EXPIRED: "Scaduta",
};

async function previewAutomation({ store, client, shopId, appConfig, automation, marketing, engine, columnMappingOverride, now = new Date() }) {
  const normalized = normalizeAutomation(automation);
  // Una bozza o un'automazione spenta: si mostra cosa succederebbe attivandola ora.
  const evaluated = normalized.activatedAt ? normalized : { ...normalized, activatedAt: now.toISOString() };
  const { customers, marketingProfile, syncProfile, headers } = await engine.loadCustomersForMarketingProfile(
    store,
    appConfig,
    normalized.marketingProfileId,
    columnMappingOverride,
  );

  const byKey = new Map();
  customers.forEach((c) => {
    const email = rules.normalizeEmail(c.email);
    if (email && !byKey.has(rules.customerKey(shopId, email))) byKey.set(rules.customerKey(shopId, email), c);
  });
  const keys = [...byKey.keys()];
  const cardKeys = [...new Set(keys.map((k) => rules.cardKey(shopId, byKey.get(k).fidelityCardNumber)).filter(Boolean))];

  const states = new Map();
  const cardOwner = new Map();
  const keyParts = chunk(keys, 4000);
  const cardParts = chunk(cardKeys, 4000);
  for (let i = 0; i < Math.max(keyParts.length, cardParts.length, 1); i++) {
    const res = await client.customerState(keyParts[i] || [], cardParts[i] || []);
    res.customers.forEach((s) => states.set(s.customer_key, s));
    (res.by_card || []).forEach((b) => cardOwner.set(b.card_key, b.customer_key));
  }
  const lastSent = new Map();
  if (evaluated.type === "inactive_customer" || evaluated.type === "custom") {
    for (const part of keyParts) {
      const res = await client.lookup({ automation_ids: [evaluated.id], customer_keys: part });
      res.last_sent.forEach((r) => lastSent.set(r.customer_key, r.sent_at));
    }
  }

  const matches = [];
  const skipped = [];
  customers.forEach((customer) => {
    const email = rules.normalizeEmail(customer.email);
    const key = email ? rules.customerKey(shopId, email) : null;
    if (!key || byKey.get(key) !== customer) {
      skipped.push({ customer, reason: email ? "Email duplicata nel file" : "Email mancante" });
      return;
    }
    const state = states.get(key) || null;
    const ck = rules.cardKey(shopId, customer.fidelityCardNumber);
    const owner = ck ? cardOwner.get(ck) : null;
    const r = rules.evaluateCustomer({
      customer,
      automation: evaluated,
      marketing,
      shopId,
      state,
      cardMatch: Boolean(!state && owner && owner !== key),
      nextState: rules.nextCustomerState(customer, state, [evaluated]),
      lastSentAt: lastSent.get(key) || null,
      now,
    });
    if (!r.match) skipped.push({ customer, reason: r.reason });
    else r.events.forEach((e) => matches.push({ customer, event: e }));
  });

  const statusByKey = new Map();
  for (const part of chunk(matches.map((m) => m.event.event_key), 4000)) {
    const res = await client.lookup({ event_keys: part });
    res.events.forEach((e) => statusByKey.set(e.event_key, e.status));
  }

  const recipients = [];
  matches.forEach(({ customer, event }) => {
    const status = statusByKey.get(event.event_key);
    if (status && status !== "QUEUED" && status !== "FAILED") {
      skipped.push({ customer, reason: STATUS_LABEL[status] || status });
      return;
    }
    recipients.push({
      email: customer.email,
      name: customer.fullName || customer.firstName,
      firstName: customer.firstName,
      lastName: customer.lastName,
      points: customer.points,
      fidelityCardNumber: customer.fidelityCardNumber,
      meta: { ...event.meta, threshold: event.meta.soglia, reward: event.meta.premio, pending: status || null },
      customer,
      row: customer._row || {},
    });
  });

  const withoutEmail = customers.filter((c) => !c.email).length;
  return {
    automation: normalized,
    marketingProfile,
    syncProfile,
    headers: Array.isArray(headers) ? headers : [],
    summary: {
      total: customers.length,
      valid: recipients.length,
      excluded: customers.length - recipients.length,
      withoutEmail,
      withoutConsent: skipped.filter((s) => /consenso|lista/i.test(s.reason)).length,
      skipped: skipped.length,
      duplicateEmails: skipped.filter((s) => /duplicata/i.test(s.reason)).length,
      alreadyContacted: skipped.filter((s) => /Già|coda|approvazione/.test(s.reason)).length,
    },
    recipients,
    skipped: skipped.map((s) => ({
      email: s.customer.email || "—",
      name: s.customer.fullName || s.customer.firstName || "—",
      reason: s.reason,
      row: s.customer._row || {},
    })),
  };
}

module.exports = { previewAutomation };
