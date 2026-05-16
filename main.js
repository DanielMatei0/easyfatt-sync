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
const { mergeConfig, getDefaultConfig } = require("./syncState");
const { LEGAL_VERSION } = require("./legalConstants");
const {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdateNow,
} = require("./updater");
const { submitSupportRequest, getPlatformLabel } = require("./support");
const { applyOpenAtLoginSetting } = require("./loginSettings");

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
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  if (app.isPackaged) {
    initAutoUpdater(mainWindow);
  }
}

function sendLog(message) {
  if (mainWindow) {
    mainWindow.webContents.send("log", message);
  }
}

function sendConfigUpdated(config) {
  if (mainWindow) {
    mainWindow.webContents.send("config-updated", config);
  }
}

function restartScheduler(config) {
  stopScheduler();
  if (shouldStartScheduler(config)) {
    startScheduler(config, sendLog, store, sendConfigUpdated);
  }
}

function scheduleStartupUpdateCheck() {
  setTimeout(() => {
    checkForUpdates().catch((error) => {
      sendLog(`Controllo aggiornamenti non riuscito: ${error.message}`);
    });
  }, AUTO_UPDATE_CHECK_DELAY_MS);
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(APP_ICON_PATH);
  }

  createWindow();
  const config = store.get("config") || getDefaultConfig();
  applyOpenAtLoginSetting(config.openAtLogin, sendLog);
  restartScheduler(config);
  scheduleStartupUpdateCheck();
});

ipcMain.handle("get-config", () => {
  return store.get("config") || getDefaultConfig();
});

ipcMain.handle("save-config", async (_, config) => {
  const merged = mergeConfig(store, config);

  applyOpenAtLoginSetting(merged.openAtLogin, sendLog);

  restartScheduler(merged);
  sendConfigUpdated(merged);

  return { ok: true };
});

ipcMain.handle("select-excel", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Excel", extensions: ["xlsx", "xls"] },
    ],
  });

  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("connect-google", async () => {
  return await startGoogleOAuthFlow(sendLog);
});

ipcMain.handle("is-google-authorized", async () => {
  return { authorized: isGoogleAuthorized() };
});

ipcMain.handle("logout-google", async () => {
  return logoutGoogle();
});

ipcMain.handle("sync-now", async () => {
  const config = store.get("config") || getDefaultConfig();

  if (!config?.excelPath || !config?.spreadsheetId || !config?.sheetName) {
    throw new Error("Config incompleta: seleziona file Excel, Sheet ID e nome foglio.");
  }

  const result = await runSync(config, sendLog, store);
  const updated = store.get("config");
  sendConfigUpdated(updated);

  return result;
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
