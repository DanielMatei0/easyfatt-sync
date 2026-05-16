const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const Store = require("electron-store");
const {
  startGoogleOAuthFlow,
  isGoogleAuthorized,
  logoutGoogle,
} = require("./auth");
const { startScheduler, stopScheduler, shouldStartScheduler } = require("./scheduler");
const { runSync, runSyncAll } = require("./syncRunner");
const {
  mergeConfig,
  getDefaultConfig,
  prepareConfigForScheduler,
  canRunAutomatedSync,
  ensureConfigMigrated,
  getActiveProfile,
  findProfile,
  validateSyncProfiles,
} = require("./syncState");
const { LEGAL_VERSION } = require("./legalConstants");
const {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdateNow,
} = require("./updater");
const { submitSupportRequest, getPlatformLabel } = require("./support");
const { applyOpenAtLoginSetting } = require("./loginSettings");
const {
  buildSuggestedBackupFilename,
  createBackup,
  previewBackup,
  restoreBackup,
} = require("./backup");
const { toClientMessage } = require("./errors");
const { computeHealthStatus } = require("./healthStatus");
const {
  getHistory,
  filterHistory,
  exportHistoryReport,
  getDiffDetails,
  clearHistory,
} = require("./syncHistory");
const { pruneOrphanSnapshots, clearAllSnapshots } = require("./syncSnapshots");
const { previewExcelFile } = require("./excelUtils");
const { buildDiagnosticReport } = require("./diagnostics");
const fs = require("fs");
const os = require("os");

const AUTO_UPDATE_CHECK_DELAY_MS = 4000;

const store = new Store();
const APP_ICON_PATH = path.join(__dirname, "assets", "icon.png");

let mainWindow;

function sendHistoryUpdated() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("history-updated", getHistory(store));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  if (app.isPackaged) {
    initAutoUpdater(mainWindow);
  }
}

function sendLog(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("log", message);
  }
}

function sendConfigUpdated(config) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("config-updated", config);
  }
}

function restartScheduler(config) {
  const prepared = prepareConfigForScheduler(config, sendLog);
  stopScheduler();
  if (shouldStartScheduler(prepared)) {
    startScheduler(prepared, sendLog, store, sendConfigUpdated, app);
  }
  return prepared;
}

function scheduleStartupUpdateCheck() {
  if (!app.isPackaged) return;

  setTimeout(() => {
    checkForUpdates().catch((error) => {
      sendLog(`Controllo aggiornamenti non riuscito: ${toClientMessage(error)}`);
    });
  }, AUTO_UPDATE_CHECK_DELAY_MS);
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(APP_ICON_PATH);
  }

  createWindow();
  const config = ensureConfigMigrated(store.get("config") || getDefaultConfig());
  const prepared = restartScheduler(config);
  store.set("config", prepared);
  applyOpenAtLoginSetting(prepared.openAtLogin, sendLog);
  scheduleStartupUpdateCheck();
});

