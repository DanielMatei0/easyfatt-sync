const { syncExcelToSheets } = require("./sync");
const {
  notifySyncSuccess,
  notifySyncError,
} = require("./notifications");
const { recordSyncSuccess } = require("./syncState");

async function runSync(config, log, store, options = {}) {
  const { notify = true } = options;
  const notificationsEnabled = config?.notificationsEnabled !== false;

  try {
    const result = await syncExcelToSheets(config, log);
    const rows = result?.rows ?? 0;

    recordSyncSuccess(store, rows);

    if (notify && notificationsEnabled) {
      notifySyncSuccess(rows);
    }

    return result;
  } catch (error) {
    if (notify && notificationsEnabled) {
      notifySyncError(error.message);
    }
    throw error;
  }
}

module.exports = {
  runSync,
};
