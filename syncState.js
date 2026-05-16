const crypto = require("crypto");
const { normalizeMapping } = require("./columnMapping");

const DEFAULT_SYNC_TIMES = ["09:00", "13:00", "18:00"];
const LEGACY_PROFILE_NAME = "Sincronizzazione principale";

function createProfileId() {
  if (crypto.randomUUID) {
    return `profile_${crypto.randomUUID()}`;
  }
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isSyncedToday(lastSyncAt) {
  if (!lastSyncAt) return false;

  const syncDate = new Date(lastSyncAt);
  if (Number.isNaN(syncDate.getTime())) return false;

  const now = new Date();
  return (
    syncDate.getFullYear() === now.getFullYear() &&
    syncDate.getMonth() === now.getMonth() &&
    syncDate.getDate() === now.getDate()
  );
}

function isValidTimeHHMM(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return false;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function filterValidTimes(times) {
  if (!Array.isArray(times)) return [];
  return times.map((t) => String(t).trim()).filter(isValidTimeHHMM);
}

function getDefaultProfile(overrides = {}) {
  return {
    id: createProfileId(),
    name: "",
    excelPath: "",
    spreadsheetId: "",
    sheetName: "Clienti",
    watchEnabled: false,
    scheduleEnabled: false,
    syncTimes: [...DEFAULT_SYNC_TIMES],
    lastSyncAt: null,
    lastSyncRows: null,
    enabled: true,
    columnMapping: [],
    ...overrides,
  };
}

function getDefaultConfig() {
  return {
    syncProfiles: [],
    activeProfileId: null,
    openAtLogin: false,
    theme: "dark",
    notificationsEnabled: true,
    missingSyncReminderEnabled: true,
    reminderTimes: ["12:00", "19:00"],
    automaticBackupEnabled: false,
    automaticBackupFrequency: "daily",
    automaticBackupTime: "20:00",
    automaticBackupFolder: "",
    automaticBackupRetention: 10,
    automaticBackupIncludeGoogleToken: false,
    onboardingCompleted: false,
    onboardingSkipped: false,
  };
}

function normalizeProfile(profile, index = 0) {
  const p = profile && typeof profile === "object" ? profile : {};
  const id = String(p.id || "").trim() || createProfileId();

  return {
    id,
    name: String(p.name || "").trim() || `Connessione ${index + 1}`,
    excelPath: String(p.excelPath || "").trim(),
    spreadsheetId: String(p.spreadsheetId || "").trim(),
    sheetName: String(p.sheetName || "").trim() || "Clienti",
    watchEnabled: !!p.watchEnabled,
    scheduleEnabled: !!p.scheduleEnabled,
    syncTimes: filterValidTimes(p.syncTimes).length
      ? filterValidTimes(p.syncTimes)
      : [...DEFAULT_SYNC_TIMES],
    lastSyncAt: p.lastSyncAt || null,
    lastSyncRows: p.lastSyncRows != null ? Number(p.lastSyncRows) || 0 : null,
    enabled: p.enabled !== false,
    columnMapping: normalizeMapping(p.columnMapping),
  };
}

function normalizeProfiles(profiles) {
  if (!Array.isArray(profiles)) return [];

  const seen = new Set();
  const normalized = [];

  profiles.forEach((profile, index) => {
    let next = normalizeProfile(profile, index);
    if (seen.has(next.id)) {
      next = { ...next, id: createProfileId() };
    }
    seen.add(next.id);
    normalized.push(next);
  });

  return normalized;
}

function migrateLegacyConfig(config) {
  const next = { ...getDefaultConfig(), ...(config || {}) };

  if (Array.isArray(next.syncProfiles) && next.syncProfiles.length > 0) {
    next.syncProfiles = normalizeProfiles(next.syncProfiles);
    if (
      next.activeProfileId &&
      !next.syncProfiles.some((p) => p.id === next.activeProfileId)
    ) {
      next.activeProfileId = next.syncProfiles[0].id;
    }
    if (!next.activeProfileId && next.syncProfiles[0]) {
      next.activeProfileId = next.syncProfiles[0].id;
    }
    return next;
  }

  const hasLegacy = !!(
    String(next.excelPath || "").trim() ||
    String(next.spreadsheetId || "").trim() ||
    String(next.sheetName || "").trim()
  );

  if (!hasLegacy) {
    next.syncProfiles = [];
    next.activeProfileId = null;
    return next;
  }

  const profileId = next.activeProfileId || createProfileId();
  const legacyProfile = normalizeProfile(
    {
      id: profileId,
      name: LEGACY_PROFILE_NAME,
      excelPath: next.excelPath || "",
      spreadsheetId: next.spreadsheetId || "",
      sheetName: next.sheetName || "Clienti",
      watchEnabled: !!next.watchEnabled,
      scheduleEnabled: !!next.scheduleEnabled,
      syncTimes: next.syncTimes,
      lastSyncAt: next.lastSyncAt || null,
      lastSyncRows: next.lastSyncRows != null ? next.lastSyncRows : null,
      enabled: true,
    },
    0
  );

  next.syncProfiles = [legacyProfile];
  next.activeProfileId = legacyProfile.id;
  return next;
}

function ensureConfigMigrated(config) {
  return migrateLegacyConfig(config);
}

function findProfile(config, profileId) {
  if (!profileId || !config?.syncProfiles) return null;
  return config.syncProfiles.find((p) => p.id === profileId) || null;
}

function getEnabledProfiles(config) {
  return (config?.syncProfiles || []).filter((p) => p.enabled !== false);
}

function getActiveProfile(config) {
  const profiles = config?.syncProfiles || [];
  if (!profiles.length) return null;

  const active = findProfile(config, config.activeProfileId);
  if (active && active.enabled !== false) return active;

  return getEnabledProfiles(config)[0] || profiles[0] || null;
}

function canRunAutomatedSync(profileOrConfig) {
  if (!profileOrConfig) return false;

  if (Array.isArray(profileOrConfig.syncProfiles)) {
    return getEnabledProfiles(profileOrConfig).some((p) => canRunAutomatedSync(p));
  }

  if (profileOrConfig.enabled === false) return false;

  return !!(
    String(profileOrConfig.excelPath || "").trim() &&
    String(profileOrConfig.spreadsheetId || "").trim() &&
    String(profileOrConfig.sheetName || "").trim()
  );
}

function profileToSyncConfig(profile) {
  return {
    excelPath: profile.excelPath,
    spreadsheetId: profile.spreadsheetId,
    sheetName: profile.sheetName,
    profileId: profile.id,
    profileName: profile.name,
    columnMapping: profile.columnMapping || [],
  };
}

function validateProfile(profile, index = 0) {
  const errors = [];
  const label = profile?.name?.trim() || `Profilo ${index + 1}`;

  if (!String(profile?.name || "").trim()) {
    errors.push(`${label}: il nome connessione è obbligatorio.`);
  }
  if (!String(profile?.excelPath || "").trim()) {
    errors.push(`${label}: seleziona il file Excel.`);
  }
  if (!String(profile?.spreadsheetId || "").trim()) {
    errors.push(`${label}: inserisci l'ID Google Sheet.`);
  }
  if (!String(profile?.sheetName || "").trim()) {
    errors.push(`${label}: inserisci il nome scheda.`);
  }

  if (profile?.scheduleEnabled) {
    const valid = filterValidTimes(profile.syncTimes);
    if (!valid.length) {
      errors.push(`${label}: imposta almeno un orario valido (HH:MM).`);
    }
  }

  return errors;
}

function validateSyncProfiles(profiles) {
  const normalized = normalizeProfiles(profiles);
  const errors = [];
  const ids = new Set();

  normalized.forEach((profile, index) => {
    validateProfile(profile, index).forEach((e) => errors.push(e));
    if (ids.has(profile.id)) {
      errors.push(`ID profilo duplicato: ${profile.id}`);
    }
    ids.add(profile.id);
  });

  return { ok: errors.length === 0, errors, profiles: normalized };
}

function recordSyncSuccess(store, profileId, rows) {
  const config = ensureConfigMigrated(store.get("config") || getDefaultConfig());
  const rowCount = Number(rows) || 0;
  const now = new Date().toISOString();

  const syncProfiles = (config.syncProfiles || []).map((p) => {
    if (p.id !== profileId) return p;
    return {
      ...p,
      lastSyncAt: now,
      lastSyncRows: rowCount,
    };
  });

  const updated = {
    ...config,
    syncProfiles,
    lastSyncAt: now,
    lastSyncRows: rowCount,
  };

  store.set("config", updated);
  return updated;
}

function mergeProfiles(existingProfiles, incomingProfiles) {
  if (!Array.isArray(incomingProfiles)) {
    return normalizeProfiles(existingProfiles || []);
  }

  const byId = new Map();
  (existingProfiles || []).forEach((p) => byId.set(p.id, { ...p }));

  incomingProfiles.forEach((incoming) => {
    const id = String(incoming?.id || "").trim();
    const prev = id && byId.has(id) ? byId.get(id) : null;
    const base = prev || getDefaultProfile({ id: id || createProfileId() });
    const merged = normalizeProfile({ ...base, ...incoming });
    byId.set(merged.id, merged);
  });

  return normalizeProfiles(Array.from(byId.values()));
}

function mergeConfig(store, incoming) {
  const existing = ensureConfigMigrated(store.get("config") || getDefaultConfig());
  const incomingProfiles =
    incoming.syncProfiles !== undefined
      ? mergeProfiles(existing.syncProfiles, incoming.syncProfiles)
      : existing.syncProfiles;

  const merged = ensureConfigMigrated({
    ...existing,
    ...incoming,
    syncProfiles: incomingProfiles,
  });

  if (incoming.activeProfileId !== undefined) {
    merged.activeProfileId = incoming.activeProfileId;
  }

  if (
    merged.activeProfileId &&
    !merged.syncProfiles.some((p) => p.id === merged.activeProfileId)
  ) {
    merged.activeProfileId = merged.syncProfiles[0]?.id || null;
  }

  store.set("config", merged);
  return merged;
}

function anyEnabledProfileSyncedToday(config) {
  const enabled = getEnabledProfiles(config);
  if (!enabled.length) {
    return isSyncedToday(config?.lastSyncAt);
  }
  return enabled.some((p) => isSyncedToday(p.lastSyncAt));
}

function prepareConfigForScheduler(config, log = () => {}) {
  const next = ensureConfigMigrated(config);
  const warnings = [];

  (next.syncProfiles || []).forEach((profile) => {
    if (!profile.enabled) return;

    if (profile.scheduleEnabled) {
      const valid = filterValidTimes(profile.syncTimes);
      if (valid.length !== (profile.syncTimes || []).length) {
        warnings.push(
          `[${profile.name}] Alcuni orari di sincronizzazione non validi sono stati ignorati.`
        );
      }
      profile.syncTimes = valid.length ? valid : [...DEFAULT_SYNC_TIMES];
    }

    if (profile.watchEnabled && !String(profile.excelPath || "").trim()) {
      warnings.push(`[${profile.name}] Monitoraggio file attivo ma manca il percorso Excel.`);
    }

    if (
      (profile.scheduleEnabled || profile.watchEnabled) &&
      !canRunAutomatedSync(profile)
    ) {
      warnings.push(
        `[${profile.name}] Per la sync automatica servono Excel, ID foglio e nome scheda.`
      );
    }
  });

  if (next.missingSyncReminderEnabled) {
    const valid = filterValidTimes(next.reminderTimes);
    if (valid.length !== (next.reminderTimes || []).length) {
      warnings.push("Alcuni orari promemoria non validi sono stati ignorati.");
    }
    next.reminderTimes = valid.length ? valid : ["12:00"];
  }

  if (next.automaticBackupEnabled && !isValidTimeHHMM(next.automaticBackupTime)) {
    warnings.push("Orario backup automatico non valido: verrà usato 20:00.");
    next.automaticBackupTime = "20:00";
  }

  warnings.forEach((w) => log(w));
  return next;
}

function getProfilesForAutomation(config) {
  return getEnabledProfiles(config).filter(
    (p) => p.watchEnabled || p.scheduleEnabled
  );
}

module.exports = {
  LEGACY_PROFILE_NAME,
  createProfileId,
  isSyncedToday,
  recordSyncSuccess,
  mergeConfig,
  mergeProfiles,
  getDefaultConfig,
  getDefaultProfile,
  getActiveProfile,
  findProfile,
  getEnabledProfiles,
  getProfilesForAutomation,
  isValidTimeHHMM,
  filterValidTimes,
  canRunAutomatedSync,
  prepareConfigForScheduler,
  migrateLegacyConfig,
  ensureConfigMigrated,
  normalizeProfile,
  normalizeProfiles,
  validateProfile,
  validateSyncProfiles,
  profileToSyncConfig,
  anyEnabledProfileSyncedToday,
};
