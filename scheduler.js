const chokidar = require("chokidar");
const cron = require("node-cron");
const { runSync, isSyncInProgress } = require("./syncRunner");
const {
  notifyMissingSyncReminder,
  notifyAutomaticBackupSuccess,
  notifyAutomaticBackupError,
} = require("./notifications");
const { isSyncedToday, canRunAutomatedSync, isValidTimeHHMM } = require("./syncState");
const { createAutomaticBackup, isBackupInProgress } = require("./backup");

const FILE_WATCH_DEBOUNCE_MS = 5000;

let watcher = null;
let cronJobs = [];
let fileWatchDebounceTimer = null;
let fileWatchScheduled = false;

function stopAllCronJobs() {
  cronJobs.forEach((job) => {
    try {
      job.stop();
    } catch {
      /* ignore */
    }
  });
  cronJobs = [];
}

function scheduleCron(time, handler, log, label) {
  if (!isValidTimeHHMM(time)) {
    if (label) {
      log(`Orario non valido ignorato (${label}): ${time}`);
    }
    return false;
  }

  const [hour, minute] = String(time).split(":");
  const job = cron.schedule(`${Number(minute)} ${Number(hour)} * * *`, handler);
  cronJobs.push(job);
  return true;
}

function shouldStartAutomaticBackup(config) {
  return !!config?.automaticBackupEnabled && !!String(config.automaticBackupFolder || "").trim();
}

function scheduleAutomaticBackup(config, handler, log) {
  const time = config.automaticBackupTime || "20:00";

  if (!isValidTimeHHMM(time)) {
    log("Orario backup automatico non valido: job non avviato.");
    return;
  }

  const [hour, minute] = String(time).split(":");
  const h = Number(hour);
  const m = Number(minute);
  const frequency = config.automaticBackupFrequency || "daily";

  let cronExpr;
  let frequencyLabel = "giornaliero";

  if (frequency === "weekly") {
    cronExpr = `${m} ${h} * * 1`;
    frequencyLabel = "settimanale (lunedì)";
  } else if (frequency === "monthly") {
    cronExpr = `${m} ${h} 1 * *`;
    frequencyLabel = "mensile (primo del mese)";
  } else {
    cronExpr = `${m} ${h} * * *`;
  }

  const job = cron.schedule(cronExpr, handler);
  cronJobs.push(job);
  log(`Backup automatico attivo (${frequencyLabel} alle ${time}).`);
}

async function safeSync(config, log, store, onConfigUpdated) {
  if (!canRunAutomatedSync(config)) {
    return null;
  }

  const result = await runSync(config, log, store);

  if (result && typeof onConfigUpdated === "function") {
    onConfigUpdated(store.get("config"));
  }

  return result;
}

function runMissingSyncReminder(config, log, store, time) {
  if (!config?.missingSyncReminderEnabled) return;
  if (config?.notificationsEnabled === false) return;

  const latest = store.get("config") || config;
  if (isSyncedToday(latest.lastSyncAt)) return;

  notifyMissingSyncReminder(time);
  log(`Nessuna sincronizzazione eseguita oggi. Promemoria inviato alle ${time}.`);
}

function runAutomaticBackup(store, app, log) {
  if (isSyncInProgress()) {
    log("Backup automatico rimandato: sincronizzazione in corso.");
    return;
  }

  if (isBackupInProgress()) {
    log("Backup automatico già in corso, salto questa esecuzione.");
    return;
  }

  const config = store.get("config") || {};
  const result = createAutomaticBackup(store, app, config, log);

  if (result.ok) {
    log("Backup automatico creato");
    if (config.notificationsEnabled !== false) {
      notifyAutomaticBackupSuccess();
    }
    return;
  }

  const detail = result.message || "operazione non riuscita.";
  log(`Errore backup automatico: ${detail}`);

  if (config.notificationsEnabled !== false) {
    notifyAutomaticBackupError(detail);
  }
}

function scheduleFileWatch(config, log, store, onConfigUpdated) {
  if (!config.watchEnabled || !config.excelPath) return;

  watcher = chokidar.watch(config.excelPath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 5000,
      pollInterval: 500,
    },
  });

  watcher.on("change", () => {
    if (!canRunAutomatedSync(config)) return;

    log("File Excel modificato. Avvio sincronizzazione automatica tra pochi secondi...");
    fileWatchScheduled = true;

    if (fileWatchDebounceTimer) {
      clearTimeout(fileWatchDebounceTimer);
    }

    fileWatchDebounceTimer = setTimeout(() => {
      fileWatchDebounceTimer = null;
      fileWatchScheduled = false;

      if (isSyncInProgress()) {
        log("Sincronizzazione già in corso, salto questa esecuzione.");
        return;
      }

      const latest = store.get("config") || config;
      safeSync(latest, log, store, onConfigUpdated);
    }, FILE_WATCH_DEBOUNCE_MS);
  });

  watcher.on("error", (error) => {
    log(`Errore monitoraggio file: ${error.message}`);
  });

  log("Monitoraggio file attivo.");
}

function startScheduler(config, log = () => {}, store, onConfigUpdated, app) {
  stopScheduler();

  if (!config || !store) return;

  if (config.watchEnabled && config.excelPath) {
    if (canRunAutomatedSync(config)) {
      scheduleFileWatch(config, log, store, onConfigUpdated);
    } else {
      log("Monitoraggio file attivo ma mancano Sheet ID o nome foglio per la sync.");
    }
  }

  if (config.scheduleEnabled && Array.isArray(config.syncTimes)) {
    if (!canRunAutomatedSync(config)) {
      log("Sync programmata attiva ma configurazione incompleta (Excel / Google Sheet).");
    } else {
      config.syncTimes.forEach((time) => {
        const scheduled = scheduleCron(
          time,
          () => {
            log(`Sync programmata ore ${time}`);
            const latest = store.get("config") || config;
            safeSync(latest, log, store, onConfigUpdated);
          },
          log,
          "sync"
        );
        if (scheduled) {
          log(`Sync programmata attiva: ${time}`);
        }
      });
    }
  }

  if (config.missingSyncReminderEnabled && Array.isArray(config.reminderTimes)) {
    config.reminderTimes.forEach((time) => {
      const scheduled = scheduleCron(
        time,
        () => {
          const latest = store.get("config") || config;
          runMissingSyncReminder(latest, log, store, time);
        },
        log,
        "promemoria"
      );
      if (scheduled) {
        log(`Promemoria sync mancante attivo: ${time}`);
      }
    });
  }

  if (shouldStartAutomaticBackup(config)) {
    scheduleAutomaticBackup(
      config,
      () => runAutomaticBackup(store, app, log),
      log
    );
  } else if (config.automaticBackupEnabled) {
    log(
      "Backup automatico attivo ma manca la cartella destinazione. Impostala in Backup e ripristino."
    );
  }
}

function stopScheduler() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  stopAllCronJobs();

  if (fileWatchDebounceTimer) {
    clearTimeout(fileWatchDebounceTimer);
    fileWatchDebounceTimer = null;
  }

  fileWatchScheduled = false;
}

function shouldStartScheduler(config) {
  if (!config) return false;
  return (
    config.watchEnabled ||
    config.scheduleEnabled ||
    (config.missingSyncReminderEnabled &&
      Array.isArray(config.reminderTimes) &&
      config.reminderTimes.length > 0) ||
    shouldStartAutomaticBackup(config) ||
    !!config.automaticBackupEnabled
  );
}

module.exports = {
  startScheduler,
  stopScheduler,
  shouldStartScheduler,
  shouldStartAutomaticBackup,
};
