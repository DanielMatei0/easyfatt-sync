const excelPathInput = document.getElementById("excelPath");
const spreadsheetIdInput = document.getElementById("spreadsheetId");
const sheetNameInput = document.getElementById("sheetName");
const watchEnabledInput = document.getElementById("watchEnabled");
const scheduleEnabledInput = document.getElementById("scheduleEnabled");
const openAtLoginInput = document.getElementById("openAtLogin");
const notificationsEnabledInput = document.getElementById("notificationsEnabled");
const missingSyncReminderEnabledInput = document.getElementById("missingSyncReminderEnabled");
const syncTimesInput = document.getElementById("syncTimes");
const reminderTimesInput = document.getElementById("reminderTimes");
const scheduleFields = document.getElementById("scheduleFields");
const reminderFields = document.getElementById("reminderFields");

const logoutBtn = document.getElementById("logoutBtn");
const authBtn = document.getElementById("authBtn");
const authGoogleStatus = document.getElementById("authGoogleStatus");

const browseBtn = document.getElementById("browseBtn");
const saveBtn = document.getElementById("saveBtn");
const syncBtn = document.getElementById("syncBtn");
const syncBtnLabel = document.getElementById("syncBtnLabel");

const statusEl = document.getElementById("status");
const syncProgressWrap = document.getElementById("syncProgressWrap");
const syncProgressLabel = document.getElementById("syncProgressLabel");
const syncProgressFill = document.getElementById("syncProgressFill");
const syncProgressBar = document.querySelector(".sync-progress-bar");
const activityList = document.getElementById("activityList");
const activityEmpty = document.getElementById("activityEmpty");
const clearActivityBtn = document.getElementById("clearActivityBtn");

const supportModal = document.getElementById("supportModal");
const supportForm = document.getElementById("supportForm");
const supportNameInput = document.getElementById("supportName");
const supportEmailInput = document.getElementById("supportEmail");
const supportPhoneInput = document.getElementById("supportPhone");
const supportIssueTypeInput = document.getElementById("supportIssueType");
const supportMessageInput = document.getElementById("supportMessage");
const supportFeedback = document.getElementById("supportFeedback");
const supportSubmitBtn = document.getElementById("supportSubmitBtn");
const supportCancelBtn = document.getElementById("supportCancelBtn");
const supportCloseBtn = document.getElementById("supportCloseBtn");
const supportSuccessPanel = document.getElementById("supportSuccessPanel");
const openSupportBtn = document.getElementById("openSupportBtn");

const SUPPORT_EMAIL = "support@aven-labs.com";
const SUPPORT_FIELD_ERRORS = {
  name: document.getElementById("supportNameError"),
  email: document.getElementById("supportEmailError"),
  issueType: document.getElementById("supportIssueTypeError"),
  message: document.getElementById("supportMessageError"),
};
const themeToggle = document.getElementById("themeToggle");
const themeToggleLabel = document.getElementById("themeToggleLabel");
const unsavedBanner = document.getElementById("unsavedBanner");

const heroLastSync = document.getElementById("heroLastSync");
const heroLastSyncRows = document.getElementById("heroLastSyncRows");
const heroGoogle = document.getElementById("heroGoogle");
const heroWatch = document.getElementById("heroWatch");

const badgeGoogle = document.getElementById("badgeGoogle");
const badgeWatch = document.getElementById("badgeWatch");
const badgeSchedule = document.getElementById("badgeSchedule");
const badgeLastSync = document.getElementById("badgeLastSync");

const legalGate = document.getElementById("legalGate");
const appShell = document.getElementById("appShell");
const legalAcceptCheckbox = document.getElementById("legalAcceptCheckbox");
const legalAcceptBtn = document.getElementById("legalAcceptBtn");
const footerAppVersion = document.getElementById("footerAppVersion");
const settingsAppVersion = document.getElementById("settingsAppVersion");
const checkUpdatesBtn = document.getElementById("checkUpdatesBtn");
const downloadUpdateBtn = document.getElementById("downloadUpdateBtn");
const installUpdateBtn = document.getElementById("installUpdateBtn");
const updateStatusText = document.getElementById("updateStatusText");
const updateProgressWrap = document.getElementById("updateProgressWrap");
const updateProgressFill = document.getElementById("updateProgressFill");
const updateProgressLabel = document.getElementById("updateProgressLabel");

const VALID_THEMES = ["dark", "light"];
const SYNC_LABEL_IDLE = "Sincronizza ora";
const SYNC_LABEL_BUSY = "Sincronizzazione...";
const MAX_ACTIVITIES = 50;

const ACTIVITY_ICONS = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
  syncing: "↻",
};

