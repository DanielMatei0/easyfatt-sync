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
  connectGoogle: () => ipcRenderer.invoke("connect-google"),
  isGoogleAuthorized: () => ipcRenderer.invoke("is-google-authorized"),
  logoutGoogle: () => ipcRenderer.invoke("logout-google"),
  syncNow: () => ipcRenderer.invoke("sync-now"),
  getLegalStatus: () => ipcRenderer.invoke("get-legal-status"),
  acceptLegal: () => ipcRenderer.invoke("accept-legal"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdateNow: () => ipcRenderer.invoke("install-update-now"),
  submitSupportRequest: (form) => ipcRenderer.invoke("submit-support-request", form),
  onLog: (callback) => ipcRenderer.on("log", (_, message) => callback(message)),
  onConfigUpdated: (callback) =>
    ipcRenderer.on("config-updated", (_, config) => callback(config)),
  onUpdateStatus: (callback) => onUpdateEvent("update-status", callback),
  onUpdateProgress: (callback) => onUpdateEvent("update-progress", callback),
  onUpdateState: (callback) => onUpdateEvent("update-state", callback),
});
