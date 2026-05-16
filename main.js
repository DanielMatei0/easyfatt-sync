const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const Store = require("electron-store");
const {
  startGoogleOAuthFlow,
  isGoogleAuthorized,
  logoutGoogle,
} = require("./auth");
const { startScheduler, stopScheduler, shouldStartScheduler } = require("./scheduler");
const { runSync } = require("./syncRunner");
const {
  mergeConfig,
  getDefaultConfig,
  prepareConfigForScheduler,
  canRunAutomatedSync,
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

const AUTO_UPDATE_CHECK_DELAY_MS = 4000;

const store = new Store();
const APP_ICON_PATH = path.join(__dirname, "assets", "icon.png");

let mainWindow;

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
  const config = store.get("config") || getDefaultConfig();
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
  return store.get("config") || getDefaultConfig();
});

ipcMain.handle("save-config", async (_, config) => {
  const merged = mergeConfig(store, config);
  const prepared = restartScheduler(merged);
  store.set("config", prepared);

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

ipcMain.handle("sync-now", async () => {
  const config = store.get("config") || getDefaultConfig();

  if (!canRunAutomatedSync(config)) {
    throw new Error("Config incompleta: seleziona file Excel, Sheet ID e nome foglio.");
  }

  try {
    const result = await runSync(config, sendLog, store);

    if (result?.skipped) {
      return { ok: true, rows: 0, skipped: true };
    }

    const updated = store.get("config");
    sendConfigUpdated(updated);
    return result;
  } catch (error) {
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
  const config = store.get("config") || getDefaultConfig();

  return submitSupportRequest(form, {
    appVersion: app.getVersion(),
    platform: process.platform,
    platformLabel: getPlatformLabel(),
    lastSyncAt: config.lastSyncAt || null,
    lastSyncRows: config.lastSyncRows != null ? config.lastSyncRows : null,
    googleAuthorized: isGoogleAuthorized(),
    excelPath: config.excelPath || "",
    sheetName: config.sheetName || "",
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

  const config = store.get("config") || getDefaultConfig();
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
  return {
    lastCreatedAt: store.get("backupLastCreatedAt") || null,
    lastRestoredAt: store.get("backupLastRestoredAt") || null,
    lastAutomaticAt: store.get("backupLastAutomaticAt") || null,
  };
});