const LOG_ACTIVITY_RULES = [
  {
    test: /^__SYNC_PROGRESS__:/,
    skip: true,
  },
  {
    test: /Sincronizzazione completata:\s*(\d+)\s*righe/i,
    map: (m) => ({
      type: "success",
      title: "Sincronizzazione completata",
      description: `${m[1]} clienti aggiornati su Google Sheets`,
    }),
  },
  {
    test: /Avvio sincronizzazione|Sync programmata ore|File Excel modificato/i,
    map: () => ({
      type: "syncing",
      title: "Sincronizzazione in corso",
      description: "Lettura file Excel e aggiornamento Google Sheet...",
    }),
  },
  {
    test: /Sto leggendo il file clienti/i,
    map: () => ({
      type: "syncing",
      title: "Sincronizzazione in corso",
      description: "Sto leggendo il file clienti...",
    }),
  },
  {
    test: /Sto preparando i dati/i,
    map: () => ({
      type: "syncing",
      title: "Sincronizzazione in corso",
      description: "Sto preparando i dati da caricare...",
    }),
  },
  {
    test: /Mi collego a Google|collegamento Google|Account Google collegato/i,
    map: (m, msg) => ({
      type: msg.includes("collegato") ? "success" : "syncing",
      title: msg.includes("collegato") ? "Google collegato" : "Sincronizzazione in corso",
      description: msg.includes("collegato")
        ? "Il tuo account Google è pronto per la sincronizzazione."
        : "Mi collego a Google Sheets...",
    }),
  },
  {
    test: /Sto aggiornando il foglio|Sto caricando i dati/i,
    map: () => ({
      type: "syncing",
      title: "Sincronizzazione in corso",
      description: "Sto aggiornando il foglio Google...",
    }),
  },
  {
    test: /Nessuna sincronizzazione eseguita oggi/i,
    map: (m, msg) => ({
      type: "warning",
      title: "Attenzione",
      description: msg.includes("alle ")
        ? msg.replace(/^Nessuna sincronizzazione eseguita oggi\.\s*/i, "")
        : "Nessuna sincronizzazione eseguita oggi",
    }),
  },
  {
    test: /^Errore/i,
    map: (m, msg) => ({
      type: "error",
      title: "Errore",
      description: msg.replace(/^Errore[:\s]*/i, "").trim() || "Si è verificato un problema.",
    }),
  },
  {
    test: /Impostazioni salvate|Privacy Policy e Termini accettati|Account Google disconnesso|Monitoraggio file attivo|Sync programmata attiva|Promemoria sync mancante attivo/i,
    map: (m, msg) => ({
      type: "success",
      title: "Operazione completata",
      description: friendlyStatusText(msg),
    }),
  },
  {
    test: /Google già collegato|Collega Google per abilitare/i,
    map: (m, msg) => ({
      type: "info",
      title: msg.includes("già") ? "Google già collegato" : "Collega Google",
      description: msg.includes("già")
        ? "Puoi avviare la sincronizzazione quando vuoi."
        : "Collega il tuo account per sincronizzare i clienti.",
    }),
  },
  {
    test: /Sync già in corso/i,
    map: () => ({
      type: "info",
      title: "Sincronizzazione già attiva",
      description: "Un’altra sincronizzazione è già in corso.",
    }),
  },
];

let savedConfigSnapshot = null;
let googleAuthorized = false;
let lastSyncAt = null;
let lastSyncRows = null;
let isSyncing = false;
let legalAccepted = false;
let activities = [];
let syncProgressHideTimer = null;
let lastSyncProgressPercent = 0;

function formatActivityTime(date = new Date()) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function friendlyStatusText(message) {
  const map = {
    "Impostazioni salvate.": "Le tue impostazioni sono state salvate.",
    "Privacy Policy e Termini accettati.": "Hai accettato Privacy Policy e Termini.",
    "Account Google disconnesso.": "Il collegamento Google è stato rimosso.",
    "Google collegato correttamente.": "Il tuo account Google è collegato.",
    "Monitoraggio file attivo.": "Il file Excel viene monitorato automaticamente.",
  };

  if (map[message]) return map[message];

  return message
    .replace(/^Leggo file Excel:.*/i, "Sto leggendo il file clienti...")
    .replace(/^Pulisco il foglio Google\.\.\./i, "Sto aggiornando il foglio Google...")
    .replace(/^Scrivo i nuovi dati\.\.\./i, "Sto caricando i dati aggiornati...")
    .replace(
      /Sincronizzazione completata:\s*(\d+)\s*righe\.?/i,
      (_, n) => `Sincronizzazione completata: ${n} clienti aggiornati`
    )
    .replace(/^Completata:\s*(\d+)\s*righe aggiornate\.?/i, (_, n) => `${n} clienti aggiornati`)
    .replace(/^Errore:\s*/i, "")
    .replace(/^Apro browser per collegamento Google\.\.\./i, "Apro il browser per collegare Google...")
    .replace(/^Avvio collegamento Google\.\.\./i, "Collegamento Google in corso...");
}

function setStatus(message, state = "idle") {
  const friendly = friendlyStatusText(message);
  statusEl.textContent = friendly;
  statusEl.dataset.state = state;
}

