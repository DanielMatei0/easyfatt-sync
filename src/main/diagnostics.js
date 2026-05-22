const fs = require("fs");
const path = require("path");
const os = require("os");
const { APP_NAME, APP_PRODUCT_FAMILY, APP_SUPPORT_EMAIL } = require("./appConstants");
const { ensureConfigMigrated } = require("./syncState");
const { getHistory, filterHistory } = require("./syncHistory");
const { computeHealthStatus } = require("./healthStatus");

function sanitizeConfigForDiagnostics(config) {
  const migrated = ensureConfigMigrated(config || {});
  return {
    activeProfileId: migrated.activeProfileId,
    syncProfiles: (migrated.syncProfiles || []).map((p) => ({
      id: p.id,
      name: p.name,
      excelPath: p.excelPath ? path.basename(p.excelPath) : "",
      spreadsheetId: p.spreadsheetId ? "[present]" : "",
      sheetName: p.sheetName,
      watchEnabled: p.watchEnabled,
      scheduleEnabled: p.scheduleEnabled,
      syncTimes: p.syncTimes,
      enabled: p.enabled,
      lastSyncAt: p.lastSyncAt,
      lastSyncRows: p.lastSyncRows,
      columnMappingCount: Array.isArray(p.columnMapping) ? p.columnMapping.length : 0,
    })),
    openAtLogin: migrated.openAtLogin,
    notificationsEnabled: migrated.notificationsEnabled,
    automaticBackupEnabled: migrated.automaticBackupEnabled,
    automaticBackupFolder: migrated.automaticBackupFolder
      ? "[configured]"
      : "",
    onboardingCompleted: migrated.onboardingCompleted,
    onboardingSkipped: migrated.onboardingSkipped,
  };
}

function buildDiagnosticReport({
  store,
  app,
  googleAuthorized,
  backupMeta = {},
}) {
  const config = ensureConfigMigrated(store.get("config") || {});
  const history = getHistory(store);
  const health = computeHealthStatus({ config, googleAuthorized, history });

  return {
    app: APP_NAME,
    productFamily: APP_PRODUCT_FAMILY,
    generatedAt: new Date().toISOString(),
    appVersion: app?.getVersion?.() || "unknown",
    platform: process.platform,
    supportEmail: APP_SUPPORT_EMAIL,
    health,
    googleAuthorized: !!googleAuthorized,
    config: sanitizeConfigForDiagnostics(config),
    backupMeta: {
      lastCreatedAt: backupMeta.lastCreatedAt || null,
      lastRestoredAt: backupMeta.lastRestoredAt || null,
      lastAutomaticAt: backupMeta.lastAutomaticAt || null,
    },
    recentHistory: filterHistory(history, {}).slice(0, 20).map((evt) => {
      // Solo metadati: contatori del diff sì, dettagli mai
      const copy = { ...evt };
      delete copy.diffDetails;
      delete copy.hasDiffDetails;
      return copy;
    }),
    marketing: (() => {
      const m = store.get("marketingConfig");
      if (!m || typeof m !== "object") return { enabled: false };
      return {
        enabled: !!m.enabled,
        profilesCount: Array.isArray(m.marketingProfiles) ? m.marketingProfiles.length : 0,
        automationsCount: Array.isArray(m.automations) ? m.automations.length : 0,
        templatesCount: Array.isArray(m.templates) ? m.templates.length : 0,
        sendHistoryCount: Array.isArray(m.sendHistory) ? m.sendHistory.length : 0,
      };
    })(),
    note:
      "Nessun token Google, nessun contenuto Excel, nessun dettaglio diff e nessun dato destinatario marketing incluso.",
  };
}

function writeDiagnosticReportFile(report) {
  const dir = path.join(os.tmpdir(), "easyfatt-sync-diagnostics");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `diagnostic-${Date.now()}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");
  return filePath;
}

module.exports = {
  buildDiagnosticReport,
  writeDiagnosticReportFile,
  sanitizeConfigForDiagnostics,
};
