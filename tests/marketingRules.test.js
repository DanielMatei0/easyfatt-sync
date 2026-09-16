const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/main/cloud/marketingRules");

const SHOP = "shop-1";
const MARKETING = { requireMarketingConsent: true, validConsentValues: ["si"] };
const ACTIVATED = "2026-09-01T08:00:00.000Z";
const NOW = new Date(2026, 8, 15, 10, 0, 0); // 15/09/2026 locale

const customer = (over = {}) => ({ email: "anna@esempio.it", marketingConsent: "si", fidelityCardNumber: "T1", points: 0, ...over });
const auto = (type, conditions = {}, over = {}) => ({ id: `auto_${type}`, type, enabled: true, activatedAt: ACTIVATED, conditions, ...over });

/** Simula il server: stato clienti + chiavi evento già accettate. */
function fakeServer() {
  const customers = new Map();
  const events = new Set();
  return {
    customers,
    events,
    run(rows, automations, now) {
      const created = [];
      rows.forEach((row) => {
        const key = R.customerKey(SHOP, row.email);
        const state = customers.get(key) || null;
        const next = R.nextCustomerState(row, state, automations);
        automations.forEach((a) => {
          const r = R.evaluateCustomer({ customer: row, automation: a, marketing: MARKETING, shopId: SHOP, state, cardMatch: false, nextState: next, lastSentAt: null, now });
          r.events.forEach((e) => {
            if (!events.has(e.event_key)) {
              events.add(e.event_key);
              created.push(e);
            }
          });
        });
        customers.set(key, {
          first_seen_at: state ? state.first_seen_at : now.toISOString(),
          last_points: next.points,
          last_observed_at: now.toISOString(),
          points_rearm: next.points_rearm,
        });
      });
      return created;
    },
  };
}

const later = (h) => new Date(NOW.getTime() + h * 3600000);

test("soglie 30/60 'each': 0 → 60 invia due mail, resta a 60 nessuna", () => {
  const s = fakeServer();
  const a = auto("points_threshold", { pointsThresholds: [30, 60], multiCrossMode: "each" });
  assert.equal(s.run([customer({ points: 0 })], [a], NOW).length, 0);
  const second = s.run([customer({ points: 60 })], [a], later(1));
  assert.deepEqual(second.map((e) => e.meta.soglia), ["30", "60"]);
  assert.equal(s.run([customer({ points: 60 })], [a], later(2)).length, 0);
});

test("soglie 'highest': solo la più alta", () => {
  const s = fakeServer();
  const a = auto("points_threshold", { pointsThresholds: [30, 60] });
  s.run([customer({ points: 0 })], [a], NOW);
  assert.deepEqual(s.run([customer({ points: 60 })], [a], later(1)).map((e) => e.meta.soglia), ["60"]);
});

test("cliente nuovo con 60 punti: le soglie partono subito (da 0)", () => {
  const s = fakeServer();
  const a = auto("points_threshold", { pointsThresholds: [30, 60], multiCrossMode: "each", pointsThresholdRewards: { 60: "Caffè" } });
  const ev = s.run([customer({ points: 60 })], [a], NOW);
  assert.equal(ev.length, 2);
  assert.equal(ev[1].meta.premio, "Caffè");
});

test("60 → 10 → 60: nuovo invio per ogni soglia (riarmo)", () => {
  const s = fakeServer();
  const a = auto("points_threshold", { pointsThresholds: [30, 60], multiCrossMode: "each" });
  s.run([customer({ points: 60 })], [a], NOW);
  assert.equal(s.run([customer({ points: 10 })], [a], later(1)).length, 0);
  const again = s.run([customer({ points: 60 })], [a], later(2));
  assert.equal(again.length, 2);
  assert.ok(again.every((e) => e.event_key.endsWith(":g1")));
});

test("cliente osservato solo prima dell'attivazione: baseline, niente arretrati", () => {
  const a = auto("points_threshold", { pointsThresholds: [30] });
  const state = { first_seen_at: "2026-08-01T00:00:00Z", last_points: 0, last_observed_at: "2026-08-20T00:00:00Z", points_rearm: {} };
  const row = customer({ points: 80 });
  const r = R.evaluateCustomer({ customer: row, automation: a, marketing: MARKETING, shopId: SHOP, state, cardMatch: false, nextState: R.nextCustomerState(row, state, [a]), lastSentAt: null, now: NOW });
  assert.equal(r.match, false);
});

test("compleanno: giorno e mese, non l'anno; un invio l'anno", () => {
  const s = fakeServer();
  const a = auto("birthday");
  const row = customer({ birthDate: new Date(1985, 8, 15) });
  assert.equal(s.run([row], [a], NOW).length, 1);
  assert.equal(s.run([row], [a], later(3)).length, 0);
  assert.equal(s.run([row], [a], new Date(2027, 8, 15, 9)).length, 1);
  assert.equal(s.run([customer({ birthDate: new Date(1985, 8, 16) })], [a], NOW).length, 0);
});

test("29 febbraio festeggiato il 28 negli anni non bisestili", () => {
  const born = new Date(1996, 1, 29);
  assert.ok(R.isBirthdayToday(born, new Date(2027, 1, 28, 10)));
  assert.ok(!R.isBirthdayToday(born, new Date(2028, 1, 28, 10)));
  assert.ok(R.isBirthdayToday(born, new Date(2028, 1, 29, 10)));
});