function showSyncProgress(label = "Sincronizzazione in corso...") {
  if (!syncProgressWrap) return;
  clearTimeout(syncProgressHideTimer);
  syncProgressWrap.hidden = false;
  if (syncProgressLabel) syncProgressLabel.textContent = label;
  syncProgressBar?.classList.add("is-active");
  setSyncProgressUI(Math.max(lastSyncProgressPercent, 8), label, false);
}

function hideSyncProgress(delayMs = 900) {
  clearTimeout(syncProgressHideTimer);
  syncProgressHideTimer = setTimeout(() => {
    if (syncProgressWrap) syncProgressWrap.hidden = true;
    syncProgressBar?.classList.remove("is-active");
    lastSyncProgressPercent = 0;
    if (syncProgressFill) syncProgressFill.style.width = "0%";
    const bar = syncProgressBar;
    if (bar) bar.setAttribute("aria-valuenow", "0");
  }, delayMs);
}

function setSyncProgressUI(percent, label, updateStatus = true) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  lastSyncProgressPercent = Math.max(lastSyncProgressPercent, value);

  if (syncProgressFill) {
    syncProgressFill.style.width = `${lastSyncProgressPercent}%`;
  }
  if (syncProgressBar) {
    syncProgressBar.setAttribute("aria-valuenow", String(Math.round(lastSyncProgressPercent)));
  }
  if (label && syncProgressLabel) {
    syncProgressLabel.textContent = label;
  }
  if (updateStatus && isSyncing) {
    setStatus(label || "Sincronizzazione in corso...", "busy");
  }
}

function parseLogToActivity(message) {
  for (const rule of LOG_ACTIVITY_RULES) {
    if (rule.skip && rule.test.test(message)) return null;
    if (rule.test.test(message)) {
      const match = message.match(rule.test);
      return rule.map(match, message);
    }
  }

  const cleaned = friendlyStatusText(message);
  if (!cleaned) return null;

  return {
    type: /errore|impossibile|fallit/i.test(cleaned) ? "error" : "info",
    title: /errore|impossibile/i.test(cleaned) ? "Errore" : "Aggiornamento",
    description: cleaned,
  };
}

function renderActivities() {
  if (!activityList || !activityEmpty) return;

  activityList.querySelectorAll(".activity-item").forEach((el) => el.remove());

  if (!activities.length) {
    activityEmpty.hidden = false;
    return;
  }

  activityEmpty.hidden = true;

  activities.forEach((item) => {
    const row = document.createElement("article");
    row.className = "activity-item";
    row.dataset.type = item.type;

    const icon = document.createElement("div");
    icon.className = "activity-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.info;

    const body = document.createElement("div");
    body.className = "activity-body";

    const title = document.createElement("h4");
    title.className = "activity-item-title";
    title.textContent = item.title;

    body.appendChild(title);

    if (item.description) {
      const desc = document.createElement("p");
      desc.className = "activity-item-desc";
      desc.textContent = item.description;
      body.appendChild(desc);
    }

    const time = document.createElement("time");
    time.className = "activity-time";
    time.dateTime = item.iso || new Date().toISOString();
    time.textContent = item.time || formatActivityTime();

    row.append(icon, body, time);
    activityList.appendChild(row);
  });

  activityList.scrollTop = 0;
}

function addActivity({ type, title, description, time }) {
  const entry = {
    type: type || "info",
    title: title || "Aggiornamento",
    description: description || "",
    time: time || formatActivityTime(),
    iso: new Date().toISOString(),
  };

  activities.unshift(entry);
  if (activities.length > MAX_ACTIVITIES) {
    activities = activities.slice(0, MAX_ACTIVITIES);
  }

  renderActivities();
}

function clearActivities() {
  activities = [];
  renderActivities();
}

function addLog(message) {
  if (!message) return;

  if (message.startsWith("__SYNC_PROGRESS__:")) {
    const [, percent, ...rest] = message.split(":");
    const label = rest.join(":").trim();
    if (!isSyncing) {
      showSyncProgress(label || "Sincronizzazione in corso...");
    }
    setSyncProgressUI(Number(percent), label);
    if (Number(percent) >= 100 && !isSyncing) {
      hideSyncProgress(1200);
    }
    return;
  }

  const parsed = parseLogToActivity(message);
  if (parsed) {
    if (parsed.type === "syncing" && !isSyncing) {
      showSyncProgress(parsed.description || "Sincronizzazione in corso...");
    }
    if (parsed.type === "success" && !isSyncing && /Sincronizzazione completata/i.test(message)) {
      setSyncProgressUI(100, "Completato", false);
      hideSyncProgress(1200);
    }

    const isSyncingLog = parsed.type === "syncing";
    if (isSyncingLog && activities[0]?.type === "syncing") {
      activities[0] = {
        ...activities[0],
        title: parsed.title,
        description: parsed.description,
        time: formatActivityTime(),
      };
      renderActivities();
    } else {
      addActivity(parsed);
    }
  }
}

