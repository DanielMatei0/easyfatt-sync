const fs = require("fs");
const path = require("path");
const { getDefaultConfig, ensureConfigMigrated } = require("./syncState");
const {
  readGoogleToken,
  writeGoogleToken,
  logoutGoogle,
} = require("./auth");

const BACKUP_APP_NAME = "Easyfatt Sync";
const BACKUP_VERSION = "1.0";
const BACKUP_EXTENSION = "easyfatt-sync-backup.json";

let backupInProgress = false;

function isBackupInProgress() {
  return backupInProgress;
}

function buildSuggestedBackupFilename() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `easyfatt-sync-backup-${y}-${m}-${d}.json`;
}

function buildAutomaticBackupFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `easyfatt-sync-backup-${y}-${m}-${d}-${h}-${min}.json`;
}

function isAutomaticBackupFileName(fileName) {
  return /^easyfatt-sync-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/i.test(fileName);
}

function isValidBackupTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return false;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function collectBackupPayload(store, app, options = {}) {
  const includeGoogleToken = !!options.includeGoogleToken;
  const config = store.get("config") || getDefaultConfig();

  let googleToken = null;
  let googleTokenIncluded = false;

  if (includeGoogleToken) {
    const token = readGoogleToken();
    if (token) {
      googleToken = token;
      googleTokenIncluded = true;
    }
  }

  const backupType = options.backupType === "automatic" ? "automatic" : "manual";

  return {
    app: BACKUP_APP_NAME,
    backupVersion: BACKUP_VERSION,
    backupType,
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    platform: process.platform,
    config: { ...config },
    legalAccepted: store.get("legalAccepted") === true,
    legalAcceptedAt: store.get("legalAcceptedAt") || null,
    legalVersion: store.get("legalVersion") || null,
    googleTokenIncluded,
    googleToken,
  };
}

function validateBackup(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, message: "File backup non valido." };
  }

  if (data.app !== BACKUP_APP_NAME) {
    return { ok: false, message: "File backup non valido." };
  }

  if (data.backupVersion !== BACKUP_VERSION) {
    return {
      ok: false,
      message: "Versione backup non supportata. Contatta il supporto Aven Labs.",
    };
  }

  if (!data.config || typeof data.config !== "object") {
    return { ok: false, message: "File backup non valido." };
  }

  if (data.googleTokenIncluded) {
    if (!data.googleToken || typeof data.googleToken !== "object") {
      return { ok: false, message: "File backup non valido." };
    }
  }

  return { ok: true, data };
}

function cleanupOldAutomaticBackups(folder, retention, log = () => {}) {
  const keep = Math.max(1, Math.min(100, Number(retention) || 10));

  if (!folder || !fs.existsSync(folder)) {
    return { ok: false, removed: 0 };
  }

  let entries;
  try {
    entries = fs.readdirSync(folder);
  } catch {
    return { ok: false, removed: 0 };
  }

  const automaticFiles = [];

  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    if (!isAutomaticBackupFileName(name)) continue;

    const fullPath = path.join(folder, name);
    let stat;

    try {
      stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    automaticFiles.push({ path: fullPath, mtime: stat.mtimeMs, name });
  }

  automaticFiles.sort((a, b) => b.mtime - a.mtime);
  const toDelete = automaticFiles.slice(keep);
  let removed = 0;

  for (const file of toDelete) {
    try {
      fs.unlinkSync(file.path);
      removed += 1;
      log(`Backup automatico rimosso (rotazione): ${file.name}`);
    } catch {
      /* ignore */
    }
  }

  return { ok: true, removed };
}

