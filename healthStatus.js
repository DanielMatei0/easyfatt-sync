/**
 * Calcolo stato salute dashboard ("Sta funzionando tutto?").
 */

const {
  isSyncedToday,
  getEnabledProfiles,
  canRunAutomatedSync,
  isValidTimeHHMM,
} = require("./syncState");
const { getRowsSyncedToday, getRecentErrors } = require("./syncHistory");

function parseTimeToday(timeStr, now = new Date()) {
  const [h, m] = String(timeStr).split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}

function getNextScheduledSync(config, now = new Date()) {
  const enabled = getEnabledProfiles(config).filter(
    (p) => p.scheduleEnabled && canRunAutomatedSync(p)
  );

  let nearest = null;

  for (const profile of enabled) {
    for (const time of profile.syncTimes || []) {
      if (!isValidTimeHHMM(time)) continue;
      let candidate = parseTimeToday(time, now);
      if (candidate <= now) {
        candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
      }
      if (!nearest || candidate < nearest) {
        nearest = candidate;
      }
    }
  }

  return nearest ? nearest.toISOString() : null;
}

function getLastSyncAcrossProfiles(config, history) {
  let latest = null;
  let latestName = null;

  for (const profile of config.syncProfiles || []) {
    if (profile.lastSyncAt) {
      const d = new Date(profile.lastSyncAt);
      if (!latest || d > latest) {
        latest = d;
        latestName = profile.name;
      }
    }
  }

  if (!latest && history.length) {
    const h = history[0];
    latest = new Date(h.at);
    latestName = h.profileName;
  }

  return {
    at: latest ? latest.toISOString() : null,
    profileName: latestName,
  };
}

function computeHealthStatus({ config, googleAuthorized, history: historyInput }) {
  const history = historyInput || [];
  const profiles = config?.syncProfiles || [];
  const enabled = getEnabledProfiles(config);
  const ready = enabled.filter(canRunAutomatedSync);
  const watchCount = enabled.filter((p) => p.watchEnabled && p.excelPath).length;
  const recentErrors = getRecentErrors(history, 3);
  const lastSync = getLastSyncAcrossProfiles(config, history);
  const rowsToday = getRowsSyncedToday(history);

  let level = "operational";
  const issues = [];

  if (!googleAuthorized) {
    level = "error";
    issues.push("Google non collegato");
  }

  if (!profiles.length) {
    level = level === "error" ? "error" : "attention";
    issues.push("Nessuna connessione configurata");
  } else if (ready.length < enabled.length) {
    level = level === "error" ? "error" : "attention";
    issues.push("Alcune connessioni hanno configurazione incompleta");
  }

  if (recentErrors.length > 0) {
    level = "error";
    issues.push(`${recentErrors.length} errore/i recente/i`);
  } else if (
    enabled.length > 0 &&
    !anyProfileSyncedToday(config, history) &&
    lastSync.at
  ) {
    level = level === "error" ? "error" : "attention";
    issues.push("Nessuna sincronizzazione oggi");
  }

  const levelLabels = {
    operational: "Operativo",
    attention: "Attenzione",
    error: "Errore",
  };

  return {
    level,
    levelLabel: levelLabels[level] || "Operativo",
    summary:
      issues.length === 0
        ? "Tutto sembra funzionare correttamente."
        : issues.join(" · "),
    googleAuthorized: !!googleAuthorized,
    profileCount: profiles.length,
    activeProfileCount: enabled.length,
    readyProfileCount: ready.length,
    watchCount,
    lastSyncAt: lastSync.at,
    lastSyncProfileName: lastSync.profileName,
    nextScheduledAt: getNextScheduledSync(config),
    rowsSyncedToday: rowsToday,
    recentErrors,
    issues,
  };
}

function anyProfileSyncedToday(config, history) {
  const enabled = getEnabledProfiles(config);
  if (enabled.some((p) => isSyncedToday(p.lastSyncAt))) return true;
  const today = new Date();
  return history.some((e) => {
    if (e.status !== "success") return false;
    const d = new Date(e.at);
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  });
}

module.exports = {
  computeHealthStatus,
  getNextScheduledSync,
};