function applyTheme(theme) {
  const resolved = VALID_THEMES.includes(theme) ? theme : "dark";
  document.body.dataset.theme = resolved;
  if (themeToggleLabel) {
    themeToggleLabel.textContent = resolved === "dark" ? "Tema chiaro" : "Tema scuro";
  }
  return resolved;
}

function setSyncBusy(busy) {
  isSyncing = busy;
  syncBtn.disabled = busy;
  syncBtn.classList.toggle("is-busy", busy);
  syncBtnLabel.textContent = busy ? SYNC_LABEL_BUSY : SYNC_LABEL_IDLE;

  if (busy) {
    showSyncProgress("Sincronizzazione in corso...");
  }
}

function formatDateTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseTimesList(value) {
  return value
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

function updateScheduleVisibility() {
  scheduleFields.classList.toggle("is-hidden", !scheduleEnabledInput.checked);
}

function updateReminderVisibility() {
  reminderFields.classList.toggle("is-hidden", !missingSyncReminderEnabledInput.checked);
}

function updateGoogleAuthUI() {
  if (googleAuthorized) {
    authGoogleStatus.textContent = "Collegato";
    authGoogleStatus.dataset.tone = "active";
    logoutBtn.hidden = false;
    authBtn.hidden = true;
    authBtn.disabled = false;
  } else {
    authGoogleStatus.textContent = "Non collegato";
    authGoogleStatus.dataset.tone = "inactive";
    logoutBtn.hidden = true;
    authBtn.hidden = false;
  }
}

function updateQuickStats() {
  const formatted = formatDateTime(lastSyncAt);

  heroLastSync.textContent = formatted || "Mai eseguita";
  heroLastSyncRows.textContent =
    lastSyncRows != null && formatted
      ? `${lastSyncRows} clienti`
      : formatted
        ? "0 clienti"
        : "—";

  heroGoogle.textContent = googleAuthorized ? "Collegato" : "Non collegato";
  heroGoogle.dataset.tone = googleAuthorized ? "active" : "inactive";

  const watchOn = watchEnabledInput.checked;
  heroWatch.textContent = watchOn ? "Attivo" : "Non attivo";
  heroWatch.dataset.tone = watchOn ? "active" : "inactive";

  badgeGoogle.textContent = googleAuthorized ? "Google ✓" : "Google ✗";
  badgeGoogle.dataset.tone = googleAuthorized ? "active" : "inactive";

  badgeWatch.textContent = watchOn ? "Watch ✓" : "Watch ✗";
  badgeWatch.dataset.tone = watchOn ? "active" : "inactive";

  const scheduleOn = scheduleEnabledInput.checked;
  badgeSchedule.textContent = scheduleOn ? "Programmata ✓" : "Programmata ✗";
  badgeSchedule.dataset.tone = scheduleOn ? "active" : "inactive";

  badgeLastSync.textContent = formatted || "Mai eseguita";
}

function getConfigFromForm() {
  return {
    excelPath: excelPathInput.value.trim(),
    spreadsheetId: spreadsheetIdInput.value.trim(),
    sheetName: sheetNameInput.value.trim() || "Clienti",
    watchEnabled: watchEnabledInput.checked,
    scheduleEnabled: scheduleEnabledInput.checked,
    openAtLogin: openAtLoginInput.checked,
    notificationsEnabled: notificationsEnabledInput.checked,
    missingSyncReminderEnabled: missingSyncReminderEnabledInput.checked,
    syncTimes: parseTimesList(syncTimesInput.value),
    reminderTimes: parseTimesList(reminderTimesInput.value),
    theme: document.body.dataset.theme || "dark",
    lastSyncAt: lastSyncAt || undefined,
    lastSyncRows: lastSyncRows != null ? lastSyncRows : undefined,
  };
}

function configSnapshot(config) {
  return JSON.stringify({
    excelPath: config.excelPath || "",
    spreadsheetId: config.spreadsheetId || "",
    sheetName: config.sheetName || "Clienti",
    watchEnabled: !!config.watchEnabled,
    scheduleEnabled: !!config.scheduleEnabled,
    openAtLogin: !!config.openAtLogin,
    notificationsEnabled: config.notificationsEnabled !== false,
    missingSyncReminderEnabled: config.missingSyncReminderEnabled !== false,
    syncTimes: config.syncTimes || [],
    reminderTimes: config.reminderTimes || [],
    theme: config.theme || "dark",
  });
}

function updateUnsavedState() {
  if (!savedConfigSnapshot) return;
  unsavedBanner.hidden = configSnapshot(getConfigFromForm()) === savedConfigSnapshot;
}

function applySyncMeta(config) {
  lastSyncAt = config.lastSyncAt || null;
  lastSyncRows = config.lastSyncRows != null ? config.lastSyncRows : null;
}

function setFormFromConfig(config) {
  excelPathInput.value = config.excelPath || "";
  spreadsheetIdInput.value = config.spreadsheetId || "";
  sheetNameInput.value = config.sheetName || "Clienti";
  watchEnabledInput.checked = !!config.watchEnabled;
  scheduleEnabledInput.checked = !!config.scheduleEnabled;
  openAtLoginInput.checked = !!config.openAtLogin;
  notificationsEnabledInput.checked = config.notificationsEnabled !== false;
  missingSyncReminderEnabledInput.checked = config.missingSyncReminderEnabled !== false;
  syncTimesInput.value = (config.syncTimes || ["09:00", "13:00", "18:00"]).join("\n");
  reminderTimesInput.value = (config.reminderTimes || ["12:00", "19:00"]).join("\n");
  applySyncMeta(config);
  applyTheme(config.theme);
  updateScheduleVisibility();
  updateReminderVisibility();
  savedConfigSnapshot = configSnapshot(config);
  updateUnsavedState();
  updateQuickStats();
}

async function refreshGoogleStatus() {
  const googleStatus = await window.easyfattSync.isGoogleAuthorized();
  googleAuthorized = !!googleStatus.authorized;
  updateGoogleAuthUI();
  updateQuickStats();
  return googleAuthorized;
}

async function persistTheme(theme) {
  applyTheme(theme);
  const config = await window.easyfattSync.getConfig();
  await window.easyfattSync.saveConfig({ ...config, theme });
  savedConfigSnapshot = configSnapshot({ ...config, theme });
  updateUnsavedState();
}

function openAccordionItem(item) {
  if (!item) return;
  const trigger = item.querySelector(".accordion-trigger");
  item.classList.add("is-open");
  trigger?.setAttribute("aria-expanded", "true");
}

function bindAccordions() {
  document.querySelectorAll("[data-accordion-item]").forEach((item) => {
    const trigger = item.querySelector(".accordion-trigger");

    trigger.addEventListener("click", () => {
      const isOpen = item.classList.toggle("is-open");
      trigger.setAttribute("aria-expanded", String(isOpen));
    });
  });
}

function bindExternalLinks() {
  document.querySelectorAll("[data-external-url]").forEach((el) => {
    el.addEventListener("click", async (event) => {
      event.preventDefault();
      const url = el.getAttribute("data-external-url");
      if (!url) return;
      try {
        await window.easyfattSync.openExternal(url);
      } catch (error) {
        addLog(`Impossibile aprire il link: ${error.message}`);
      }
    });
  });
}

function setLegalGateVisible(visible) {
  if (!legalGate || !appShell) return;
  legalGate.hidden = !visible;
  appShell.classList.toggle("is-blocked", visible);
  document.body.classList.toggle("legal-gate-open", visible);
}

async function initLegalGate() {
  const status = await window.easyfattSync.getLegalStatus();
  legalAccepted = !!status.accepted;
  setLegalGateVisible(!legalAccepted);

  if (legalAcceptCheckbox && legalAcceptBtn) {
    legalAcceptCheckbox.addEventListener("change", () => {
      legalAcceptBtn.disabled = !legalAcceptCheckbox.checked;
    });

    legalAcceptBtn.addEventListener("click", async () => {
      if (!legalAcceptCheckbox.checked) return;
      try {
        legalAcceptBtn.disabled = true;
        await window.easyfattSync.acceptLegal();
        legalAccepted = true;
        setLegalGateVisible(false);
        addLog("Privacy Policy e Termini accettati.");
      } catch (error) {
        addLog(`Errore accettazione legale: ${error.message}`);
        legalAcceptBtn.disabled = !legalAcceptCheckbox.checked;
      }
    });
  }
}

async function initAppVersion() {
  try {
    const version = await window.easyfattSync.getAppVersion();
    if (footerAppVersion) footerAppVersion.textContent = version;
    if (settingsAppVersion) settingsAppVersion.textContent = version;
  } catch {
    if (footerAppVersion) footerAppVersion.textContent = "—";
    if (settingsAppVersion) settingsAppVersion.textContent = "—";
  }
}

let currentUpdateState = "idle";
let lastUpdateActivityState = null;
let manualUpdateCheck = false;

function setUpdateProgress(percent) {
  if (!updateProgressWrap || !updateProgressFill || !updateProgressLabel) return;
  const value = Math.max(0, Math.min(100, percent || 0));
  updateProgressFill.style.width = `${value}%`;
  updateProgressLabel.textContent = `${value}%`;
  const bar = updateProgressWrap.querySelector(".update-progress-bar");
  if (bar) bar.setAttribute("aria-valuenow", String(Math.round(value)));
}

function logUpdateActivity(state, payload) {
  if (state === "checking" && !manualUpdateCheck) return;
  if (state === "downloading" && lastUpdateActivityState === "downloading") return;
  if (state === lastUpdateActivityState && state !== "error") return;

  const version = payload?.version ? ` (${payload.version})` : "";

  const activityByState = {
    checking: {
      type: "info",
      title: "Controllo aggiornamenti in corso",
      description: "Verifico se è disponibile una nuova versione.",
    },
    available: {
      type: "info",
      title: "Aggiornamento disponibile",
      description: payload?.message || `Nuova versione disponibile${version}.`,
    },
    "not-available": {
      type: "success",
      title: "App già aggiornata",
      description: "Stai usando l’ultima versione disponibile.",
    },
    downloading: {
      type: "syncing",
      title: "Download aggiornamento",
      description: "Sto scaricando la nuova versione dell’app...",
    },
    downloaded: {
      type: "success",
      title: "Aggiornamento pronto",
      description: "Puoi installare e riavviare quando vuoi.",
    },
    error: {
      type: "error",
      title: "Errore aggiornamento",
      description: payload?.message?.replace(/^Errore aggiornamento:\s*/i, "") || "Operazione non riuscita.",
    },
    dev: {
      type: "info",
      title: "Modalità sviluppo",
      description: payload?.message || "Aggiornamenti disponibili solo nella versione installata.",
    },
  };

  const entry = activityByState[state];
  if (entry) {
    addActivity(entry);
    lastUpdateActivityState = state;
  }

  if (state !== "checking") {
    manualUpdateCheck = false;
  }
}

function applyUpdateState(payload) {
  if (!payload) return;

  const state = payload.state || "idle";
  currentUpdateState = state;
  const message = payload.message || "Pronto";

  if (updateStatusText) {
    updateStatusText.textContent = message;
    updateStatusText.dataset.state = state;
    if (state === "error") {
      updateStatusText.dataset.tone = "error";
    } else {
      delete updateStatusText.dataset.tone;
    }
  }

  const isBusy = state === "checking" || state === "downloading" || state === "installing";

  if (checkUpdatesBtn) {
    checkUpdatesBtn.disabled = isBusy;
  }

  if (downloadUpdateBtn) {
    downloadUpdateBtn.hidden = state !== "available";
    downloadUpdateBtn.disabled = isBusy;
  }

  if (installUpdateBtn) {
    installUpdateBtn.hidden = state !== "downloaded";
    installUpdateBtn.disabled = state === "installing";
  }

  if (updateProgressWrap) {
    updateProgressWrap.hidden = state !== "downloading";
  }

  if (state === "downloading") {
    setUpdateProgress(payload.percent || 0);
  } else if (state === "downloaded") {
    setUpdateProgress(100);
  } else if (state !== "downloading") {
    setUpdateProgress(0);
  }

  logUpdateActivity(state, payload);
}

function bindUpdatesUI() {
  if (!checkUpdatesBtn) return;

  applyUpdateState({ state: "idle", message: "Pronto" });

  checkUpdatesBtn.addEventListener("click", async () => {
    manualUpdateCheck = true;
    lastUpdateActivityState = null;

    try {
      await window.easyfattSync.checkForUpdates();
    } catch (error) {
      applyUpdateState({
        state: "error",
        message: `Errore aggiornamento: ${error.message}`,
      });
    }
  });

  downloadUpdateBtn?.addEventListener("click", async () => {
    downloadUpdateBtn.disabled = true;

    try {
      const result = await window.easyfattSync.downloadUpdate();
      if (!result?.ok && result?.message) {
        applyUpdateState({
          state: "error",
          message: `Errore aggiornamento: ${result.message}`,
        });
      }
    } catch (error) {
      applyUpdateState({
        state: "error",
        message: `Errore aggiornamento: ${error.message}`,
      });
    } finally {
      if (currentUpdateState === "available") {
        downloadUpdateBtn.disabled = false;
      }
    }
  });

  installUpdateBtn?.addEventListener("click", async () => {
    try {
      const result = await window.easyfattSync.installUpdateNow();
      if (!result?.ok) {
        applyUpdateState({
          state: "error",
          message: `Errore aggiornamento: ${result?.message || "Impossibile installare l’aggiornamento."}`,
        });
      }
    } catch (error) {
      applyUpdateState({
        state: "error",
        message: `Errore aggiornamento: ${error.message}`,
      });
    }
  });

  const handleUpdateEvent = (payload) => {
    if (payload) applyUpdateState(payload);
  };

  window.easyfattSync.onUpdateState(handleUpdateEvent);
  window.easyfattSync.onUpdateStatus(handleUpdateEvent);

  window.easyfattSync.onUpdateProgress((payload) => {
    if (currentUpdateState === "downloading") {
      setUpdateProgress(payload?.percent || 0);
    }
  });
}

function bindActivityUI() {
  clearActivityBtn?.addEventListener("click", () => {
    clearActivities();
  });
}

function clearSupportFieldErrors() {
  Object.entries(SUPPORT_FIELD_ERRORS).forEach(([field, el]) => {
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
    const input = document.getElementById(
      field === "issueType" ? "supportIssueType" : `support${field.charAt(0).toUpperCase()}${field.slice(1)}`
    );
    input?.classList.remove("is-invalid");
  });
}

function setSupportFieldError(field, message) {
  const el = SUPPORT_FIELD_ERRORS[field];
  const inputId =
    field === "issueType"
      ? "supportIssueType"
      : `support${field.charAt(0).toUpperCase()}${field.slice(1)}`;
  const input = document.getElementById(inputId);

  if (el) {
    el.textContent = message;
    el.hidden = !message;
  }
  input?.classList.toggle("is-invalid", !!message);
}

function validateSupportFormClient() {
  clearSupportFieldErrors();

  const name = supportNameInput?.value.trim() || "";
  const email = supportEmailInput?.value.trim() || "";
  const issueType = supportIssueTypeInput?.value.trim() || "";
  const message = supportMessageInput?.value.trim() || "";
  let valid = true;

  if (name.length < 2) {
    setSupportFieldError("name", "Inserisci il nome dell’attività (almeno 2 caratteri).");
    valid = false;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setSupportFieldError("email", "Inserisci un indirizzo email valido.");
    valid = false;
  }

  if (!issueType) {
    setSupportFieldError("issueType", "Seleziona il tipo di problema.");
    valid = false;
  }

  if (message.length < 10) {
    setSupportFieldError("message", "Descrivi il problema con almeno 10 caratteri.");
    valid = false;
  } else if (message.length > 4000) {
    setSupportFieldError("message", "La descrizione è troppo lunga (max 4000 caratteri).");
    valid = false;
  }

  return valid;
}

function setSupportFeedback(message, tone) {
  if (!supportFeedback) return;
  supportFeedback.textContent = message || "";
  supportFeedback.hidden = !message;
  if (tone) {
    supportFeedback.dataset.tone = tone;
  } else {
    delete supportFeedback.dataset.tone;
  }
}

function resetSupportForm() {
  supportForm?.reset();
  clearSupportFieldErrors();
  setSupportFeedback("", null);
  if (supportForm) supportForm.hidden = false;
  if (supportSuccessPanel) supportSuccessPanel.hidden = true;
  if (supportSubmitBtn) {
    supportSubmitBtn.disabled = false;
    supportSubmitBtn.textContent = "Invia richiesta";
  }
}

function setSupportModalVisible(visible) {
  if (!supportModal || !appShell) return;
  supportModal.hidden = !visible;
  appShell.classList.toggle("is-blocked", visible);
  document.body.classList.toggle("support-modal-open", visible);

  if (visible) {
    resetSupportForm();
    setTimeout(() => supportNameInput?.focus(), 50);
  }
}

function bindSupportModal() {
  if (!supportModal) return;

  openSupportBtn?.addEventListener("click", () => setSupportModalVisible(true));

  supportCancelBtn?.addEventListener("click", () => setSupportModalVisible(false));
  supportCloseBtn?.addEventListener("click", () => setSupportModalVisible(false));

  supportModal.addEventListener("click", (event) => {
    if (event.target === supportModal) {
      setSupportModalVisible(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && supportModal && !supportModal.hidden) {
      setSupportModalVisible(false);
    }
  });

  supportForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateSupportFormClient()) {
      setSupportFeedback("Controlla i campi evidenziati e riprova.", "error");
      return;
    }

    setSupportFeedback("Invio richiesta...", "busy");
    supportSubmitBtn.disabled = true;
    supportSubmitBtn.textContent = "Invio richiesta...";

    try {
      const result = await window.easyfattSync.submitSupportRequest({
        name: supportNameInput.value.trim(),
        email: supportEmailInput.value.trim(),
        phone: supportPhoneInput?.value.trim() || "",
        issueType: supportIssueTypeInput.value,
        message: supportMessageInput.value.trim(),
      });

      if (result?.validationErrors) {
        Object.entries(result.validationErrors).forEach(([field, msg]) => {
          setSupportFieldError(field, msg);
        });
        setSupportFeedback("Controlla i campi evidenziati e riprova.", "error");
        return;
      }

      if (!result?.ok) {
        setSupportFeedback(
          result?.message || `Errore invio. Riprova o scrivi a ${SUPPORT_EMAIL}.`,
          "error"
        );
        addActivity({
          type: "error",
          title: "Errore invio supporto",
          description: `Riprova o scrivi a ${SUPPORT_EMAIL}.`,
        });
        return;
      }

      supportForm.reset();
      clearSupportFieldErrors();
      supportForm.hidden = true;
      supportSuccessPanel.hidden = false;
      setSupportFeedback("", null);
      addActivity({
        type: "success",
        title: "Richiesta di supporto inviata",
        description: "Abbiamo inviato una conferma alla tua email.",
      });
    } catch {
      setSupportFeedback(`Errore invio. Riprova o scrivi a ${SUPPORT_EMAIL}.`, "error");
      addActivity({
        type: "error",
        title: "Errore invio supporto",
        description: `Riprova o scrivi a ${SUPPORT_EMAIL}.`,
      });
    } finally {
      supportSubmitBtn.disabled = false;
      supportSubmitBtn.textContent = "Invia richiesta";
    }
  });
}

