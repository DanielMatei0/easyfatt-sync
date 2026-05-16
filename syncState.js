function isSyncedToday(lastSyncAt) {
  if (!lastSyncAt) return false;

  const syncDate = new Date(lastSyncAt);
  if (Number.isNaN(syncDate.getTime())) return false;

  const now = new Date();
  return (
    syncDate.getFullYear() === now.getFullYear() &&
    syncDate.getMonth() === now.getMonth() &&
    syncDate.getDate() === now.getDate()
  );
}

function recordSyncSuccess(store, rows) {
  const config = store.get("config") || {};
  const updated = {
    ...config,
    lastSyncAt: new Date().toISOString(),
    lastSyncRows: Number(rows) || 0,
  };
  store.set("config", updated);
  return updated;
}

function mergeConfig(store, incoming) {
  const existing = store.get("config") || {};
  const merged = { ...existing, ...incoming };

  if (incoming.lastSyncAt === undefined && existing.lastSyncAt) {
    merged.lastSyncAt = existing.lastSyncAt;
  }
  if (incoming.lastSyncRows === undefined && existing.lastSyncRows != null) {
    merged.lastSyncRows = existing.lastSyncRows;
  }

  store.set("config", merged);
  return merged;
}

function getDefaultConfig() {
  return {
    excelPath: "",
    spreadsheetId: "",
    sheetName: "Clienti",
    watchEnabled: false,
    scheduleEnabled: false,
    syncTimes: ["09:00", "13:00", "18:00"],
    openAtLogin: false,
    theme: "dark",
    lastSyncAt: null,
    lastSyncRows: null,
    notificationsEnabled: true,
    missingSyncReminderEnabled: true,
    reminderTimes: ["12:00", "19:00"],
  };
}

module.exports = {
  isSyncedToday,
  recordSyncSuccess,
  mergeConfig,
  getDefaultConfig,
};
