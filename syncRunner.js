const fs = require("fs/promises");
const path = require("path");
const { syncExcelToSheets } = require("./sync");
const { notifySyncSuccess, notifySyncError } = require("./notifications");
const {
  recordSyncSuccess,
  profileToSyncConfig,
  getEnabledProfiles,
  canRunAutomatedSync,
} = require("./syncState");
const { toClientMessage } = require("./errors");
const { recordSyncEvent } = require("./syncHistory");
const { validateExcelFile } = require("./excelUtils");
const { calculateDiff } = require("./diffEngine");
const { getSnapshot, setSnapshot, MAX_SNAPSHOT_ROWS } = require("./syncSnapshots");

function computeDiffAndSnapshot(store, profile, result) {
  const profileId = profile?.id;
  if (!profileId || !result || !Array.isArray(result.normalizedRows)) {
    return { diffSummary: null, diffDetails: null };
  }

  const headers = Array.isArray(result.headers) ? result.headers : [];
  const currentRows = result.normalizedRows;
  const previous = getSnapshot(store, profileId);

  let diffDetails = null;
  let diffSummary = null;
  const firstSnapshot = !previous;

  try {
    if (firstSnapshot) {
      diffSummary = {
        addedCount: currentRows.length,
        removedCount: 0,
        modifiedCount: 0,
        unchangedCount: 0,
        totalBefore: 0,
        totalAfter: currentRows.length,
        truncated: false,
        firstSnapshot: true,
      };
    } else {
      const diff = calculateDiff(previous.rows || [], currentRows, profile);
      diffDetails = diff;
      diffSummary = {
        addedCount: diff.added.length,
        removedCount: diff.removed.length,
        modifiedCount: diff.modified.length,
        unchangedCount: diff.unchangedCount,
        totalBefore: diff.totalBefore,
        totalAfter: diff.totalAfter,
        truncated: Boolean(diff.truncated),
        firstSnapshot: false,
      };
    }
  } catch (err) {
    diffSummary = null;
    diffDetails = null;
  }

  try {
    setSnapshot(store, profileId, headers, currentRows);
  } catch (_) {
    /* ignore snapshot save errors */
  }

  return { diffSummary, diffDetails };
}

function basenameSafe(p) {
  try {
    return p ? path.basename(String(p)) : null;
  } catch {
    return null;
  }
}

let syncInProgress = false;
let syncQueue = Promise.resolve();
let currentSyncProfileId = null;
const lastFingerprintByProfile = new Map();

function isSyncInProgress() {
  return syncInProgress;
}

function prefixLog(log, profileName) {
  if (!profileName) return log;
  return (message) => {
    if (typeof message === "string" && message.startsWith("__SYNC_PROGRESS__:")) {
      log(message);
      return;
    }
    log(`[${profileName}] ${message}`);
  };
}

function enqueueSync(task) {
  const run = async () => {
    syncInProgress = true;
    try {
      return await task();
    } finally {
      syncInProgress = false;
      currentSyncProfileId = null;
    }
  };

  const result = syncQueue.then(run, run);
  syncQueue = result.catch(() => {});
  return result;
}