function bindFormListeners() {
  const inputs = [
    excelPathInput,
    spreadsheetIdInput,
    sheetNameInput,
    watchEnabledInput,
    scheduleEnabledInput,
    openAtLoginInput,
    notificationsEnabledInput,
    missingSyncReminderEnabledInput,
    syncTimesInput,
    reminderTimesInput,
  ];

  inputs.forEach((el) => {
    el.addEventListener("input", () => {
      updateUnsavedState();
      updateQuickStats();
    });
    el.addEventListener("change", () => {
      updateUnsavedState();
      updateQuickStats();
    });
  });

  scheduleEnabledInput.addEventListener("change", updateScheduleVisibility);
  missingSyncReminderEnabledInput.addEventListener("change", updateReminderVisibility);
}

themeToggle.addEventListener("click", async () => {
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  try {
    await persistTheme(next);
  } catch (error) {
    addLog(`Errore salvataggio tema: ${error.message}`);
  }
});

window.easyfattSync.onLog((message) => {
  addLog(message);
});

window.easyfattSync.onConfigUpdated((config) => {
  setFormFromConfig(config);
});

browseBtn.addEventListener("click", async () => {
  const path = await window.easyfattSync.selectExcel();
  if (path) {
    excelPathInput.value = path;
    updateUnsavedState();
    updateQuickStats();
  }
});

