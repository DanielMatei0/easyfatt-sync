/**
 * Punto unico con cui main.js parla al server Easyfatt Sync: accesso, migrazione,
 * giri di invio, anteprime, configurazione condivisa, storico invii.
 */
const { getMarketingConfig, patchMarketingConfig } = require("../marketingConfig");
const engine = require("../marketingEngine");
const { createClient, CloudError } = require("./cloudApi");
const tokenStore = require("./tokenStore");
const authClient = require("./authClient");
const migration = require("./migration");
const configSync = require("./configSync");
const pending = require("./pendingStore");
const { createRunner, events: runnerEvents } = require("./marketingRunner");
const { previewAutomation } = require("./preview");
const { createTelemetry } = require("./telemetry");

function createCloudService({
  store,
  app,
  log = () => {},
  broadcast = () => {},
  getAppConfig,
  getInstallId,
  isWindowFocused = () => false,
  getIdleSeconds = () => 0,
  onConfigPulled = () => {},
}) {
  let lastError = null;
  let lastRun = store.get("cloud.lastRun") || null;
  let migrating = null;
  let shopFlags = null;

  const client = createClient(store, {
    onUnauthorized: () => {
      // Token revocato o utente disattivato: il PC torna al login, la config locale resta.
      if (tokenStore.sessionInfo(store)) {
        tokenStore.clearSession(store);
        log("[Account] Accesso non più valido: accedi di nuovo con l'account Aven.");
        emitStatus();
      }
    },
  });

  function isConnected() {
    return Boolean(tokenStore.sessionInfo(store));
  }

  function isManagementOnly() {
    const marketing = getMarketingConfig(store);
    const appConfig = getAppConfig();
    const profiles = marketing.marketingProfiles || [];
    if (!profiles.length) return false;
    return !profiles.some((p) => {
      const sp = (appConfig.syncProfiles || []).find((x) => x.id === p.syncProfileId);
      return sp?.excelPath && require("fs").existsSync(sp.excelPath);
    });
  }

  function status() {
    const session = tokenStore.sessionInfo(store);
    return {
      connected: Boolean(session),
      shop: session?.shop || null,
      user: session?.user || null,
      device: session?.device || null,
      migration: migration.getState(store),
      migrating: Boolean(migrating),
      config: configSync.state(store),
      pendingConfirms: pending.count(store),
      marketingPaused: shopFlags ? shopFlags.marketing_paused : null,
      managementOnly: Boolean(session) && isManagementOnly(),
      lastRun,
      lastError,
    };
  }

  function emitStatus() {
    broadcast("cloud-status", status());
  }

  const runner = createRunner({
    store,
    client,
    getAppConfig,
    engine,
    log,
    shopId: () => tokenStore.sessionInfo(store)?.shop?.id,
    deviceName: () => tokenStore.sessionInfo(store)?.device?.name || "questo PC",
    hasCustomerFile: (marketing, automation) => {
      const profile = (marketing.marketingProfiles || []).find((p) => p.id === automation.marketingProfileId);
      const syncProfile = profile && (getAppConfig().syncProfiles || []).find((p) => p.id === profile.syncProfileId);
      return Boolean(syncProfile?.excelPath && require("fs").existsSync(syncProfile.excelPath));
    },
    gate: () => {
      if (!isConnected()) return { ok: false, reason: "not_connected" };
      if (!migration.isDone(store)) return { ok: false, reason: "migration_pending" };
      return { ok: true };
    },
  });

  /** Scarica la config se un altro PC (es. da remoto) l'ha cambiata. */
  async function pullConfigIfNewer(serverVersion) {
    if (!isConnected() || !migration.isDone(store)) return;
    const local = configSync.state(store);
    if (typeof serverVersion === "number" && serverVersion <= local.version && !local.dirty) return;
    const r = await configSync.sync(store, client);
    if (r.pulled) {
      log("[Account] Configurazione aggiornata da un altro PC.");
      broadcast("marketing-updated", getMarketingConfig(store));
      onConfigPulled();
    }
  }

  const telemetry = createTelemetry({
    store,
    client,
    isConnected: () => isConnected(),
    isWindowFocused,
    getIdleSeconds,
    onServerConfigVersion: (v) => pullConfigIfNewer(v).catch(() => {}),
  });

  runnerEvents.on("run-finished", () => {
    broadcast("marketing-updated", getMarketingConfig(store));
  });

  async function refreshMe() {
    if (!isConnected()) return null;
    const me = await client.me();
    shopFlags = me.shop;
    tokenStore.updateSessionInfo(store, { shop: { id: me.shop.id, name: me.shop.name }, user: me.user });
    return me;
  }

  async function migrate() {
    if (migrating) return migrating;
    migrating = (async () => {
      try {
        lastError = null;
        emitStatus();
        const result = await migration.runMigration({
          store,
          client,
          userDataDir: app.getPath("userData"),
          getAppConfig,
          engine,
          log,
          onProgress: () => emitStatus(),
        });
        broadcast("marketing-updated", getMarketingConfig(store));
        return result;
      } catch (err) {
        lastError = err.message;
        log(`[Account] Migrazione non completata: ${err.message}`);
        return { ok: false, message: err.message };
      } finally {
        migrating = null;
        emitStatus();
      }
    })();
    return migrating;
  }

  async function login() {
    lastError = null;
    const result = await authClient.startLogin(store, getInstallId());
    log(`[Account] Accesso eseguito: ${result.user.email} (${result.shop.name}).`);
    emitStatus();
    await refreshMe().catch(() => {});
    if (!migration.isDone(store)) await migrate();
    telemetry.flush();
    return status();
  }

  async function logout() {
    try {
      await client.logout();
    } catch {
      /* il token viene comunque rimosso da questo PC */
    }
    tokenStore.clearSession(store);
    shopFlags = null;
    emitStatus();
    return status();
  }

  async function startup() {
    telemetry.start();
    if (!isConnected()) return;
    try {
      await refreshMe();
      if (migration.isDone(store)) {
        const r = await configSync.sync(store, client);
        if (r.pulled) {
          broadcast("marketing-updated", getMarketingConfig(store));
          onConfigPulled();
        }
      }
    } catch (err) {
      lastError = err instanceof CloudError && err.kind === "offline" ? "Server non raggiungibile: invii in pausa." : err.message;
    }
    emitStatus();
  }

  async function runMarketing(options) {
    // Prima di valutare: modifiche fatte da un altro PC arrivano subito, non al riavvio.
    await pullConfigIfNewer().catch(() => {});
    const result = await runner.runMarketing(options);
    if (result && !result.skipped) {
      lastRun = { at: new Date().toISOString(), ok: result.ok, summary: result.summary || null, message: result.message || null };
      store.set("cloud.lastRun", lastRun);
      lastError = result.ok ? null : result.message;
      emitStatus();
    }
    return result;
  }

  async function preview(automation, columnMappingOverride) {
    const session = tokenStore.sessionInfo(store);
    if (!session || !migration.isDone(store)) {
      throw new Error("Accedi con l'account Aven per vedere i destinatari.");
    }
    return previewAutomation({
      store,
      client,
      shopId: session.shop.id,
      appConfig: getAppConfig(),
      automation,
      marketing: getMarketingConfig(store),
      engine,
      columnMappingOverride,
    });
  }

  /** Salva le modifiche dell'interfaccia e le porta sul server (se offline, al prossimo avvio). */
  function saveMarketing(patch) {
    const next = patchMarketingConfig(store, patch);
    if (isConnected() && migration.isDone(store)) {
      configSync
        .push(store, client, { reapply: () => patchMarketingConfig(store, patch) })
        .then((r) => {
          if (r.merged || r.pulled) broadcast("marketing-updated", getMarketingConfig(store));
          if (!r.ok && r.reason !== "not_migrated") log(`[Account] Configurazione salvata solo su questo PC: ${r.message || r.reason}`);
          emitStatus();
        })
        .catch(() => {});
    }
    return next;
  }

  return {
    client,
    status,
    login,
    cancelLogin: authClient.cancelLogin,
    logout,
    migrate,
    startup,
    runMarketing,
    preview,
    saveMarketing,
    listSends: (params) => client.listSends(params),
    recordSync: (event) => telemetry.recordSync(event),
    flushTelemetry: () => telemetry.flush(),
    verifySender: (body) => client.sender(body),
    requestPasswordCode: () => client.requestPasswordCode(),
    setPassword: async (code, password) => {
      await client.setPassword(code, password);
      tokenStore.updateSessionInfo(store, { user: { ...(tokenStore.sessionInfo(store)?.user || {}), has_password: true } });
      emitStatus();
      return { ok: true };
    },
    isConnected,
  };
}

module.exports = { createCloudService };
