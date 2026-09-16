/**
 * Primo collegamento del PC all'account: porta sul server quello che il negozio
 * ha già (automazioni, template, clienti noti, invii fatti) SENZA cancellare
 * nulla in locale. Riprendibile: ogni passo è idempotente sul server.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getMarketingConfig, setMarketingConfig } = require("../marketingConfig");
const rules = require("./marketingRules");
const configSync = require("./configSync");

const STATE_KEY = "cloud.migration";
const EVENT_KEY_RE = /^[a-z]{3,6}:[A-Za-z0-9_-]{1,80}:[a-f0-9]{64}(:[A-Za-z0-9._-]{1,64}){0,2}$/;

function getState(store) {
  return store.get(STATE_KEY) || { step: "none" };
}

function setState(store, patch) {
  store.set(STATE_KEY, { ...getState(store), ...patch, updatedAt: new Date().toISOString() });
}

function isDone(store) {
  return getState(store).step === "done";
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Copia completa della configurazione locale (senza token), riletta e verificata. */
function writeLocalBackup(store, userDataDir) {
  const dir = path.join(userDataDir, "migration-backups");
  fs.mkdirSync(dir, { recursive: true });
  const snapshot = { ...(store.store || {}) };
  delete snapshot["cloud.device"];
  const body = JSON.stringify({ app: "Easyfatt Sync", kind: "pre-cloud", createdAt: new Date().toISOString(), store: snapshot }, null, 2);
  const file = path.join(dir, `pre-account-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, body, "utf8");
  const hash = crypto.createHash("sha256").update(body).digest("hex");
  const back = crypto.createHash("sha256").update(fs.readFileSync(file, "utf8")).digest("hex");
  if (hash !== back) throw new Error("Copia di sicurezza non verificata: migrazione annullata.");
  if (!store.get("configPreCloud")) {
    store.set("configPreCloud", { savedAt: new Date().toISOString(), marketingConfig: store.get("marketingConfig"), config: store.get("config") });
  }
  return file;
}

/** Invii già fatti (storico locale) nel formato del registro. */
function legacyLedger(marketing, shopId) {
  const automations = new Map((marketing.automations || []).map((a) => [a.id, a]));
  const out = new Map();
  (marketing.sendHistory || []).forEach((h) => {
    if (h.status !== "sent") return;
    const email = rules.normalizeEmail(h.recipientEmail);
    const automation = automations.get(h.automationId);
    if (!email || !automation) return;
    const sentAt = new Date(h.sentAt);
    if (Number.isNaN(sentAt.getTime())) return;
    const auto = rules.safeAutomationId(automation.id);
    const cust = rules.customerKey(shopId, email);
    let key = null;
    switch (automation.type) {
      case "birthday":
        key = `bday:${auto}:${cust}:${sentAt.getFullYear()}`;
        break;
      case "points_threshold": {
        const t = h.meta?.threshold ?? String(h.meta?.thresholdKey || "").replace("threshold:", "");
        if (t !== "" && t != null && Number.isFinite(Number(t))) key = `pts:${auto}:${cust}:${rules.formatThreshold(t)}:g0`;
        break;
      }
      case "new_fidelity":
        key = `${automation.conditions?.fidelityMode === "first_points" ? "fpts" : "welc"}:${auto}:${cust}`;
        break;
      case "inactive_customer":
        key = `inact:${auto}:${cust}:${rules.localDateKey(sentAt)}`;
        break;
      default:
        key = `cust:${auto}:${cust}:${rules.localDateKey(sentAt)}`;
    }
    if (!key || !EVENT_KEY_RE.test(key) || out.has(key)) return;
    out.set(key, {
      event_key: key,
      automation_id: automation.id,
      automation_type: automation.type,
      customer_key: cust,
      email,
      recipient_name: h.recipientName || null,
      sent_at: sentAt.toISOString(),
      meta: h.meta?.threshold != null ? { soglia: String(h.meta.threshold) } : {},
    });
  });
  return [...out.values()];
}

/**
 * @param {object} deps { store, client, userDataDir, getAppConfig, engine, shopId, log, onProgress }
 */
async function runMigration(deps) {
  const { store, client, log = () => {}, onProgress = () => {} } = deps;
  const progress = (step, detail) => {
    setState(store, { step });
    onProgress({ step, detail });
  };

  const me = await client.me();
  const shopId = me.shop.id;
  const marketing = getMarketingConfig(store);

  if (me.shop.config_version >= 1) {
    // Negozio già sul server (altro PC o reinstallazione): si scarica la config
    // e si caricano gli invii che risultano solo su questo PC.
    progress("joining", "Scarico la configurazione del negozio");
    if (!getState(store).backupPath) setState(store, { backupPath: writeLocalBackup(store, deps.userDataDir) });
    const remote = await client.getConfig();
    const ledger = legacyLedger(marketing, shopId);
    for (const part of chunk(ledger, 1000)) await client.migrationLedger(undefined, part);
    configSync.applyServerConfig(store, remote.config, remote.version);
    setState(store, { step: "done", mode: "joined", completedAt: new Date().toISOString() });
    log(`[Account] PC collegato a ${me.shop.name}: configurazione scaricata.`);
    return { ok: true, mode: "joined" };
  }

  let st = getState(store);
  if (!st.backupPath) {
    progress("backup", "Copia di sicurezza locale");
    setState(store, { backupPath: writeLocalBackup(store, deps.userDataDir) });
  }
  st = getState(store);
  const migrationId = st.id || crypto.randomUUID();
  setState(store, { id: migrationId });

  progress("config", "Carico automazioni e template");
  await client.migrationStart(migrationId, configSync.buildPortableConfig(store));

  progress("customers", "Registro i clienti già presenti");
  const appConfig = deps.getAppConfig();
  const profileIds = [...new Set((marketing.marketingProfiles || []).map((p) => p.id))];
  const seeded = new Map();
  for (const profileId of profileIds) {
    const { customers } = await deps.engine.loadCustomersForMarketingProfile(store, appConfig, profileId);
    customers.forEach((c) => {
      const email = rules.normalizeEmail(c.email);
      if (!email) return;
      const key = rules.customerKey(shopId, email);
      if (seeded.has(key)) return;
      const points = Number(c.points);
      seeded.set(key, { customer_key: key, card_key: rules.cardKey(shopId, c.fidelityCardNumber), points: Number.isFinite(points) && c.points !== null ? points : null });
    });
  }
  for (const part of chunk([...seeded.values()], 2000)) await client.migrationCustomers(migrationId, part);

  progress("ledger", "Carico lo storico degli invii");
  const ledger = legacyLedger(marketing, shopId);
  for (const part of chunk(ledger, 1000)) await client.migrationLedger(migrationId, part);

  progress("complete", "Verifica finale");
  // Tutte le automazioni attive ripartono da ADESSO, anche se avevano già una data:
  // i clienti appena registrati risultano "visti prima" → nessun benvenuto, nessun arretrato.
  const stampedAt = new Date().toISOString();
  const current = getMarketingConfig(store);
  const stamped = {
    ...current,
    automations: current.automations.map((a) => ({ ...a, activatedAt: a.enabled !== false && !a.archived ? stampedAt : null })),
  };
  const portable = configSync.buildPortableConfig(store, stamped);
  const res = await client.migrationComplete(migrationId, portable, { customers: seeded.size, ledger: ledger.length });
  setMarketingConfig(store, stamped);
  configSync.setState(store, { version: res.version, dirty: false });
  setState(store, { step: "done", mode: "migrated", completedAt: new Date().toISOString(), counts: res.counts });
  log(`[Account] Migrazione completata: ${seeded.size} clienti, ${ledger.length} invii storici.`);
  return { ok: true, mode: "migrated", counts: res.counts };
}

module.exports = { runMigration, getState, setState, isDone, legacyLedger, writeLocalBackup };
