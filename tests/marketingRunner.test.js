const test = require("node:test");
const assert = require("node:assert/strict");
const { createFakeCloud, createMemoryStore } = require("./helpers/fakeCloud");
const { createRunner } = require("../src/main/cloud/marketingRunner");
const { setMarketingConfig } = require("../src/main/marketingConfig");
const rules = require("../src/main/cloud/marketingRules");
const engine = require("../src/main/marketingEngine");

const SHOP = "shop-test";
const ACTIVATED = new Date(Date.now() - 86400000).toISOString();

function setup({ rows, automations, sender, cloudOptions, hasCustomerFile } = {}) {
  const store = createMemoryStore();
  setMarketingConfig(store, {
    enabled: true,
    realSendEnabled: true,
    senderEmail: "negozio@gmail.com",
    requireMarketingConsent: false,
    marketingProfiles: [{ id: "mp1", syncProfileId: "sp1", name: "Clienti", columnMapping: {} }],
    templates: [{ id: "t1", name: "T", subject: "Ciao {{firstName}}", blocks: [] }],
    automations: automations.map((a) => ({ marketingProfileId: "mp1", templateId: "t1", enabled: true, activatedAt: ACTIVATED, ...a })),
  });
  const cloud = createFakeCloud(cloudOptions);
  // Un cliente già noto: il server non è vuoto (migrazione fatta).
  cloud.customers.set(rules.customerKey(SHOP, "storico@esempio.it"), { first_seen_at: ACTIVATED, last_points: 0, last_observed_at: ACTIVATED, points_rearm: {} });

  const state = { rows };
  const gmail = { sent: [] };
  const defaultSender = () => ({
    async preflight() {},
    async sendOne(template, recipient) {
      gmail.sent.push(recipient.email);
      return { outcome: "SENT" };
    },
  });
  const runner = createRunner({
    store,
    client: cloud.client,
    getAppConfig: () => ({}),
    gate: () => ({ ok: true }),
    shopId: () => SHOP,
    engine: {
      loadCustomersForMarketingProfile: async () => ({ customers: state.rows.map((r) => ({ marketingConsent: "si", ...r })) }),
      buildBackendBusinessProfile: engine.buildBackendBusinessProfile,
      buildRecipientVariables: engine.buildRecipientVariables,
    },
    createSender: sender ? () => sender(gmail) : defaultSender,
    hasCustomerFile,
  });
  return { store, cloud, runner, state, gmail };
}

const pointsAuto = { id: "auto_pts", type: "points_threshold", conditions: { pointsThresholds: [30, 60], multiCrossMode: "each" } };

test("0 → 60 punti dal flusso reale: due email, poi più niente", async () => {
  const s = setup({ rows: [{ email: "anna@esempio.it", firstName: "Anna", points: 0 }], automations: [pointsAuto] });
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.gmail.sent.length, 0);
  s.state.rows = [{ email: "anna@esempio.it", firstName: "Anna", points: 60 }];
  const r = await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(r.summary.sent, 2);
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.gmail.sent.length, 2);
});

test("due giri in parallelo: ogni mail parte una volta", async () => {
  const s = setup({ rows: [{ email: "anna@esempio.it", points: 60 }], automations: [pointsAuto] });
  await Promise.all([s.runner.runMarketing({ trigger: "schedule" }), s.runner.runMarketing({ trigger: "watch" })]);
  await new Promise((r) => setTimeout(r, 50));
  await s.runner.runMarketing({ trigger: "schedule" });
  assert.equal(s.gmail.sent.length, 2);
});

test("server non raggiungibile: nessun invio", async () => {
  const s = setup({ rows: [{ email: "anna@esempio.it", points: 60 }], automations: [pointsAuto] });
  s.cloud.setOffline(true);
  const r = await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "offline");
  assert.equal(s.gmail.sent.length, 0);
});

test("negozio in pausa: nessun invio", async () => {
  const s = setup({ rows: [{ email: "anna@esempio.it", points: 60 }], automations: [pointsAuto], cloudOptions: { paused: true } });
  const r = await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(r.kind, "paused");
  assert.equal(s.gmail.sent.length, 0);
});

test("app chiusa durante l'invio: l'evento diventa incerto e non si reinvia", async () => {
  let crash = true;
  const s = setup({
    rows: [{ email: "anna@esempio.it", points: 30 }],
    automations: [{ ...pointsAuto, conditions: { pointsThresholds: [30] } }],
    sender: (gmail) => ({
      async preflight() {},
      async sendOne(t, recipient) {
        gmail.sent.push(recipient.email);
        if (crash) throw new Error("processo terminato");
        return { outcome: "SENT" };
      },
    }),
  });
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.gmail.sent.length, 1);
  crash = false;
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.gmail.sent.length, 1, "nessun reinvio automatico");
  assert.equal([...s.cloud.sends.values()][0].status, "UNCERTAIN");
});

