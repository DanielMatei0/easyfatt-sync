const chokidar = require("chokidar");
const cron = require("node-cron");
const { runSync, isSyncInProgress } = require("./syncRunner");
const {
  notifyMissingSyncReminder,
  notifyAutomaticBackupSuccess,
  notifyAutomaticBackupError,
} = require("./notifications");
const {
  anyEnabledProfileSyncedToday,
  canRunAutomatedSync,
  isValidTimeHHMM,
  ensureConfigMigrated,
  findProfile,
  getProfilesForAutomation,
  getEnabledProfiles,
} = require("./syncState");
const { createAutomaticBackup, isBackupInProgress } = require("./backup");

const FILE_WATCH_DEBOUNCE_MS = 5000;

let cronJobs = [];
const watchers = new Map();
const watchDebounceTimers = new Map();

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

function stopAllWatchers() {
  watchers.forEach((watcher) => {
    try {
      watcher.close();
    } catch {
      /* ignore */
    }
  });
  watchers.clear();

  watchDebounceTimers.forEach((timer) => clearTimeout(timer));
  watchDebounceTimers.clear();
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

async function safeSyncProfile(profileId, log, store, onConfigUpdated, trigger = "auto") {
  const config = ensureConfigMigrated(store.get("config") || {});
  const profile = findProfile(config, profileId);

  if (!profile || profile.enabled === false || !canRunAutomatedSync(profile)) {
    return null;
  }

  const result = await runSync(profile, log, store, {
    profileId: profile.id,
    profileName: profile.name,
    trigger,
  });

  if (result && typeof onConfigUpdated === "function") {
    onConfigUpdated(store.get("config"));
  }

  return result;
}

function runMissingSyncReminder(config, log, store, time) {
  if (!config?.missingSyncReminderEnabled) return;
  if (config?.notificationsEnabled === false) return;

  const latest = ensureConfigMigrated(store.get("config") || config);
  if (anyEnabledProfileSyncedToday(latest)) return;

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

function scheduleFileWatchForPath(excelPath, profileIds, log, store, onConfigUpdated) {
  if (!excelPath || !profileIds.length) return;

  const watcher = chokidar.watch(excelPath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 5000,
      pollInterval: 500,
    },
  });

  watcher.on("change", () => {
    const latest = ensureConfigMigrated(store.get("config") || {});
    const runnableIds = profileIds.filter((id) => {
      const p = findProfile(latest, id);
      return p && p.enabled !== false && p.watchEnabled && canRunAutomatedSync(p);
    });

    if (!runnableIds.length) return;

    const names = runnableIds
      .map((id) => findProfile(latest, id)?.name)
      .filter(Boolean)
      .join(", ");

    log(
      `File Excel modificato (${excelPath}). Sync automatica tra pochi secondi${names ? `: ${names}` : ""}...`
    );

    const timerKey = excelPath;
    if (watchDebounceTimers.has(timerKey)) {
      clearTimeout(watchDebounceTimers.get(timerKey));
    }

    watchDebounceTimers.set(
      timerKey,
      setTimeout(async () => {
        watchDebounceTimers.delete(timerKey);

        if (isSyncInProgress()) {
          log("Sincronizzazione già in corso, salto questa esecuzione.");
          return;
        }

        for (const profileId of runnableIds) {
          await safeSyncProfile(profileId, log, store, onConfigUpdated, "watch");
        }
      }, FILE_WATCH_DEBOUNCE_MS)
    );
  });

  watcher.on("error", (error) => {
    log(`Errore monitoraggio file (${excelPath}): ${error.message}`);
  });

  watchers.set(excelPath, watcher);
  log(`Monitoraggio file attivo: ${excelPath}`);
}

function startScheduler(config, log = () => {}, store, onConfigUpdated, app) {
  stopScheduler();

  if (!config || !store) return;

  const prepared = ensureConfigMigrated(config);
  const automationProfiles = getProfilesForAutomation(prepared);

  const watchGroups = new Map();
  automationProfiles.forEach((profile) => {
    if (!profile.watchEnabled || !profile.excelPath) return;
    if (!watchGroups.has(profile.excelPath)) {
      watchGroups.set(profile.excelPath, []);
    }
    watchGroups.get(profile.excelPath).push(profile.id);
  });

  watchGroups.forEach((profileIds, excelPath) => {
    const runnable = profileIds.filter((id) => {
      const p = findProfile(prepared, id);
      return p && canRunAutomatedSync(p);
    });

    if (!runnable.length) {
      log(`Monitoraggio file attivo ma configurazione incompleta per: ${excelPath}`);
      return;
    }

    scheduleFileWatchForPath(excelPath, runnable, log, store, onConfigUpdated);
  });

  getEnabledProfiles(prepared).forEach((profile) => {
    if (!profile.scheduleEnabled || !Array.isArray(profile.syncTimes)) return;

    if (!canRunAutomatedSync(profile)) {
      log(`Sync programmata attiva ma configurazione incompleta per "${profile.name}".`);
      return;
    }

    profile.syncTimes.forEach((time) => {
      const scheduled = scheduleCron(
        time,
        () => {
          log(`[${profile.name}] Sync programmata ore ${time}`);
          safeSyncProfile(profile.id, log, store, onConfigUpdated, "schedule");
        },
        log,
        `${profile.name} sync`
      );
      if (scheduled) {
        log(`[${profile.name}] Sync programmata attiva: ${time}`);
      }
    });
  });

  if (prepared.missingSyncReminderEnabled && Array.isArray(prepared.reminderTimes)) {
    prepared.reminderTimes.forEach((time) => {
      const scheduled = scheduleCron(
        time,
        () => {
          const latest = ensureConfigMigrated(store.get("config") || prepared);
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

  if (shouldStartAutomaticBackup(prepared)) {
    scheduleAutomaticBackup(
      prepared,
      () => runAutomaticBackup(store, app, log),
      log
    );
  } else if (prepared.automaticBackupEnabled) {
    log(
      "Backup automatico attivo ma manca la cartella destinazione. Impostala in Backup e ripristino."
    );
  }
}

function stopScheduler() {
  stopAllWatchers();
  stopAllCronJobs();
}

function shouldStartScheduler(config) {
  if (!config) return false;
  const prepared = ensureConfigMigrated(config);

  const hasProfileAutomation = getProfilesForAutomation(prepared).some(
    (p) => p.watchEnabled || p.scheduleEnabled
  );

  return (
    hasProfileAutomation ||
    (prepared.missingSyncReminderEnabled &&
      Array.isArray(prepared.reminderTimes) &&
      prepared.reminderTimes.length > 0) ||
    shouldStartAutomaticBackup(prepared) ||
    !!prepared.automaticBackupEnabled
  );
}

module.exports = {
  startScheduler,
  stopScheduler,
  shouldStartScheduler,
  shouldStartAutomaticBackup,
};
