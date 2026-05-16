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
  onLog: (callback) => ipcRenderer.on("log", (_, message) => callback(message)),
  onConfigUpdated: (callback) =>
    ipcRenderer.on("config-updated", (_, config) => callback(config)),
  onHistoryUpdated: (callback) =>
    ipcRenderer.on("history-updated", (_, history) => callback(history)),
  onUpdateStatus: (callback) => onUpdateEvent("update-status", callback),
  onUpdateProgress: (callback) => onUpdateEvent("update-progress", callback),
  onUpdateState: (callback) => onUpdateEvent("update-state", callback),
});
