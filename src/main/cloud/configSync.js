/**
 * Configurazione condivisa tra i PC del negozio.
 *
 * Sul server va solo la parte "portabile": automazioni, template, profili
 * clienti, dati del negozio, consensi, profili di sync SENZA percorso del file.
 * Restano sul PC: percorso Excel, logo (file locale), bozza del wizard, token
 * Google, storico e snapshot con i dati dei clienti.
 */
const { getMarketingConfig, setMarketingConfig, PATCHABLE_KEYS } = require("../marketingConfig");
const { ensureConfigMigrated, getDefaultConfig, normalizeProfiles } = require("../syncState");
const { CloudError } = require("./cloudApi");

const STATE_KEY = "cloud.config";
const LOCAL_ONLY_MARKETING = new Set(["automationWizardDraft"]);

function state(store) {
  return store.get(STATE_KEY) || { version: 0, dirty: false };
}

function setState(store, patch) {
  store.set(STATE_KEY, { ...state(store), ...patch });
}

function buildPortableConfig(store, marketingOverride) {
  const marketing = marketingOverride || getMarketingConfig(store);
  const portableMarketing = {};
  PATCHABLE_KEYS.forEach((k) => {
    if (!LOCAL_ONLY_MARKETING.has(k)) portableMarketing[k] = marketing[k];
  });
  portableMarketing.businessProfile = { ...(marketing.businessProfile || {}), logoPath: "" };

  const appConfig = ensureConfigMigrated(store.get("config") || getDefaultConfig());
  const syncProfiles = (appConfig.syncProfiles || []).map(({ excelPath, lastSyncAt, lastSyncRows, ...rest }) => rest);
  return { schema: 1, marketing: portableMarketing, syncProfiles };
}

/** Applica la config del server mantenendo ciò che è di questo PC. */
function applyServerConfig(store, serverConfig, version) {
  if (!serverConfig || typeof serverConfig !== "object" || !serverConfig.marketing) return;
  const local = getMarketingConfig(store);
  const next = { ...local };
  PATCHABLE_KEYS.forEach((k) => {
    if (LOCAL_ONLY_MARKETING.has(k)) return;
    if (Object.prototype.hasOwnProperty.call(serverConfig.marketing, k)) next[k] = serverConfig.marketing[k];
  });
  next.businessProfile = { ...(serverConfig.marketing.businessProfile || {}), logoPath: local.businessProfile?.logoPath || "" };
  setMarketingConfig(store, next);

  if (Array.isArray(serverConfig.syncProfiles)) {
    const appConfig = ensureConfigMigrated(store.get("config") || getDefaultConfig());
    const byId = new Map((appConfig.syncProfiles || []).map((p) => [p.id, p]));
    serverConfig.syncProfiles.forEach((remote) => {
      const localProfile = byId.get(remote.id);
      byId.set(remote.id, localProfile
        ? { ...localProfile, ...remote, excelPath: localProfile.excelPath, lastSyncAt: localProfile.lastSyncAt, lastSyncRows: localProfile.lastSyncRows }
        : { ...remote, excelPath: "", lastSyncAt: null, lastSyncRows: null });
    });
    store.set("config", ensureConfigMigrated({ ...appConfig, syncProfiles: normalizeProfiles([...byId.values()]) }));
  }
  setState(store, { version, dirty: false, pulledAt: new Date().toISOString() });
}

/** Porta sul server la config locale. Conflitto: prende quella del server e riapplica `reapply`. */
async function push(store, client, { reapply } = {}) {
  const s = state(store);
  if (!s.version) return { ok: false, reason: "not_migrated" };
  try {
    const res = await client.putConfig(s.version, buildPortableConfig(store));
    setState(store, { version: res.version, dirty: false, pushedAt: new Date().toISOString() });
    return { ok: true, version: res.version };
  } catch (err) {
    if (err instanceof CloudError && err.code === "version_conflict" && err.data) {
      applyServerConfig(store, err.data.config, err.data.version);
      if (typeof reapply === "function") {
        reapply();
        const res = await client.putConfig(err.data.version, buildPortableConfig(store));
        setState(store, { version: res.version, dirty: false });
        return { ok: true, version: res.version, merged: true };
      }
      return { ok: true, pulled: true };
    }
    setState(store, { dirty: true });
    return { ok: false, reason: err.kind || "error", message: err.message };
  }
}

/** All'avvio e prima dei giri: allinea con il server (o spinge le modifiche fatte offline). */
async function sync(store, client) {
  const s = state(store);
  if (!s.version) return { ok: false, reason: "not_migrated" };
  if (s.dirty) return push(store, client);
  const remote = await client.getConfig();
  if (remote.version > s.version) {
    applyServerConfig(store, remote.config, remote.version);
    return { ok: true, pulled: true };
  }
  return { ok: true };
}

module.exports = { buildPortableConfig, applyServerConfig, push, sync, state, setState };