test("Google scaduto a metà: il resto torna in coda e parte al giro dopo, una volta", async () => {
  let expire = true;
  const s = setup({
    rows: ["a", "b", "c"].map((x) => ({ email: `${x}@esempio.it`, points: 30 })),
    automations: [{ ...pointsAuto, conditions: { pointsThresholds: [30] } }],
    sender: (gmail) => ({
      async preflight() {},
      async sendOne(t, recipient) {
        if (expire && gmail.sent.length === 1) return { outcome: "FAILED", kind: "auth", error: "token scaduto" };
        gmail.sent.push(recipient.email);
        return { outcome: "SENT" };
      },
    }),
  });
  const first = await s.runner.runMarketing({ trigger: "watch" });
  assert.match(first.summary.stoppedBy, /Google/);
  assert.equal(s.gmail.sent.length, 1);
  expire = false;
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.gmail.sent.length, 3);
  assert.equal(new Set(s.gmail.sent).size, 3);
});

test("Google non collegato prima di iniziare: nessuna presa in carico", async () => {
  const s = setup({
    rows: [{ email: "anna@esempio.it", points: 60 }],
    automations: [pointsAuto],
    sender: () => ({
      async preflight() {
        throw Object.assign(new Error("Ricollega Google"), { kind: "auth" });
      },
      async sendOne() {
        throw new Error("non deve essere chiamato");
      },
    }),
  });
  await s.runner.runMarketing({ trigger: "watch" });
  assert.ok([...s.cloud.sends.values()].every((e) => e.status === "QUEUED"));
  assert.ok(!s.cloud.calls.includes("lease"));
});

test("invio reale spento: nessun giro sul server", async () => {
  const s = setup({ rows: [{ email: "anna@esempio.it", points: 60 }], automations: [pointsAuto] });
  const { getMarketingConfig } = require("../src/main/marketingConfig");
  setMarketingConfig(s.store, { ...getMarketingConfig(s.store), realSendEnabled: false });
  const r = await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(r.reason, "real_send_disabled");
  assert.equal(s.cloud.calls.length, 0);
});

test("più di 50 destinatari: partono tutti, nei giri successivi se serve", async () => {
  const s = setup({
    rows: Array.from({ length: 60 }, (_, i) => ({ email: `c${i}@esempio.it`, points: 30 })),
    automations: [{ ...pointsAuto, conditions: { pointsThresholds: [30] } }],
  });
  // 60 clienti nuovi su 1 noto: la guardia li tratterrebbe se fossero benvenuti, non per le soglie…
  // …ma il circuit breaker (>20% dei clienti) sì: li approviamo come farebbe lo staff.
  await s.runner.runMarketing({ trigger: "watch" });
  const held = [...s.cloud.sends.values()].filter((e) => e.status === "HELD");
  assert.equal(held.length, 60);
  held.forEach((e) => (e.status = "QUEUED"));
  await s.runner.runMarketing({ trigger: "manual" });
  assert.equal(s.gmail.sent.length, 60);
});

test("PC di sola gestione (senza file clienti): nessun giro, nessun invio", async () => {
  const s = setup({ rows: [{ email: "anna@esempio.it", points: 60 }], automations: [pointsAuto], hasCustomerFile: () => false });
  const r = await s.runner.runMarketing({ trigger: "schedule" });
  assert.equal(r.reason, "management_only");
  assert.equal(s.cloud.calls.length, 0);
});

test("un altro PC del negozio sta già inviando: questo salta il giro senza errore", async () => {
  const s = setup({ rows: [{ email: "anna@esempio.it", points: 60 }], automations: [pointsAuto] });
  const { CloudError } = require("../src/main/cloud/cloudApi");
  s.cloud.client.startRun = async () => {
    throw new CloudError("busy", "Invio già in corso da «PC Cassa».", { status: 409, code: "busy" });
  };
  const r = await s.runner.runMarketing({ trigger: "schedule" });
  assert.equal(r.ok, true);
  assert.equal(r.reason, "busy_other_device");
});

test("lista = tessera: senza tessera nessuna email; tessera assegnata → un benvenuto, poi compleanni e soglie", async () => {
  const s = setup({
    rows: [{ email: "anna@esempio.it", firstName: "Anna", points: 0, fidelityCardNumber: "" }],
    automations: [
      { id: "auto_welc", type: "new_fidelity" },
      { id: "auto_pts", type: "points_threshold", conditions: { pointsThresholds: [50] } },
    ],
  });
  const { getMarketingConfig } = require("../src/main/marketingConfig");
  setMarketingConfig(s.store, { ...getMarketingConfig(s.store), marketingListMode: "card" });
  await s.runner.runMarketing({ trigger: "watch" });
  s.state.rows = [{ email: "anna@esempio.it", firstName: "Anna", points: 60, fidelityCardNumber: "" }];
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.gmail.sent.length, 0, "senza tessera non è in lista: niente soglia");
  s.state.rows = [{ email: "anna@esempio.it", firstName: "Anna", points: 60, fidelityCardNumber: "T77" }];
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.gmail.sent.length, 1, "tessera assegnata: benvenuto (la soglia era già superata prima, niente arretrato)");
  const keys = [...s.cloud.sends.values()].filter((e) => e.status === "SENT").map((e) => e.event_key.split(":")[0]);
  assert.deepEqual(keys, ["welc"]);
  s.state.rows = [{ email: "anna@esempio.it", firstName: "Anna", points: 60, fidelityCardNumber: "T78" }];
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.gmail.sent.length, 1, "tessera sostituita: nessun secondo benvenuto");
});

