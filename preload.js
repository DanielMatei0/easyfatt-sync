const { contextBridge, ipcRenderer } = require("electron");

function onUpdateEvent(channel, callback) {
  const handler = (_, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("easyfattSync", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  selectExcel: () => ipcRenderer.invoke("select-excel"),
  selectBackupFolder: () => ipcRenderer.invoke("select-backup-folder"),
  connectGoogle: () => ipcRenderer.invoke("connect-google"),
  isGoogleAuthorized: () => ipcRenderer.invoke("is-google-authorized"),
  logoutGoogle: () => ipcRenderer.invoke("logout-google"),
  syncNow: (profileId) => ipcRenderer.invoke("sync-now", profileId ? { profileId } : {}),
  syncAll: () => ipcRenderer.invoke("sync-all"),
  getLegalStatus: () => ipcRenderer.invoke("get-legal-status"),
  acceptLegal: () => ipcRenderer.invoke("accept-legal"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdateNow: () => ipcRenderer.invoke("install-update-now"),
  submitSupportRequest: (form) => ipcRenderer.invoke("submit-support-request", form),
  reportError: (payload) => ipcRenderer.invoke("telemetry:error", payload),
  openSupportTicket: (input) => ipcRenderer.invoke("support:ticket", input),
  trackAnalytics: (ev) => ipcRenderer.invoke("analytics:track", ev),
  createBackup: (options) => ipcRenderer.invoke("backup-create", options),
  previewBackup: (filePath) => ipcRenderer.invoke("backup-preview", filePath),
  restoreBackup: (filePath) => ipcRenderer.invoke("backup-restore", filePath),
  getBackupMeta: () => ipcRenderer.invoke("get-backup-meta"),
  testBackup: () => ipcRenderer.invoke("backup-test"),
  getHealthStatus: () => ipcRenderer.invoke("get-health-status"),
  getSyncHistory: (filters) => ipcRenderer.invoke("get-sync-history", filters),
  getHistoryDiff: (eventId) => ipcRenderer.invoke("get-history-diff", eventId),
  clearSyncHistory: () => ipcRenderer.invoke("clear-sync-history"),
  exportSyncHistory: (filters) => ipcRenderer.invoke("export-sync-history", filters),
  previewExcel: (excelPath) => ipcRenderer.invoke("preview-excel", excelPath),
  buildDiagnosticReport: () => ipcRenderer.invoke("build-diagnostic-report"),
  getMarketingConfig: () => ipcRenderer.invoke("get-marketing-config"),
  saveMarketingConfig: (config) => ipcRenderer.invoke("save-marketing-config", config),
  getMarketingStats: () => ipcRenderer.invoke("get-marketing-stats"),
  previewMarketingExcel: (payload) => ipcRenderer.invoke("preview-marketing-excel", payload),
  getAutomationRecipients: (automationId) =>
    ipcRenderer.invoke("get-automation-recipients", automationId),
  previewMarketingAutomationDraft: (payload) =>
    ipcRenderer.invoke("preview-marketing-automation-draft", payload),
  simulateMarketingAutomationDraft: (payload) =>
    ipcRenderer.invoke("simulate-marketing-automation-draft", payload),
  simulateMarketingAutomation: (automationId) =>
    ipcRenderer.invoke("simulate-marketing-automation", automationId),
  simulateMarketingTestEmail: (payload) =>
    ipcRenderer.invoke("simulate-marketing-test-email", payload),
  clearMarketingHistory: () => ipcRenderer.invoke("clear-marketing-history"),
  sendMarketingBatch: (payload) => ipcRenderer.invoke("send-marketing-batch", payload),
  verifyMarketingSender: (payload) => ipcRenderer.invoke("verify-marketing-sender", payload),
  sendMarketingAutomation: (payload) => ipcRenderer.invoke("send-marketing-automation", payload),
  dryRunMarketingAutomation: (automationId) =>
    ipcRenderer.invoke("dry-run-marketing-automation", automationId),
  pickMarketingLogo: () => ipcRenderer.invoke("pick-marketing-logo"),
  getMarketingLogoDataUrl: (logoPath) => ipcRenderer.invoke("get-marketing-logo-data-url", logoPath),
  renderMarketingEmailPreview: (payload) =>
    ipcRenderer.invoke("render-marketing-email-preview", payload),
  compileMarketingTemplate: (payload) => ipcRenderer.invoke("compile-marketing-template", payload),
  onLog: (callback) => ipcRenderer.on("log", (_, message) => callback(message)),
  onConfigUpdated: (callback) =>
    ipcRenderer.on("config-updated", (_, config) => callback(config)),
  onHistoryUpdated: (callback) =>
    ipcRenderer.on("history-updated", (_, history) => callback(history)),
  onMarketingUpdated: (callback) =>
    ipcRenderer.on("marketing-updated", (_, config) => callback(config)),
  onUpdateStatus: (callback) => onUpdateEvent("update-status", callback),
  onUpdateProgress: (callback) => onUpdateEvent("update-progress", callback),
  onUpdateState: (callback) => onUpdateEvent("update-state", callback),
});