app.on("before-quit", () => {
  stopScheduler();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("get-config", () => {
  return ensureConfigMigrated(store.get("config") || getDefaultConfig());
});

ipcMain.handle("save-config", async (_, config) => {
  if (config?.syncProfiles) {
    const validation = validateSyncProfiles(config.syncProfiles);
    if (!validation.ok) {
      throw new Error(validation.errors[0]);
    }
    config.syncProfiles = validation.profiles;
  }

  const merged = mergeConfig(store, config);
  const prepared = restartScheduler(merged);
  store.set("config", prepared);

  // Pulisci snapshot orfani (profili eliminati)
  try {
    const validIds = (prepared.syncProfiles || []).map((p) => p.id).filter(Boolean);
    pruneOrphanSnapshots(store, validIds);
  } catch (_) {
    /* non bloccante */
  }

  applyOpenAtLoginSetting(prepared.openAtLogin, sendLog);
  sendConfigUpdated(prepared);

  return { ok: true };
});

ipcMain.handle("select-excel", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }],
  });

  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("select-backup-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Seleziona cartella backup automatici",
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || !result.filePaths?.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("connect-google", async () => {
  try {
    return await startGoogleOAuthFlow(sendLog);
  } catch (error) {
    throw new Error(toClientMessage(error, "google"));
  }
});

ipcMain.handle("is-google-authorized", async () => {
  return { authorized: isGoogleAuthorized() };
});

ipcMain.handle("logout-google", async () => {
  return logoutGoogle();
});

ipcMain.handle("sync-now", async (_, payload) => {
  const config = ensureConfigMigrated(store.get("config") || getDefaultConfig());
  const profileId = payload?.profileId;
  const profile = profileId
    ? findProfile(config, profileId)
    : getActiveProfile(config);

  if (!profile) {
    throw new Error("Nessun profilo di sincronizzazione configurato.");
  }

  if (!canRunAutomatedSync(profile)) {
    throw new Error(
      `Config incompleta per "${profile.name}": file Excel, Sheet ID e nome foglio.`
    );
  }

  try {
    const result = await runSync(profile, sendLog, store, {
      profileId: profile.id,
      profileName: profile.name,
      trigger: "manual",
    });

    if (result?.skipped) {
      return { ok: true, rows: 0, skipped: true, profileId: profile.id };
    }

    const updated = store.get("config");
    sendConfigUpdated(updated);
    sendHistoryUpdated();
    return result;
  } catch (error) {
    sendHistoryUpdated();
    throw new Error(toClientMessage(error, "sync"));
  }
});

ipcMain.handle("sync-all", async () => {
  const config = ensureConfigMigrated(store.get("config") || getDefaultConfig());

  if (!canRunAutomatedSync(config)) {
    throw new Error("Nessun profilo pronto per la sincronizzazione.");
  }

  try {
    const result = await runSyncAll(config, sendLog, store);
    const updated = store.get("config");
    sendConfigUpdated(updated);
    sendHistoryUpdated();
    return result;
  } catch (error) {
    sendHistoryUpdated();
    throw new Error(toClientMessage(error, "sync"));
  }
});

ipcMain.handle("get-legal-status", () => {
  return {
    accepted: store.get("legalAccepted") === true,
    acceptedAt: store.get("legalAcceptedAt") || null,
    version: store.get("legalVersion") || null,
    currentVersion: LEGAL_VERSION,
  };
});

ipcMain.handle("accept-legal", () => {
  const acceptedAt = new Date().toISOString();
  store.set("legalAccepted", true);
  store.set("legalAcceptedAt", acceptedAt);
  store.set("legalVersion", LEGAL_VERSION);
  return {
    ok: true,
    acceptedAt,
    version: LEGAL_VERSION,
  };
});

ipcMain.handle("open-external", async (_, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    throw new Error("URL non valido.");
  }
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("check-for-updates", async () => {
  return checkForUpdates();
});

ipcMain.handle("download-update", async () => {
  return downloadUpdate();
});

ipcMain.handle("install-update-now", () => {
  return installUpdateNow();
});

ipcMain.handle("submit-support-request", async (_, form) => {
  const config = ensureConfigMigrated(store.get("config") || getDefaultConfig());
  const active = getActiveProfile(config);
  const profiles = config.syncProfiles || [];

  let diagnosticReport = null;
  if (form?.attachDiagnostic && form?.diagnosticConsent) {
    diagnosticReport = buildDiagnosticReport({
      store,
      app,
      googleAuthorized: isGoogleAuthorized(),
      backupMeta: {
        lastCreatedAt: store.get("backupLastCreatedAt") || null,
        lastRestoredAt: store.get("backupLastRestoredAt") || null,
        lastAutomaticAt: store.get("backupLastAutomaticAt") || null,
      },
    });
  }

  return submitSupportRequest(form, {
    appVersion: app.getVersion(),
    platform: process.platform,
    platformLabel: getPlatformLabel(),
    lastSyncAt: active?.lastSyncAt || config.lastSyncAt || null,
    lastSyncRows:
      active?.lastSyncRows != null ? active.lastSyncRows : config.lastSyncRows ?? null,
    googleAuthorized: isGoogleAuthorized(),
    excelPath: active?.excelPath || "",
    sheetName: active?.sheetName || "",
    syncProfileCount: profiles.length,
    syncProfileNames: profiles.map((p) => p.name).filter(Boolean),
    activeProfileId: active?.id || config.activeProfileId || null,
    activeProfileName: active?.name || null,
    diagnosticReport,
  });
});

ipcMain.handle("backup-create", async (_, options) => {
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: "Salva backup Easyfatt Sync",
    defaultPath: buildSuggestedBackupFilename(),
    filters: [
      {
        name: "Backup Easyfatt Sync",
        extensions: ["easyfatt-sync-backup", "json"],
      },
    ],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, canceled: true };
  }

  const result = createBackup(
    store,
    app,
    saveResult.filePath,
    { ...options, backupType: "manual" },
    sendLog
  );

  if (result.ok) {
    const config = store.get("config") || getDefaultConfig();
    sendConfigUpdated(config);
  }

  return result;
});