test("benvenuto: clienti già presenti prima dell'attivazione non lo ricevono", () => {
  const a = auto("new_fidelity");
  const state = { first_seen_at: "2026-08-01T00:00:00Z", last_points: 100, last_observed_at: "2026-09-10T00:00:00Z", points_rearm: {} };
  const r = R.evaluateCustomer({ customer: customer(), automation: a, marketing: MARKETING, shopId: SHOP, state, cardMatch: false, nextState: {}, lastSentAt: null, now: NOW });
  assert.equal(r.match, false);
});

test("benvenuto: cliente nuovo una volta sola; stessa tessera con email diversa no", () => {
  const s = fakeServer();
  const a = auto("new_fidelity");
  assert.equal(s.run([customer()], [a], NOW).length, 1);
  assert.equal(s.run([customer()], [a], later(1)).length, 0);
  const r = R.evaluateCustomer({ customer: customer({ email: "anna.nuova@esempio.it" }), automation: a, marketing: MARKETING, shopId: SHOP, state: null, cardMatch: true, nextState: {}, lastSentAt: null, now: NOW });
  assert.equal(r.match, false);
});

test("migrazione di 500 clienti poi un giro: zero benvenuti", () => {
  const s = fakeServer();
  const a = auto("new_fidelity", {}, { activatedAt: later(1).toISOString() });
  const rows = Array.from({ length: 500 }, (_, i) => customer({ email: `c${i}@esempio.it`, fidelityCardNumber: `T${i}` }));
  rows.forEach((row) => s.customers.set(R.customerKey(SHOP, row.email), { first_seen_at: NOW.toISOString(), last_points: 0, last_observed_at: NOW.toISOString(), points_rearm: {} }));
  assert.equal(s.run(rows, [a], later(2)).length, 0);
});

test("automazione senza data di attivazione: nessun invio", () => {
  const r = R.evaluateCustomer({ customer: customer(), automation: auto("new_fidelity", {}, { activatedAt: null }), marketing: MARKETING, shopId: SHOP, state: null, cardMatch: false, nextState: {}, lastSentAt: null, now: NOW });
  assert.equal(r.match, false);
});

test("consenso ed email controllati prima di tutto", () => {
  const a = auto("birthday");
  const base = { automation: a, marketing: MARKETING, shopId: SHOP, state: null, cardMatch: false, nextState: {}, lastSentAt: null, now: NOW };
  assert.equal(R.evaluateCustomer({ ...base, customer: customer({ marketingConsent: "no", birthDate: new Date(1990, 8, 15) }) }).match, false);
  assert.equal(R.evaluateCustomer({ ...base, customer: customer({ email: "non-valida", birthDate: new Date(1990, 8, 15) }) }).match, false);
});

test("inattivo: cooldown dall'ultimo invio riuscito", () => {
  const a = auto("inactive_customer", { inactiveDays: 90, cooldownDays: 30 });
  const base = { automation: a, marketing: MARKETING, shopId: SHOP, state: null, cardMatch: false, nextState: {}, now: NOW };
  const row = customer({ lastPurchaseDate: new Date(2026, 0, 10) });
  assert.equal(R.evaluateCustomer({ ...base, customer: row, lastSentAt: null }).match, true);
  assert.equal(R.evaluateCustomer({ ...base, customer: row, lastSentAt: new Date(2026, 8, 1) }).match, false);
});

test("chiavi evento compatibili con il server", () => {
  const re = /^[a-z]{3,6}:[A-Za-z0-9_-]{1,80}:[a-f0-9]{64}(:[A-Za-z0-9._-]{1,64}){0,2}$/;
  const s = fakeServer();
  const autos = [
    auto("points_threshold", { pointsThresholds: [30.5], multiCrossMode: "each" }),
    auto("birthday"),
    auto("new_fidelity", {}, { id: "id con spazi!" }),
    auto("custom"),
  ];
  const ev = s.run([customer({ points: 40, birthDate: new Date(1990, 8, 15) })], autos, NOW);
  assert.equal(ev.length, 4);
  ev.forEach((e) => assert.match(e.event_key, re));
});

test("guardie: troppi clienti nuovi trattengono i benvenuti, non i compleanni", () => {
  const mk = (type, i, prefix) => ({ automation_id: `auto_${type}`, automation_type: type, event_key: `${prefix}:auto_${type}:${"a".repeat(64)}:${i}` });
  const candidates = [
    ...Array.from({ length: 30 }, (_, i) => mk("new_fidelity", i, "welc")),
    ...Array.from({ length: 5 }, (_, i) => mk("birthday", i, "bday")),
  ];
  const g = R.applyGuards({ candidates, knownCount: 100, newCustomerCount: 30, totalCustomers: 1000 });
  assert.ok(g.events.filter((e) => e.automation_type === "new_fidelity").every((e) => e.status === "HELD"));
  assert.ok(g.events.filter((e) => e.automation_type === "birthday").every((e) => e.status === "QUEUED"));
  const calm = R.applyGuards({ candidates: candidates.slice(0, 3), knownCount: 100, newCustomerCount: 3, totalCustomers: 1000 });
  assert.ok(calm.events.every((e) => e.status === "QUEUED"));
});

test("chiave cliente: stessa email in maiuscolo, stesso cliente; negozi diversi, chiavi diverse", () => {
  assert.equal(R.customerKey(SHOP, " Anna@Esempio.it "), R.customerKey(SHOP, "anna@esempio.it"));
  assert.notEqual(R.customerKey("altro", "anna@esempio.it"), R.customerKey(SHOP, "anna@esempio.it"));
});
