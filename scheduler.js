const chokidar = require("chokidar");
const cron = require("node-cron");
const { runSync } = require("./syncRunner");
const { notifyMissingSyncReminder } = require("./notifications");
const { isSyncedToday } = require("./syncState");

let watcher = null;
let cronJobs = [];
let syncTimeout = null;
let isSyncing = false;

async function safeSync(config, log, store, onConfigUpdated) {
  if (isSyncing) {
    log("Sincronizzazione già in corso, salto questa esecuzione.");
    return null;
  }

  try {
    isSyncing = true;
    const result = await runSync(config, log, store);
    if (typeof onConfigUpdated === "function") {
      onConfigUpdated(store.get("config"));
    }
    return result;
  } catch (error) {
    log(`Errore sincronizzazione: ${error.message}`);
    return null;
  } finally {
    isSyncing = false;
  }
}

function runMissingSyncReminder(config, log, store, time) {
  if (!config?.missingSyncReminderEnabled) return;
  if (config?.notificationsEnabled === false) return;

  const latest = store.get("config") || config;
  if (isSyncedToday(latest.lastSyncAt)) return;

  notifyMissingSyncReminder(time);
  log(`Nessuna sincronizzazione eseguita oggi. Promemoria inviato alle ${time}.`);
}

function scheduleCron(time, handler) {
  const [hour, minute] = String(time).split(":");
  if (hour === undefined || minute === undefined || hour === "" || minute === "") {
    return;
  }

  const job = cron.schedule(`${Number(minute)} ${Number(hour)} * * *`, handler);
  cronJobs.push(job);
}

function startScheduler(config, log = console.log, store, onConfigUpdated) {
  stopScheduler();

  if (!config || !store) return;

  if (config.watchEnabled && config.excelPath) {
    watcher = chokidar.watch(config.excelPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 5000,
        pollInterval: 500,
      },
    });

    watcher.on("change", () => {
      log("File Excel modificato. Avvio sincronizzazione automatica tra pochi secondi...");

      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        const latest = store.get("config") || config;
        safeSync(latest, log, store, onConfigUpdated);
      }, 5000);
    });

    log("Monitoraggio file attivo.");
  }

  if (config.scheduleEnabled && Array.isArray(config.syncTimes)) {
    config.syncTimes.forEach((time) => {
      scheduleCron(time, () => {
        log(`Sync programmata ore ${time}`);
        const latest = store.get("config") || config;
        safeSync(latest, log, store, onConfigUpdated);
      });
      log(`Sync programmata attiva: ${time}`);
    });
  }

  if (config.missingSyncReminderEnabled && Array.isArray(config.reminderTimes)) {
    config.reminderTimes.forEach((time) => {
      scheduleCron(time, () => {
        const latest = store.get("config") || config;
        runMissingSyncReminder(latest, log, store, time);
      });
      log(`Promemoria sync mancante attivo: ${time}`);
    });
  }
}

function stopScheduler() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  cronJobs.forEach((job) => job.stop());
  cronJobs = [];

  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
}

function shouldStartScheduler(config) {
  if (!config) return false;
  return (
    config.watchEnabled ||
    config.scheduleEnabled ||
    (config.missingSyncReminderEnabled &&
      Array.isArray(config.reminderTimes) &&
      config.reminderTimes.length > 0)
  );
}

module.exports = {
  startScheduler,
  stopScheduler,
  shouldStartScheduler,
};