async function pickBackupFilePath() {
  const openResult = await dialog.showOpenDialog(mainWindow, {
    title: "Seleziona backup Easyfatt Sync",
    properties: ["openFile"],
    filters: [
      {
        name: "Backup Easyfatt Sync",
        extensions: ["easyfatt-sync-backup", "json"],
      },
    ],
  });

  if (openResult.canceled || !openResult.filePaths?.length) {
    return { ok: false, canceled: true };
  }

  return { ok: true, filePath: openResult.filePaths[0] };
}

ipcMain.handle("backup-preview", async (_, filePath) => {
  let targetPath = filePath;

  if (!targetPath) {
    const picked = await pickBackupFilePath();
    if (!picked.ok) return picked;
    targetPath = picked.filePath;
  }

  return previewBackup(targetPath);
});

ipcMain.handle("backup-restore", async (_, filePath) => {
  if (!filePath) {
    return { ok: false, message: "Nessun file di backup selezionato." };
  }

  const result = restoreBackup(store, filePath, sendLog);

  if (!result.ok) {
    return result;
  }

  const config = ensureConfigMigrated(store.get("config") || getDefaultConfig());
  store.set("config", config);
  applyOpenAtLoginSetting(config.openAtLogin, sendLog);
  restartScheduler(config);
  sendConfigUpdated(config);

  return {
    ...result,
    legalStatus: {
      accepted: store.get("legalAccepted") === true,
      acceptedAt: store.get("legalAcceptedAt") || null,
      version: store.get("legalVersion") || null,
    },
  };
});

ipcMain.handle("get-backup-meta", () => {
  const config = ensureConfigMigrated(store.get("config") || getDefaultConfig());
  const folder = config.automaticBackupFolder || "";
  let folderOk = false;
  if (folder) {
    try {
      folderOk = fs.existsSync(folder) && fs.statSync(folder).isDirectory();
    } catch {
      folderOk = false;
    }
  }

  return {
    lastCreatedAt: store.get("backupLastCreatedAt") || null,
    lastRestoredAt: store.get("backupLastRestoredAt") || null,
    lastAutomaticAt: store.get("backupLastAutomaticAt") || null,
    automaticBackupEnabled: !!config.automaticBackupEnabled,
    automaticBackupFolder: folder,
    folderOk,
  };
});

ipcMain.handle("get-health-status", async () => {
  const config = ensureConfigMigrated(store.get("config") || getDefaultConfig());
  const history = getHistory(store);
  return computeHealthStatus({
    config,
    googleAuthorized: isGoogleAuthorized(),
    history,
  });
});

ipcMain.handle("get-sync-history", (_, filters) => {
  const history = getHistory(store);
  return filterHistory(history, filters || {});
});

ipcMain.handle("get-history-diff", (_, eventId) => {
  if (!eventId) return null;
  return getDiffDetails(store, eventId);
});

ipcMain.handle("clear-sync-history", () => {
  clearHistory(store);
  clearAllSnapshots(store);
  sendHistoryUpdated();
  return { ok: true };
});

ipcMain.handle("export-sync-history", async (_, filters) => {
  const history = getHistory(store);
  const report = exportHistoryReport(history, filters || {});

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: "Esporta cronologia sync",
    defaultPath: `easyfatt-sync-history-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "Report JSON", extensions: ["json"] }],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, canceled: true };
  }

  fs.writeFileSync(saveResult.filePath, JSON.stringify(report, null, 2), "utf8");
  return { ok: true, filePath: saveResult.filePath };
});

ipcMain.handle("preview-excel", async (_, excelPath) => {
  if (!excelPath) {
    throw new Error("Seleziona un file Excel.");
  }
  try {
    return await previewExcelFile(excelPath, 5);
  } catch (error) {
    throw new Error(toClientMessage(error, "sync"));
  }
});

ipcMain.handle("build-diagnostic-report", () => {
  return buildDiagnosticReport({
    store,
    app,
    googleAuthorized: isGoogleAuthorized(),
    backupMeta: {
      lastCreatedAt: store.get("backupLastCreatedAt") || null,
      lastRestoredAt: store.get("backupLastRestoredAt") || null,
      lastAutomaticAt: store.get("backupLastAutomaticAt") || null,
    },
  });
});

ipcMain.handle("backup-test", async () => {
  const dir = path.join(os.tmpdir(), "easyfatt-sync-backup-test");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, buildSuggestedBackupFilename());

  const result = createBackup(
    store,
    app,
    filePath,
    { backupType: "manual", includeGoogleToken: false },
    sendLog
  );

  if (result.ok && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore cleanup */
    }
  }

  return result;
});