function createAutomaticBackup(store, app, config, log = () => {}) {
  if (backupInProgress) {
    return { ok: false, message: "Un backup è già in corso. Riprova tra qualche secondo." };
  }

  if (!config?.automaticBackupEnabled) {
    return { ok: false, message: "Backup automatico disattivato." };
  }

  const folder = String(config.automaticBackupFolder || "").trim();
  if (!folder) {
    return {
      ok: false,
      message: "Imposta una cartella per i backup automatici nelle impostazioni.",
    };
  }

  if (!isValidBackupTime(config.automaticBackupTime)) {
    return { ok: false, message: "Orario backup automatico non valido." };
  }

  try {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    fs.accessSync(folder, fs.constants.W_OK);
  } catch {
    return {
      ok: false,
      message: "Impossibile scrivere nella cartella backup. Verifica permessi e percorso.",
    };
  }

  backupInProgress = true;

  try {
    const filePath = path.join(folder, buildAutomaticBackupFilename());
    const result = createBackup(store, app, filePath, {
      includeGoogleToken: !!config.automaticBackupIncludeGoogleToken,
      backupType: "automatic",
    }, log);

    if (!result.ok) {
      return result;
    }

    cleanupOldAutomaticBackups(folder, config.automaticBackupRetention, log);
    store.set("backupLastAutomaticAt", result.createdAt);

    return result;
  } finally {
    backupInProgress = false;
  }
}

function createBackup(store, app, filePath, options = {}, log = () => {}) {
  if (backupInProgress && options.backupType !== "automatic") {
    return { ok: false, message: "Un backup è già in corso. Riprova tra qualche secondo." };
  }

  const startedHere = !backupInProgress;
  if (startedHere) {
    backupInProgress = true;
  }

  try {
    const payload = collectBackupPayload(store, app, options);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");

    const now = new Date().toISOString();
    store.set("backupLastCreatedAt", now);

    if (payload.googleTokenIncluded) {
      log("Backup creato con collegamento Google incluso.");
    } else {
      log("Backup creato correttamente.");
    }

    return {
      ok: true,
      filePath,
      createdAt: now,
      googleTokenIncluded: payload.googleTokenIncluded,
    };
  } catch {
    return {
      ok: false,
      message: "Errore durante il backup. Riprova.",
    };
  } finally {
    if (startedHere) {
      backupInProgress = false;
    }
  }
}

function previewBackup(filePath) {
  let raw;

  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return { ok: false, message: "Impossibile leggere il file di backup." };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "File backup non valido." };
  }

  const validation = validateBackup(parsed);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const backup = validation.data;

  const profiles = backup.config?.syncProfiles;
  const profileCount = Array.isArray(profiles) ? profiles.length : 0;

  return {
    ok: true,
    filePath,
    createdAt: backup.createdAt || null,
    appVersion: backup.appVersion || null,
    googleTokenIncluded: !!backup.googleTokenIncluded,
    profileCount,
    backupType: backup.backupType || "manual",
  };
}

function restoreBackup(store, filePath, log = () => {}) {
  let raw;

  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return { ok: false, message: "Impossibile leggere il file di backup." };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "File backup non valido." };
  }

  const validation = validateBackup(parsed);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const backup = validation.data;

  try {
    store.set(
      "config",
      ensureConfigMigrated({ ...getDefaultConfig(), ...backup.config })
    );
    store.set("legalAccepted", backup.legalAccepted === true);
    store.set("legalAcceptedAt", backup.legalAcceptedAt || null);
    store.set("legalVersion", backup.legalVersion || null);

    if (backup.googleTokenIncluded && backup.googleToken) {
      writeGoogleToken(backup.googleToken);
      log("Collegamento Google ripristinato dal backup.");
    } else {
      try {
        logoutGoogle();
      } catch {
        /* ignore: token file may be missing or unreadable */
      }
    }

    const now = new Date().toISOString();
    store.set("backupLastRestoredAt", now);

    log("Backup ripristinato. Le impostazioni sono state aggiornate.");

    return {
      ok: true,
      restoredAt: now,
      config: store.get("config"),
      legalAccepted: store.get("legalAccepted") === true,
      googleTokenIncluded: !!backup.googleTokenIncluded,
    };
  } catch {
    return {
      ok: false,
      message: "Errore durante il ripristino. Riprova.",
    };
  }
}

module.exports = {
  BACKUP_VERSION,
  BACKUP_EXTENSION,
  buildSuggestedBackupFilename,
  buildAutomaticBackupFilename,
  isValidBackupTime,
  isBackupInProgress,
  collectBackupPayload,
  validateBackup,
  previewBackup,
  cleanupOldAutomaticBackups,
  createAutomaticBackup,
  createBackup,
  restoreBackup,
};