saveBtn.addEventListener("click", async () => {
  try {
    await window.easyfattSync.saveConfig(getConfigFromForm());
    const config = await window.easyfattSync.getConfig();
    setFormFromConfig(config);
    setStatus("Le tue impostazioni sono state salvate.", "success");
    addLog("Impostazioni salvate.");
  } catch (error) {
    setStatus(`Errore: ${error.message}`, "error");
    addLog(`Errore: ${error.message}`);
  }
});

authBtn.addEventListener("click", async () => {
  if (authBtn.disabled) return;

  try {
    authBtn.disabled = true;
    openAccordionItem(document.getElementById("accordion-google"));
    setStatus("Apro il browser per collegare Google...", "busy");
    addLog("Avvio collegamento Google...");

    await window.easyfattSync.connectGoogle();

    await refreshGoogleStatus();
    setStatus("Il tuo account Google è collegato.", "success");
    addLog("Google collegato correttamente.");
  } catch (error) {
    setStatus(`Errore: ${error.message}`, "error");
    addLog(`Errore collegamento Google: ${error.message}`);
  } finally {
    authBtn.disabled = false;
    updateGoogleAuthUI();
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await window.easyfattSync.logoutGoogle();
    await refreshGoogleStatus();
    setStatus("Il collegamento Google è stato rimosso.", "success");
    addLog("Account Google disconnesso.");
  } catch (error) {
    setStatus(`Errore: ${error.message}`, "error");
    addLog(`Errore logout: ${error.message}`);
  }
});

