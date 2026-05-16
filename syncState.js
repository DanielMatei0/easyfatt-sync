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

function isValidTimeHHMM(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return false;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function filterValidTimes(times) {
  if (!Array.isArray(times)) return [];
  return times.map((t) => String(t).trim()).filter(isValidTimeHHMM);
}

function canRunAutomatedSync(config) {
  if (!config) return false;
  return !!(
    String(config.excelPath || "").trim() &&
    String(config.spreadsheetId || "").trim() &&
    String(config.sheetName || "").trim()
  );
}

/**
 * Normalizza orari e restituisce avvisi per log (non blocca il salvataggio).
 */
function prepareConfigForScheduler(config, log = () => {}) {
  const next = { ...config };
  const warnings = [];

  if (next.scheduleEnabled) {
    const valid = filterValidTimes(next.syncTimes);
    if (valid.length !== (next.syncTimes || []).length) {
      warnings.push("Alcuni orari di sincronizzazione non validi sono stati ignorati.");
    }
    next.syncTimes = valid.length ? valid : ["09:00"];
  }

  if (next.missingSyncReminderEnabled) {
    const valid = filterValidTimes(next.reminderTimes);
    if (valid.length !== (next.reminderTimes || []).length) {
      warnings.push("Alcuni orari promemoria non validi sono stati ignorati.");
    }
    next.reminderTimes = valid.length ? valid : ["12:00"];
  }

  if (next.automaticBackupEnabled && !isValidTimeHHMM(next.automaticBackupTime)) {
    warnings.push("Orario backup automatico non valido: verrà usato 20:00.");
    next.automaticBackupTime = "20:00";
  }

  if (next.watchEnabled && !String(next.excelPath || "").trim()) {
    warnings.push("Monitoraggio file attivo ma manca il percorso Excel.");
  }

  if (
    (next.scheduleEnabled || next.watchEnabled) &&
    !canRunAutomatedSync(next)
  ) {
    warnings.push(
      "Per la sincronizzazione automatica servono file Excel, ID foglio Google e nome foglio."
    );
  }

  warnings.forEach((w) => log(w));
  return next;
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
    automaticBackupEnabled: false,
    automaticBackupFrequency: "daily",
    automaticBackupTime: "20:00",
    automaticBackupFolder: "",
    automaticBackupRetention: 10,
    automaticBackupIncludeGoogleToken: false,
  };
}

module.exports = {
  isSyncedToday,
  recordSyncSuccess,
  mergeConfig,
  getDefaultConfig,
  isValidTimeHHMM,
  filterValidTimes,
  canRunAutomatedSync,
  prepareConfigForScheduler,
};