async function getFileFingerprint(excelPath) {
  try {
    const stat = await fs.stat(excelPath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

function shouldSkipDuplicateSync(profileId, fingerprint, trigger) {
  if (!fingerprint || trigger === "manual") return false;
  const previous = lastFingerprintByProfile.get(profileId);
  return previous === fingerprint;
}

async function runSyncInternal(profile, log, store, options = {}) {
  const { notify = true, trigger = "manual" } = options;
  const profileId = profile?.id || options.profileId;
  const profileName = profile?.name || options.profileName || "Sync";
  const startedAt = Date.now();

  if (!profile || !canRunAutomatedSync(profile)) {
    throw new Error(
      `Config incompleta per "${profileName}": file Excel, Sheet ID e nome foglio.`
    );
  }

  if (currentSyncProfileId === profileId) {
    log(`${profileName}: sincronizzazione già in corso per questo profilo.`);
    return { ok: true, rows: 0, skipped: true, profileId };
  }

  const fileCheck = await validateExcelFile(profile.excelPath);
  if (!fileCheck.ok) {
    throw new Error(fileCheck.message);
  }

  const fingerprint = await getFileFingerprint(profile.excelPath);
  if (shouldSkipDuplicateSync(profileId, fingerprint, trigger)) {
    log(`${profileName}: file invariato, sync saltata.`);
    return { ok: true, rows: 0, skipped: true, profileId, reason: "unchanged" };
  }

  currentSyncProfileId = profileId;
  const config = store.get("config") || {};
  const notificationsEnabled = config.notificationsEnabled !== false;
  const profileLog = prefixLog(log, profileName);

  try {
    const result = await syncExcelToSheets(profileToSyncConfig(profile), profileLog);
    const rows = result?.rows ?? 0;
    const durationMs = Date.now() - startedAt;

    if (!result?.skipped && profileId) {
      recordSyncSuccess(store, profileId, rows);
      if (fingerprint) lastFingerprintByProfile.set(profileId, fingerprint);
    }

    // Diff vs snapshot precedente (best-effort, non blocca sync se fallisce)
    let diffSummary = null;
    let diffDetails = null;
    if (!result?.skipped) {
      try {
        const computed = computeDiffAndSnapshot(store, profile, result);
        diffSummary = computed.diffSummary;
        diffDetails = computed.diffDetails;
      } catch (_) {
        /* il sync è andato bene: il diff è informativo, non critico */
      }
    }

    recordSyncEvent(store, {
      profileId,
      profileName,
      status: "success",
      rows,
      durationMs,
      trigger,
      excelFile: basenameSafe(profile.excelPath),
      sheetName: profile.sheetName || null,
      diffSummary,
      diffDetails,
    });

    if (notify && notificationsEnabled && !result?.skipped && rows >= 0) {
      notifySyncSuccess(rows, profileName);
    }

    return { ...result, profileId, profileName, durationMs, diffSummary };
  } catch (error) {
    const clientMessage = toClientMessage(error, "sync");
    const durationMs = Date.now() - startedAt;

    recordSyncEvent(store, {
      profileId,
      profileName,
      status: "error",
      rows: 0,
      durationMs,
      message: clientMessage,
      trigger,
      excelFile: basenameSafe(profile.excelPath),
      sheetName: profile.sheetName || null,
    });

    if (notify && notificationsEnabled) {
      notifySyncError(clientMessage, profileName);
    }

    const wrapped = new Error(clientMessage);
    wrapped.cause = error;
    wrapped.profileId = profileId;
    wrapped.profileName = profileName;
    throw wrapped;
  } finally {
    currentSyncProfileId = null;
  }
}

async function runSync(profile, log, store, options = {}) {
  return enqueueSync(() => runSyncInternal(profile, log, store, options));
}

async function runSyncAll(config, log, store, options = {}) {
  const profiles = getEnabledProfiles(config).filter(canRunAutomatedSync);

  if (!profiles.length) {
    throw new Error("Nessun profilo configurato e pronto per la sincronizzazione.");
  }

  return enqueueSync(async () => {
    const results = [];

    for (const profile of profiles) {
      try {
        const result = await runSyncInternal(profile, log, store, {
          ...options,
          notify: options.notify !== false,
          trigger: options.trigger || "manual",
        });
        results.push(result);
      } catch (error) {
        results.push({
          ok: false,
          profileId: profile.id,
          profileName: profile.name,
          error: error.message,
        });
        if (options.stopOnError) {
          throw error;
        }
      }
    }

    return { ok: true, results };
  });
}

module.exports = {
  runSync,
  runSyncAll,
  isSyncInProgress,
};