syncBtn.addEventListener("click", async () => {
  if (isSyncing) return;

  try {
    setSyncBusy(true);
    setStatus("Sincronizzazione in corso...", "busy");
    addActivity({
      type: "syncing",
      title: "Sincronizzazione in corso",
      description: "Lettura file Excel e aggiornamento Google Sheet...",
    });

    await window.easyfattSync.saveConfig(getConfigFromForm());
    const result = await window.easyfattSync.syncNow();

    const config = await window.easyfattSync.getConfig();
    setFormFromConfig(config);

    setSyncProgressUI(100, "Completato", false);
    setStatus(`Sincronizzazione completata: ${result.rows} clienti aggiornati`, "success");
    addActivity({
      type: "success",
      title: "Sincronizzazione completata",
      description: `${result.rows} clienti aggiornati su Google Sheets`,
    });
  } catch (error) {
    const msg = error.message || "Si è verificato un problema.";
    setStatus(msg, "error");
    addActivity({
      type: "error",
      title: "Errore",
      description: friendlyStatusText(msg),
    });
  } finally {
    setSyncBusy(false);
    hideSyncProgress();
  }
});

(async function init() {
  bindAccordions();
  bindFormListeners();
  bindExternalLinks();
  bindUpdatesUI();
  bindActivityUI();
  bindSupportModal();
  renderActivities();
  await initAppVersion();
  await initLegalGate();

  const config = await window.easyfattSync.getConfig();
  setFormFromConfig(config);

  const authorized = await refreshGoogleStatus();

  if (authorized) {
    addLog("Google già collegato.");
  } else {
    addLog("Collega Google per abilitare la sincronizzazione.");
  }
})();
