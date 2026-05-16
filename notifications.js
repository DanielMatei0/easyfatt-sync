const APP_TITLE = "Easyfatt Sync";

function getNotificationApi() {
  const electron = require("electron");
  if (!electron || typeof electron !== "object" || !electron.Notification) {
    return null;
  }
  return electron.Notification;
}

function isNotificationSupported() {
  const Notification = getNotificationApi();
  return Notification ? Notification.isSupported() : false;
}

function showNotification({ title, body }) {
  const Notification = getNotificationApi();
  if (!Notification || !Notification.isSupported()) {
    return false;
  }

  const notification = new Notification({
    title,
    body,
    silent: false,
  });

  notification.show();
  return true;
}

function notifySyncSuccess(rows) {
  const count = Number(rows) || 0;
  const rowLabel = count === 1 ? "riga aggiornata" : "righe aggiornate";

  return showNotification({
    title: APP_TITLE,
    body: `Sincronizzazione completata: ${count} ${rowLabel} su Google Sheets.`,
  });
}

function notifySyncError(message) {
  const detail = message ? String(message).trim() : "Errore sconosciuto.";

  return showNotification({
    title: `${APP_TITLE} — errore`,
    body: `Sincronizzazione non riuscita. ${detail}`,
  });
}

function notifyMissingSyncReminder(time) {
  const timeHint = time ? ` (promemoria ore ${time})` : "";

  return showNotification({
    title: `${APP_TITLE} — attenzione`,
    body: `Nessuna sincronizzazione eseguita oggi${timeHint}. Verifica Easyfatt o avvia una sync manuale.`,
  });
}

function notifyAutomaticBackupSuccess() {
  return showNotification({
    title: APP_TITLE,
    body: "Backup automatico creato. Le impostazioni sono state salvate nella cartella scelta.",
  });
}

function notifyAutomaticBackupError(message) {
  const detail = message ? String(message).trim() : "operazione non riuscita.";

  return showNotification({
    title: `${APP_TITLE} — errore`,
    body: `Backup automatico non riuscito. ${detail}`,
  });
}

module.exports = {
  isNotificationSupported,
  notifySyncSuccess,
  notifySyncError,
  notifyMissingSyncReminder,
  notifyAutomaticBackupSuccess,
  notifyAutomaticBackupError,
};
