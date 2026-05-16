const { syncExcelToSheets } = require("./sync");
const { notifySyncSuccess, notifySyncError } = require("./notifications");
const { recordSyncSuccess } = require("./syncState");
const { toClientMessage } = require("./errors");

let syncInProgress = false;

function isSyncInProgress() {
  return syncInProgress;
}

async function runSync(config, log, store, options = {}) {
  const { notify = true } = options;

  if (syncInProgress) {
    log("Sincronizzazione già in corso, salto questa esecuzione.");
    return { ok: true, rows: 0, skipped: true };
  }

  syncInProgress = true;
  const notificationsEnabled = config?.notificationsEnabled !== false;

  try {
    const result = await syncExcelToSheets(config, log);
    const rows = result?.rows ?? 0;

    if (!result?.skipped) {
      recordSyncSuccess(store, rows);
    }

    if (notify && notificationsEnabled && !result?.skipped && rows >= 0) {
      notifySyncSuccess(rows);
    }

    return result;
  } catch (error) {
    const clientMessage = toClientMessage(error, "sync");
    if (notify && notificationsEnabled) {
      notifySyncError(clientMessage);
    }
    const wrapped = new Error(clientMessage);
    wrapped.cause = error;
    throw wrapped;
  } finally {
    syncInProgress = false;
  }
}

module.exports = {
  runSync,
  isSyncInProgress,
};
