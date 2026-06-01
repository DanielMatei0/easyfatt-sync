/**
 * Aggiornamenti automatici — electron-updater + electron-log
 *
 * Flusso: check → (available) download su richiesta → (downloaded) install su richiesta
 * Release workflow: vedi UPDATES.md
 */

const { app } = require("electron");
const log = require("electron-log");

const DEV_MESSAGE = "Aggiornamenti disponibili solo nella versione installata.";

let mainWindowRef = null;
let autoUpdaterInstance = null;
let updateReady = false;
let updateAvailable = false;
let pendingVersion = null;
let listenersRegistered = false;

function getAutoUpdater() {
  if (!app.isPackaged) {
    return null;
  }

  if (!autoUpdaterInstance) {
    autoUpdaterInstance = require("electron-updater").autoUpdater;
  }

  return autoUpdaterInstance;
}

function emitUpdate(payload) {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    return;
  }

  const event = { ...payload };

  mainWindowRef.webContents.send("update-state", event);

  if (event.state === "downloading" && event.percent != null) {
    mainWindowRef.webContents.send("update-progress", {
      percent: event.percent,
      transferred: event.transferred,
      total: event.total,
    });
  }
}

function initAutoUpdater(mainWindow) {
  mainWindowRef = mainWindow;
  const autoUpdater = getAutoUpdater();

  if (!autoUpdater) {
    log.info("Auto-updater disabilitato: app non in versione packaged.");
    return;
  }

  if (listenersRegistered) {
    return;
  }

  listenersRegistered = true;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    updateAvailable = false;
    updateReady = false;
    pendingVersion = null;

    log.info("Controllo aggiornamenti...");
    emitUpdate({
      state: "checking",
      message: "Controllo aggiornamenti in corso...",
    });
  });

  autoUpdater.on("update-available", (info) => {
    updateAvailable = true;
    updateReady = false;
    pendingVersion = info?.version || null;

    log.info("Aggiornamento disponibile:", pendingVersion);
    emitUpdate({
      state: "available",
      message: `Nuova versione disponibile: ${pendingVersion}`,
      version: pendingVersion,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    updateAvailable = false;
    updateReady = false;
    pendingVersion = null;

    log.info("Nessun aggiornamento:", info?.version);
    emitUpdate({
      state: "not-available",
      message: "L'app è già aggiornata.",
      version: info?.version,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent || 0);
    log.info(`Download aggiornamento: ${percent}%`);

    emitUpdate({
      state: "downloading",
      message: "Download aggiornamento in corso...",
      percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateAvailable = false;
    updateReady = true;
    pendingVersion = info?.version || pendingVersion;

    log.info("Aggiornamento scaricato:", pendingVersion);
    emitUpdate({
      state: "downloaded",
      message: "Aggiornamento scaricato. Riavvia per installare.",
      version: pendingVersion,
    });
  });

  autoUpdater.on("error", (error) => {
    log.error("Errore auto-updater:", error);
    emitUpdate({
      state: "error",
      message: `Errore aggiornamento: ${error?.message || "operazione non riuscita."}`,
    });
  });
}

function emitDevModeState() {
  emitUpdate({
    state: "dev",
    message: DEV_MESSAGE,
  });
}

async function checkForUpdates() {
  const autoUpdater = getAutoUpdater();

  if (!autoUpdater) {
    emitDevModeState();
    return { ok: false, message: DEV_MESSAGE };
  }

  updateReady = false;
  updateAvailable = false;
  pendingVersion = null;

  await autoUpdater.checkForUpdates();
  return { ok: true };
}

async function downloadUpdate() {
  const autoUpdater = getAutoUpdater();

  if (!autoUpdater) {
    emitDevModeState();
    return { ok: false, message: DEV_MESSAGE };
  }

  if (!updateAvailable && !updateReady) {
    const message = "Nessun aggiornamento disponibile da scaricare. Controlla prima gli aggiornamenti.";
    emitUpdate({ state: "error", message: `Errore aggiornamento: ${message}` });
    return { ok: false, message };
  }

  if (updateReady) {
    emitUpdate({
      state: "downloaded",
      message: "Aggiornamento scaricato. Riavvia per installare.",
      version: pendingVersion,
    });
    return { ok: true, alreadyDownloaded: true };
  }

  emitUpdate({
    state: "downloading",
    message: "Download aggiornamento in corso...",
    percent: 0,
  });

  await autoUpdater.downloadUpdate();
  return { ok: true };
}

function installUpdateNow() {
  const autoUpdater = getAutoUpdater();

  if (!autoUpdater) {
    emitDevModeState();
    return { ok: false, message: DEV_MESSAGE };
  }

  if (!updateReady) {
    return {
      ok: false,
      message: "Nessun aggiornamento scaricato da installare.",
    };
  }

  log.info("Installazione aggiornamento e riavvio...");
  emitUpdate({
    state: "installing",
    message: "Installazione aggiornamento in corso...",
  });

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });

  return { ok: true };
}

function isUpdateReady() {
  return updateReady;
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdateNow,
  isUpdateReady,
  emitDevModeState,
  DEV_MESSAGE,
};