test("tracciabilità: motivo per ogni cliente e campagna, inviato solo quando cambia", async () => {
  const born = new Date();
  const s = setup({
    rows: [
      { email: "anna@esempio.it", firstName: "Anna", points: 10, fidelityCardNumber: "T1", birthDate: new Date(1990, born.getMonth(), born.getDate()) },
      { email: "bruno@esempio.it", firstName: "Bruno", points: 10, fidelityCardNumber: "", birthDate: null },
    ],
    automations: [{ id: "auto_bday", type: "birthday" }, pointsAuto],
  });
  const { getMarketingConfig } = require("../src/main/marketingConfig");
  setMarketingConfig(s.store, { ...getMarketingConfig(s.store), marketingListMode: "card" });
  await s.runner.runMarketing({ trigger: "watch" });
  const k = (email) => rules.customerKey(SHOP, email);
  const d = (auto, email) => s.cloud.decisions.get(`${auto}:${k(email)}`);
  assert.equal(d("auto_bday", "anna@esempio.it").category, "MATCHED");
  assert.match(d("auto_bday", "anna@esempio.it").reason, /Compleanno di oggi/);
  assert.ok(d("auto_bday", "anna@esempio.it").event_key.startsWith("bday:"));
  assert.equal(d("auto_bday", "bruno@esempio.it").code, "not_in_list");
  assert.equal(d("auto_bday", "bruno@esempio.it").reason, "Non iscritto alla lista: tessera fedeltà assente");
  assert.equal(d("auto_pts", "anna@esempio.it").category, "NOT_DUE");
  assert.equal(s.cloud.decisionCalls.reduce((a, b) => a + b, 0), 4);

  // Secondo giro: cambia solo il testo dei punti di Anna ("0 → 10" diventa "10 → 10").
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.cloud.decisionCalls.reduce((a, b) => a + b, 0), 5);
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.cloud.decisionCalls.reduce((a, b) => a + b, 0), 5, "giro identico: nessuna decisione rimandata");

  s.state.rows[0] = { ...s.state.rows[0], points: 35 };
  await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(s.cloud.decisionCalls.reduce((a, b) => a + b, 0), 6, "cambiano i punti di Anna: una sola decisione aggiornata");
  assert.equal(d("auto_pts", "anna@esempio.it").category, "MATCHED");
});

test("tracciabilità: Google non disponibile → il motivo resta sulle email in coda", async () => {
  const s = setup({
    rows: [{ email: "anna@esempio.it", points: 60 }],
    automations: [pointsAuto],
    sender: () => ({
      async preflight() {
        throw Object.assign(new Error("Permesso Gmail mancante"), { kind: "auth" });
      },
      async sendOne() {
        throw new Error("non deve essere chiamato");
      },
    }),
  });
  await s.runner.runMarketing({ trigger: "watch" });
  const queued = [...s.cloud.sends.values()].filter((e) => e.status === "QUEUED");
  assert.ok(queued.length > 0);
  assert.ok(queued.every((e) => /Gmail non disponibile.*Permesso Gmail mancante/.test(e.blocked_reason)));
});

test("tracciabilità: email trattenute con il motivo della guardia", () => {
  const mk = (i) => ({ automation_id: "auto_w", automation_type: "new_fidelity", event_key: `welc:auto_w:${"a".repeat(64)}:${i}` });
  const g = rules.applyGuards({ candidates: Array.from({ length: 30 }, (_, i) => mk(i)), knownCount: 50, newCustomerCount: 30, totalCustomers: 80 });
  assert.ok(g.events.every((e) => e.status === "HELD" && /30 clienti mai visti/.test(e.hold_reason)));
});

test("tracciabilità: se il salvataggio dei motivi fallisce, le email partono lo stesso", async () => {
  const s = setup({ rows: [{ email: "anna@esempio.it", points: 60 }], automations: [pointsAuto] });
  s.cloud.client.decisions = async () => {
    throw new Error("server giù per le decisioni");
  };
  const r = await s.runner.runMarketing({ trigger: "watch" });
  assert.equal(r.ok, true);
  assert.equal(s.gmail.sent.length, 2, "le due soglie partono comunque");
  assert.match(r.summary.decisionsError, /server giù/);
});

test("tracciabilità: più soglie superate insieme → una decisione sola per cliente e campagna", async () => {
  const s = setup({ rows: [{ email: "anna@esempio.it", points: 60 }], automations: [pointsAuto] });
  const sentBatches = [];
  const orig = s.cloud.client.decisions;
  s.cloud.client.decisions = async (runId, list) => {
    sentBatches.push(list);
    return orig(runId, list);
  };
  await s.runner.runMarketing({ trigger: "watch" });
  const rows = sentBatches.flat().filter((d) => d.automation_id === "auto_pts");
  assert.equal(rows.length, 1);
  assert.match(rows[0].reason, /Soglia 30 .*; Soglia 60/);
});
