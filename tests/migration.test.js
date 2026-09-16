const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createFakeCloud, createMemoryStore } = require("./helpers/fakeCloud");
const { runMigration, getState } = require("../src/main/cloud/migration");
const { createRunner } = require("../src/main/cloud/marketingRunner");
const { setMarketingConfig, getMarketingConfig } = require("../src/main/marketingConfig");
const rules = require("../src/main/cloud/marketingRules");
const engine = require("../src/main/marketingEngine");

const OLD = "2026-06-01T08:00:00.000Z";

function setup(rows) {
  const store = createMemoryStore();
  store.store = store.data;
  setMarketingConfig(store, {
    enabled: true,
    realSendEnabled: true,
    senderEmail: "negozio@gmail.com",
    requireMarketingConsent: false,
    marketingProfiles: [{ id: "mp1", syncProfileId: "sp1", name: "Clienti", columnMapping: {} }],
    templates: [{ id: "t1", name: "T", subject: "Ciao", blocks: [] }],
    automations: [
      // Attivata mesi fa: senza la migrazione tutti i clienti sembrerebbero nuovi.
      { id: "auto_w", type: "new_fidelity", marketingProfileId: "mp1", templateId: "t1", enabled: true, activatedAt: OLD },
      { id: "auto_p", type: "points_threshold", marketingProfileId: "mp1", templateId: "t1", enabled: true, conditions: { pointsThresholds: [50] } },
    ],
    sendHistory: [
      { automationId: "auto_p", recipientEmail: "c1@esempio.it", status: "sent", sentAt: "2026-09-01T10:00:00Z", meta: { threshold: 50 } },
      { automationId: "auto_w", recipientEmail: "c2@esempio.it", status: "skipped", sentAt: "2026-09-01T10:00:00Z" },
    ],
  });
  store.set("config", { syncProfiles: [{ id: "sp1", name: "Clienti", excelPath: "/percorso/locale.xlsx", spreadsheetId: "x" }] });
  const cloud = createFakeCloud();
  const eng = {
    loadCustomersForMarketingProfile: async () => ({ customers: rows().map((r) => ({ marketingConsent: "si", ...r })) }),
    buildBackendBusinessProfile: engine.buildBackendBusinessProfile,
    buildRecipientVariables: engine.buildRecipientVariables,
  };
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "efs-mig-"));
  return { store, cloud, eng, userDataDir };
}

test("migrazione di 500 clienti: config sul server, nulla perso in locale, zero benvenuti e zero arretrati", async () => {
  let rows = Array.from({ length: 500 }, (_, i) => ({ email: `c${i}@esempio.it`, fidelityCardNumber: `T${i}`, points: 80 }));
  const s = setup(() => rows);
  const r = await runMigration({ store: s.store, client: s.cloud.client, userDataDir: s.userDataDir, getAppConfig: () => s.store.get("config"), engine: s.eng });
  assert.equal(r.mode, "migrated");
  assert.equal(getState(s.store).step, "done");
  assert.ok(fs.existsSync(getState(s.store).backupPath));
  assert.equal(s.cloud.customers.size, 500);
  assert.equal(s.cloud.shop.version, 1);
  assert.equal(s.cloud.shop.config.syncProfiles[0].excelPath, undefined, "il percorso del file resta sul PC");
  assert.equal(getMarketingConfig(s.store).sendHistory.length, 2, "storico locale intatto");
  assert.equal(s.store.get("config").syncProfiles[0].excelPath, "/percorso/locale.xlsx");
  assert.ok(new Date(getMarketingConfig(s.store).automations[0].activatedAt) > new Date(OLD));

  const gmail = [];
  const runner = createRunner({
    store: s.store,
    client: s.cloud.client,
    getAppConfig: () => s.store.get("config"),
    gate: () => ({ ok: true }),
    shopId: () => "shop-test",
    engine: s.eng,
    createSender: () => ({ async preflight() {}, async sendOne(t, rc) { gmail.push(rc.email); return { outcome: "SENT" }; } }),
  });
  await runner.runMarketing({ trigger: "watch" });
  assert.equal(gmail.length, 0, "nessun benvenuto e nessuna soglia arretrata");

  // Dopo la migrazione il motore torna a funzionare: un cliente nuovo e uno che supera la soglia.
  rows = [...rows.map((c, i) => (i === 3 ? { ...c, points: 20 } : c)), { email: "nuovo@esempio.it", fidelityCardNumber: "TN", points: 0 }];
  await runner.runMarketing({ trigger: "watch" });
  rows = rows.map((c, i) => (i === 3 ? { ...c, points: 60 } : c));
  await runner.runMarketing({ trigger: "watch" });
  assert.deepEqual(gmail.sort(), ["c3@esempio.it", "nuovo@esempio.it"]);
});

test("storico locale convertito: la soglia già inviata non riparte", async () => {
  const s = setup(() => []);
  const ledger = require("../src/main/cloud/migration").legacyLedger(getMarketingConfig(s.store), "shop-test");
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].event_key, `pts:auto_p:${rules.customerKey("shop-test", "c1@esempio.it")}:50:g0`);
});

test("secondo PC: il negozio è già sul server, si scarica la config", async () => {
  const s = setup(() => []);
  s.cloud.shop.version = 3;
  s.cloud.shop.config = { schema: 1, marketing: { templates: [{ id: "t9", name: "Dal server", subject: "S", blocks: [] }] }, syncProfiles: [] };
  const r = await runMigration({ store: s.store, client: s.cloud.client, userDataDir: s.userDataDir, getAppConfig: () => s.store.get("config"), engine: s.eng });
  assert.equal(r.mode, "joined");
  assert.equal(getMarketingConfig(s.store).templates[0].name, "Dal server");
  assert.ok(!s.cloud.calls.includes("migrationStart"));
  assert.equal(s.cloud.sends.size, 0, "lo storico di un PC estraneo non entra nel registro del negozio");
});

test("migrazione interrotta e ripresa: nessun doppione", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ email: `c${i}@esempio.it`, points: 1 }));
  const s = setup(() => rows);
  const orig = s.cloud.client.migrationLedger;
  s.cloud.client.migrationLedger = async () => {
    throw new Error("rete caduta");
  };
  await assert.rejects(runMigration({ store: s.store, client: s.cloud.client, userDataDir: s.userDataDir, getAppConfig: () => s.store.get("config"), engine: s.eng }));
  const id = getState(s.store).id;
  s.cloud.client.migrationLedger = orig;
  await runMigration({ store: s.store, client: s.cloud.client, userDataDir: s.userDataDir, getAppConfig: () => s.store.get("config"), engine: s.eng });
  assert.equal(getState(s.store).id, id);
  assert.equal(s.cloud.customers.size, 10);
});
