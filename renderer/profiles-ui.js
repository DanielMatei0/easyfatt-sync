/**
 * UI gestione syncProfiles (multi-file Excel).
 * Espone window.EasyfattProfilesUI
 */

(function initProfilesUI() {
  const profilesList = document.getElementById("profilesList");
  const profilesEmpty = document.getElementById("profilesEmpty");
  const profilesEmptyState = document.getElementById("profilesEmptyState");
  const addProfileBtn = document.getElementById("addProfileBtn");
  const openWizardBtn = document.getElementById("openWizardBtn");
  const emptyStartWizardBtn = document.getElementById("emptyStartWizardBtn");
  const emptyAddProfileBtn = document.getElementById("emptyAddProfileBtn");
  const syncAllBtn = document.getElementById("syncAllBtn");
  const profileModal = document.getElementById("profileModal");
  const profileForm = document.getElementById("profileForm");
  const profileIdInput = document.getElementById("profileId");
  const profileNameInput = document.getElementById("profileName");
  const profileExcelPathInput = document.getElementById("profileExcelPath");
  const profileSpreadsheetIdInput = document.getElementById("profileSpreadsheetId");
  const profileSheetNameInput = document.getElementById("profileSheetName");
  const profileEnabledInput = document.getElementById("profileEnabled");
  const profileWatchEnabledInput = document.getElementById("profileWatchEnabled");
  const profileScheduleEnabledInput = document.getElementById("profileScheduleEnabled");
  const profileSyncTimesInput = document.getElementById("profileSyncTimes");
  const profileScheduleFields = document.getElementById("profileScheduleFields");
  const profileBrowseBtn = document.getElementById("profileBrowseBtn");
  const profileCancelBtn = document.getElementById("profileCancelBtn");
  const profileFormError = document.getElementById("profileFormError");
  const profileNameError = document.getElementById("profileNameError");
  const profileExcelError = document.getElementById("profileExcelError");
  const profileSpreadsheetError = document.getElementById("profileSpreadsheetError");
  const profileSheetError = document.getElementById("profileSheetError");
  const badgeProfiles = document.getElementById("badgeProfiles");
  const heroLastSync = document.getElementById("heroLastSync");
  const heroLastSyncRows = document.getElementById("heroLastSyncRows");
  const heroGoogle = document.getElementById("heroGoogle");
  const heroWatch = document.getElementById("heroWatch");
  const badgeWatch = document.getElementById("badgeWatch");
  const badgeSchedule = document.getElementById("badgeSchedule");
  const badgeLastSync = document.getElementById("badgeLastSync");

  let syncProfiles = [];
  let activeProfileId = null;
  let editingProfileId = null;
  let isSyncingProfiles = false;

  const DEFAULT_SYNC_TIMES = ["09:00", "13:00", "18:00"];

  function parseTimesList(value) {
    return String(value || "")
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function isValidHHMM(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
    if (!match) return false;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
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

  function basename(filePath) {
    if (!filePath) return "—";
    const parts = String(filePath).replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || filePath;
  }

  function generateProfileId() {
    return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function cloneProfiles(profiles) {
    return (profiles || []).map((p) => ({
      ...p,
      syncTimes: Array.isArray(p.syncTimes) ? [...p.syncTimes] : [...DEFAULT_SYNC_TIMES],
      columnMapping: Array.isArray(p.columnMapping) ? [...p.columnMapping] : [],
    }));
  }

  const profileLoadMappingBtn = document.getElementById("profileLoadMappingBtn");
  const profileMappingTable = document.getElementById("profileMappingTable");
  const profileExcelPreview = document.getElementById("profileExcelPreview");
  let currentColumnMapping = [];

  function getEnabledProfiles() {
    return syncProfiles.filter((p) => p.enabled !== false);
  }

  function findProfile(id) {
    return syncProfiles.find((p) => p.id === id) || null;
  }

  function setProfileModalVisible(visible) {
    if (!profileModal) return;
    profileModal.hidden = !visible;
    const appShell = document.getElementById("appShell");
    appShell?.classList.toggle("is-blocked", visible);
    document.body.classList.toggle("profile-modal-open", visible);
    if (visible) {
      setTimeout(() => profileNameInput?.focus(), 50);
    }
  }

  function clearProfileFormErrors() {
    [profileNameError, profileExcelError, profileSpreadsheetError, profileSheetError, profileFormError].forEach(
      (el) => {
        if (!el) return;
        el.hidden = true;
        el.textContent = "";
      }
    );
  }

  function updateProfileScheduleVisibility() {
    if (!profileScheduleFields || !profileScheduleEnabledInput) return;
    profileScheduleFields.classList.toggle("is-hidden", !profileScheduleEnabledInput.checked);
  }

  function readProfileFromForm() {
    return {
      id: profileIdInput?.value?.trim() || generateProfileId(),
      name: profileNameInput?.value?.trim() || "",
      excelPath: profileExcelPathInput?.value?.trim() || "",
      spreadsheetId: profileSpreadsheetIdInput?.value?.trim() || "",
      sheetName: profileSheetNameInput?.value?.trim() || "Clienti",
      watchEnabled: !!profileWatchEnabledInput?.checked,
      scheduleEnabled: !!profileScheduleEnabledInput?.checked,
      syncTimes: parseTimesList(profileSyncTimesInput?.value),
      enabled: profileEnabledInput?.checked !== false,
      lastSyncAt: findProfile(profileIdInput?.value)?.lastSyncAt || null,
      lastSyncRows: findProfile(profileIdInput?.value)?.lastSyncRows ?? null,
      columnMapping: getMappingFromTable(),
    };
  }

  function getMappingFromTable() {
    if (!profileMappingTable) return currentColumnMapping;
    const rows = profileMappingTable.querySelectorAll("[data-mapping-row]");
    return Array.from(rows)
      .map((row) => ({
        excelColumn: row.querySelector("[data-excel-col]")?.textContent?.trim() || "",
        sheetColumn: row.querySelector("input")?.value?.trim() || "",
      }))
      .filter((m) => m.excelColumn && m.sheetColumn);
  }

  function renderMappingTable(headers, mapping = []) {
    if (!profileMappingTable) return;
    currentColumnMapping = mapping;
    profileMappingTable.innerHTML = "";

    if (!headers?.length) {
      profileMappingTable.innerHTML = '<p class="field-hint">Carica le intestazioni dal file Excel.</p>';
      return;
    }

    const table = document.createElement("table");
    table.className = "mapping-table";
    table.innerHTML = "<thead><tr><th>Colonna Excel</th><th>Colonna Google Sheet</th></tr></thead>";
    const tbody = document.createElement("tbody");

    headers.forEach((header) => {
      const existing = mapping.find((m) => m.excelColumn === header);
      const tr = document.createElement("tr");
      tr.dataset.mappingRow = "true";

      const excelTd = document.createElement("td");
      excelTd.dataset.excelCol = "true";
      excelTd.textContent = header;

      const sheetTd = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.value = existing?.sheetColumn || header;
      sheetTd.appendChild(input);

      tr.appendChild(excelTd);
      tr.appendChild(sheetTd);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    profileMappingTable.appendChild(table);
  }

  function renderExcelPreview(preview) {
    if (!profileExcelPreview) return;
    if (!preview?.headers?.length) {
      profileExcelPreview.hidden = true;
      return;
    }

    const table = document.createElement("table");
    table.className = "excel-preview-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    preview.headers.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    (preview.rows || []).forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    profileExcelPreview.innerHTML = "";
    profileExcelPreview.appendChild(table);
    profileExcelPreview.hidden = false;
  }

  function validateProfileForm(profile) {
    clearProfileFormErrors();
    let valid = true;

    if (!profile.name) {
      if (profileNameError) {
        profileNameError.textContent = "Il nome connessione è obbligatorio.";
        profileNameError.hidden = false;
      }
      valid = false;
    }
    if (!profile.excelPath) {
      if (profileExcelError) {
        profileExcelError.textContent = "Seleziona il file Excel.";
        profileExcelError.hidden = false;
      }
      valid = false;
    }
    if (!profile.spreadsheetId) {
      if (profileSpreadsheetError) {
        profileSpreadsheetError.textContent = "Inserisci l'ID Google Sheet.";
        profileSpreadsheetError.hidden = false;
      }
      valid = false;
    }
    if (!profile.sheetName) {
      if (profileSheetError) {
        profileSheetError.textContent = "Inserisci il nome scheda.";
        profileSheetError.hidden = false;
      }
      valid = false;
    }
    if (profile.scheduleEnabled) {
      const validTimes = profile.syncTimes.filter(isValidHHMM);
      if (!validTimes.length) {
        if (profileFormError) {
          profileFormError.textContent = "Inserisci almeno un orario valido (HH:MM).";
          profileFormError.hidden = false;
        }
        valid = false;
      }
      profile.syncTimes = validTimes.length ? validTimes : [...DEFAULT_SYNC_TIMES];
    }

    const duplicate = syncProfiles.some(
      (p) => p.id === profile.id && p.id !== editingProfileId
    );
    if (duplicate) {
      if (profileFormError) {
        profileFormError.textContent = "ID profilo duplicato. Riprova.";
        profileFormError.hidden = false;
      }
      valid = false;
    }

    return valid;
  }

  function fillProfileForm(profile) {
    if (!profile) return;
    if (profileIdInput) profileIdInput.value = profile.id || "";
    if (profileNameInput) profileNameInput.value = profile.name || "";
    if (profileExcelPathInput) profileExcelPathInput.value = profile.excelPath || "";
    if (profileSpreadsheetIdInput) profileSpreadsheetIdInput.value = profile.spreadsheetId || "";
    if (profileSheetNameInput) profileSheetNameInput.value = profile.sheetName || "Clienti";
    if (profileEnabledInput) profileEnabledInput.checked = profile.enabled !== false;
    if (profileWatchEnabledInput) profileWatchEnabledInput.checked = !!profile.watchEnabled;
    if (profileScheduleEnabledInput) profileScheduleEnabledInput.checked = !!profile.scheduleEnabled;
    if (profileSyncTimesInput) {
      profileSyncTimesInput.value = (profile.syncTimes || DEFAULT_SYNC_TIMES).join("\n");
    }
    updateProfileScheduleVisibility();
    clearProfileFormErrors();
    currentColumnMapping = Array.isArray(profile.columnMapping) ? [...profile.columnMapping] : [];
    if (profile.columnMapping?.length && profileMappingTable) {
      const headers = profile.columnMapping.map((m) => m.excelColumn);
      renderMappingTable(headers, profile.columnMapping);
    } else if (profileMappingTable) {
      profileMappingTable.innerHTML = "";
    }
    if (profileExcelPreview) profileExcelPreview.hidden = true;
  }

  function openProfileModal(profile) {
    editingProfileId = profile?.id || null;
    if (profile) {
      fillProfileForm(profile);
    } else {
      const newId = generateProfileId();
      fillProfileForm({
        id: newId,
        name: "",
        excelPath: "",
        spreadsheetId: "",
        sheetName: "Clienti",
        watchEnabled: false,
        scheduleEnabled: false,
        syncTimes: [...DEFAULT_SYNC_TIMES],
        enabled: true,
      });
      if (profileIdInput) profileIdInput.value = newId;
    }
    setProfileModalVisible(true);
  }

  async function persistProfilesToServer() {
    const config = await window.easyfattSync.getConfig();
    await window.easyfattSync.saveConfig({
      ...config,
      syncProfiles,
      activeProfileId,
    });
  }

  function profileHasError(profile) {
    return !(
      profile.name &&
      profile.excelPath &&
      profile.spreadsheetId &&
      profile.sheetName
    );
  }

  function renderProfileCard(profile) {
    const card = document.createElement("article");
    card.className = "profile-card";
    card.dataset.profileId = profile.id;
    card.dataset.enabled = profile.enabled !== false ? "true" : "false";
    if (profile.enabled === false) card.classList.add("is-disabled");
    if (profileHasError(profile)) card.classList.add("has-error");

    const lastSync = formatDateTime(profile.lastSyncAt);
    const rows =
      profile.lastSyncRows != null && lastSync ? `${profile.lastSyncRows} righe` : "—";

    const badges = [];
    if (profile.enabled !== false) badges.push('<span class="profile-badge">Attivo</span>');
    else badges.push('<span class="profile-badge" data-tone="muted">Disattivo</span>');
    if (profile.watchEnabled) badges.push('<span class="profile-badge" data-tone="watch">Watcher</span>');
    if (profile.scheduleEnabled) badges.push('<span class="profile-badge" data-tone="schedule">Programmato</span>');
    if (profileHasError(profile)) badges.push('<span class="profile-badge" data-tone="error">Incompleto</span>');

    card.innerHTML = `
      <div class="profile-card-head">
        <h3 class="profile-card-title">${escapeHtml(profile.name || "Senza nome")}</h3>
        <div class="profile-badges">${badges.join("")}</div>
      </div>
      <p class="profile-card-meta"><span class="profile-meta-label">Excel</span> ${escapeHtml(basename(profile.excelPath))}</p>
      <p class="profile-card-meta"><span class="profile-meta-label">Foglio</span> ${escapeHtml(profile.sheetName || "—")}</p>
      <p class="profile-card-meta"><span class="profile-meta-label">Ultima sync</span> ${escapeHtml(lastSync || "Mai")} · ${escapeHtml(rows)}</p>
      <div class="profile-card-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="sync">Sincronizza ora</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit">Modifica</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="toggle">${profile.enabled !== false ? "Disattiva" : "Attiva"}</button>
        <button type="button" class="btn-text btn-danger-text" data-action="delete">Elimina</button>
      </div>
    `;

    card.querySelector('[data-action="sync"]')?.addEventListener("click", () => syncSingleProfile(profile.id));
    card.querySelector('[data-action="edit"]')?.addEventListener("click", () => openProfileModal(profile));
    card.querySelector('[data-action="toggle"]')?.addEventListener("click", () => toggleProfileEnabled(profile.id));
    card.querySelector('[data-action="delete"]')?.addEventListener("click", () => deleteProfile(profile.id));

    return card;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderProfilesList() {
    if (!profilesList) return;

    profilesList.innerHTML = "";
    const enabled = getEnabledProfiles();

    const validProfiles = syncProfiles.filter(
      (p) =>
        p &&
        String(p.excelPath || "").trim() &&
        String(p.spreadsheetId || "").trim() &&
        String(p.sheetName || "").trim()
    );
    const hasAnyProfile = syncProfiles.length > 0;
    const hasValidProfile = validProfiles.length > 0;
    const showEmptyState = !hasValidProfile;

    if (profilesEmpty) {
      profilesEmpty.hidden = !showEmptyState;
    }
    if (profilesEmptyState) {
      profilesEmptyState.hidden = !showEmptyState;
      // Testo dinamico: prima sincronizzazione se davvero zero, altrimenti "un'altra"
      const emptyTitle = document.getElementById("profilesEmptyTitle");
      const emptyDesc = document.getElementById("profilesEmptyDesc");
      const emptyStartBtn = document.getElementById("emptyStartWizardBtn");
      if (hasAnyProfile) {
        if (emptyTitle) emptyTitle.textContent = "Configura un'altra sincronizzazione";
        if (emptyDesc)
          emptyDesc.textContent =
            "Hai un profilo non ancora completo. Riprendi la configurazione oppure aggiungi una nuova connessione Excel → Google.";
        if (emptyStartBtn) emptyStartBtn.textContent = "Apri configurazione guidata";
      } else {
        if (emptyTitle) emptyTitle.textContent = "Configura la tua prima sincronizzazione";
        if (emptyDesc)
          emptyDesc.textContent =
            "In pochi passi colleghi il file Excel di Easyfatt al tuo foglio Google. Tutto resta sul tuo computer, senza configurazioni tecniche complicate.";
        if (emptyStartBtn) emptyStartBtn.textContent = "Inizia configurazione guidata";
      }
    }
    if (profilesList) {
      profilesList.hidden = !hasAnyProfile;
    }

    if (badgeProfiles) {
      const n = syncProfiles.length;
      badgeProfiles.textContent = n === 1 ? "1 conn." : `${n} conn.`;
      badgeProfiles.dataset.tone = n > 0 ? "active" : "inactive";
    }

    const navSyncBadge = document.getElementById("navSyncBadge");
    if (navSyncBadge) {
      const n = validProfiles.length;
      if (n > 0) {
        navSyncBadge.textContent = String(n);
        navSyncBadge.hidden = false;
      } else {
        navSyncBadge.hidden = true;
      }
    }

    syncProfiles.forEach((profile) => {
      profilesList.appendChild(renderProfileCard(profile));
    });

    updateHeroFromProfiles();
    if (syncAllBtn) {
      syncAllBtn.disabled = isSyncingProfiles || enabled.length === 0;
    }
  }

  function updateHeroFromProfiles() {
    const enabled = getEnabledProfiles();
    const active = findProfile(activeProfileId) || enabled[0] || syncProfiles[0];

    const watchCount = enabled.filter((p) => p.watchEnabled).length;
    const scheduleCount = enabled.filter((p) => p.scheduleEnabled).length;

    if (heroWatch) {
      if (watchCount > 0) {
        heroWatch.textContent = `${watchCount} file`;
        heroWatch.dataset.tone = "active";
      } else {
        heroWatch.textContent = "Non attivo";
        heroWatch.dataset.tone = "inactive";
      }
    }

    if (badgeWatch) {
      badgeWatch.textContent = watchCount > 0 ? `Watch ${watchCount}` : "Watch";
      badgeWatch.dataset.tone = watchCount > 0 ? "active" : "inactive";
    }

    if (badgeSchedule) {
      badgeSchedule.textContent = scheduleCount > 0 ? `Prog. ${scheduleCount}` : "Programmata";
      badgeSchedule.dataset.tone = scheduleCount > 0 ? "active" : "inactive";
    }

    if (!active) {
      if (heroLastSync) heroLastSync.textContent = "Mai eseguita";
      if (heroLastSyncRows) heroLastSyncRows.textContent = "—";
      if (badgeLastSync) badgeLastSync.textContent = "Mai eseguita";
      return;
    }

    const formatted = formatDateTime(active.lastSyncAt);
    if (heroLastSync) heroLastSync.textContent = formatted || "Mai eseguita";
    if (heroLastSyncRows) {
      heroLastSyncRows.textContent =
        active.lastSyncRows != null && formatted
          ? `${active.lastSyncRows} righe`
          : formatted
            ? "0 righe"
            : "—";
    }
    if (badgeLastSync) badgeLastSync.textContent = formatted || "Mai eseguita";
  }

  function setProfilesFromConfig(config) {
    syncProfiles = cloneProfiles(config?.syncProfiles || []);
    activeProfileId = config?.activeProfileId || syncProfiles[0]?.id || null;
    renderProfilesList();
    window.EasyfattHistoryUI?.populateProfileFilter?.(config);
    window.EasyfattDashboardUI?.refresh?.();
  }

  function getProfilesForSave() {
    return {
      syncProfiles: cloneProfiles(syncProfiles),
      activeProfileId,
    };
  }

  async function toggleProfileEnabled(profileId) {
    const profile = findProfile(profileId);
    if (!profile) return;
    profile.enabled = profile.enabled === false;
    renderProfilesList();
    await persistProfilesToServer();
  }

  async function deleteProfile(profileId) {
    const profile = findProfile(profileId);
    if (!profile) return;

    const ok = window.confirm(
      `Eliminare la connessione "${profile.name}"? Questa azione non può essere annullata.`
    );
    if (!ok) return;

    syncProfiles = syncProfiles.filter((p) => p.id !== profileId);
    if (activeProfileId === profileId) {
      activeProfileId = syncProfiles[0]?.id || null;
    }
    renderProfilesList();
    await persistProfilesToServer();
    window.EasyfattAppHooks?.addActivity?.({
      type: "info",
      title: "Connessione rimossa",
      description: `"${profile.name}" eliminata.`,
    });
  }

  function setProfilesSyncBusy(busy) {
    isSyncingProfiles = busy;
    if (syncAllBtn) syncAllBtn.disabled = busy;
    profilesList?.querySelectorAll('[data-action="sync"]').forEach((btn) => {
      btn.disabled = busy;
    });
  }

  async function syncSingleProfile(profileId) {
    const profile = findProfile(profileId);
    if (!profile) return;

    const hooks = window.EasyfattAppHooks || {};
    try {
      setProfilesSyncBusy(true);
      hooks.setSyncBusy?.(true);
      hooks.setStatus?.(`Sincronizzazione ${profile.name}...`, "busy");
      hooks.addActivity?.({
        type: "syncing",
        title: `${profile.name} — sincronizzazione`,
        description: "Lettura Excel e aggiornamento Google Sheet...",
      });

      const config = await window.easyfattSync.getConfig();
      await window.easyfattSync.saveConfig({
        ...config,
        syncProfiles,
        activeProfileId: profileId,
      });

      const result = await window.easyfattSync.syncNow(profileId);

      if (result?.skipped) {
        hooks.setStatus?.("Sincronizzazione già in corso.", "busy");
        return;
      }

      const updated = await window.easyfattSync.getConfig();
      setProfilesFromConfig(updated);
      window.EasyfattDashboardUI?.refresh?.();
      window.EasyfattHistoryUI?.refresh?.();
      hooks.setSyncProgressUI?.(100, "Completato", false);

      hooks.setStatus?.(`${profile.name}: ${result.rows} righe aggiornate`, "success");
      hooks.addActivity?.({
        type: "success",
        title: `${profile.name} sincronizzato`,
        description: `${result.rows} righe aggiornate su Google Sheets`,
      });
    } catch (error) {
      const msg = error.message || "Errore sincronizzazione.";
      hooks.setStatus?.(msg, "error");
      hooks.addActivity?.({
        type: "error",
        title: `Errore sync ${profile.name}`,
        description: msg,
      });
    } finally {
      setProfilesSyncBusy(false);
      hooks.setSyncBusy?.(false);
      hooks.hideSyncProgress?.();
    }
  }

  async function syncAllProfiles() {
    const hooks = window.EasyfattAppHooks || {};
    const enabled = getEnabledProfiles();
    if (!enabled.length) {
      hooks.setStatus?.("Aggiungi almeno una connessione attiva.", "error");
      return;
    }

    try {
      setProfilesSyncBusy(true);
      hooks.setSyncBusy?.(true);
      hooks.setStatus?.("Sincronizzazione di tutte le connessioni...", "busy");
      hooks.addActivity?.({
        type: "syncing",
        title: "Sincronizzazione multipla",
        description: `${enabled.length} connessioni in coda...`,
      });

      const config = await window.easyfattSync.getConfig();
      await window.easyfattSync.saveConfig({ ...config, syncProfiles, activeProfileId });

      const result = await window.easyfattSync.syncAll();
      const updated = await window.easyfattSync.getConfig();
      setProfilesFromConfig(updated);
      window.EasyfattDashboardUI?.refresh?.();
      window.EasyfattHistoryUI?.refresh?.();

      const results = result?.results || [];
      const okCount = results.filter((r) => r.ok !== false && !r.error).length;
      hooks.setSyncProgressUI?.(100, "Completato", false);
      hooks.setStatus?.(`Completate ${okCount}/${enabled.length} connessioni`, "success");
      hooks.addActivity?.({
        type: "success",
        title: "Sincronizzazione multipla completata",
        description: `${okCount} connessioni aggiornate`,
      });

      results.forEach((r) => {
        if (r.error) {
          hooks.addActivity?.({
            type: "error",
            title: `Errore sync ${r.profileName || ""}`.trim(),
            description: r.error,
          });
        }
      });
    } catch (error) {
      hooks.setStatus?.(error.message, "error");
      hooks.addActivity?.({
        type: "error",
        title: "Errore sincronizzazione",
        description: error.message,
      });
    } finally {
      setProfilesSyncBusy(false);
      hooks.setSyncBusy?.(false);
      hooks.hideSyncProgress?.();
    }
  }

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const profile = readProfileFromForm();
    if (!validateProfileForm(profile)) return;

    const idx = syncProfiles.findIndex((p) => p.id === editingProfileId);
    if (idx >= 0) {
      syncProfiles[idx] = { ...syncProfiles[idx], ...profile, id: syncProfiles[idx].id };
    } else {
      syncProfiles.push(profile);
      activeProfileId = profile.id;
    }

    renderProfilesList();
    setProfileModalVisible(false);
    editingProfileId = null;

    try {
      await persistProfilesToServer();
      window.EasyfattAppHooks?.addActivity?.({
        type: "success",
        title: "Connessione salvata",
        description: `"${profile.name}" configurata.`,
      });
    } catch (error) {
      window.EasyfattAppHooks?.addActivity?.({
        type: "error",
        title: "Errore salvataggio",
        description: error.message,
      });
    }
  });

  profileCancelBtn?.addEventListener("click", () => {
    setProfileModalVisible(false);
    editingProfileId = null;
  });

  profileModal?.addEventListener("click", (event) => {
    if (event.target === profileModal) setProfileModalVisible(false);
  });

  profileScheduleEnabledInput?.addEventListener("change", updateProfileScheduleVisibility);

  profileBrowseBtn?.addEventListener("click", async () => {
    const path = await window.easyfattSync.selectExcel();
    if (path && profileExcelPathInput) profileExcelPathInput.value = path;
  });

  profileLoadMappingBtn?.addEventListener("click", async () => {
    const excelPath = profileExcelPathInput?.value?.trim();
    if (!excelPath) {
      window.EasyfattAppHooks?.setStatus?.("Seleziona prima il file Excel.", "error");
      return;
    }
    try {
      const preview = await window.easyfattSync.previewExcel(excelPath);
      renderExcelPreview(preview);
      renderMappingTable(preview.headers || [], currentColumnMapping);
    } catch (error) {
      window.EasyfattAppHooks?.setStatus?.(error.message || "Anteprima non disponibile.", "error");
    }
  });

  addProfileBtn?.addEventListener("click", () => openProfileModal(null));
  emptyAddProfileBtn?.addEventListener("click", () => openProfileModal(null));
  openWizardBtn?.addEventListener("click", () => window.EasyfattOnboardingUI?.openManual?.());
  emptyStartWizardBtn?.addEventListener("click", () => window.EasyfattOnboardingUI?.openManual?.());
  syncAllBtn?.addEventListener("click", () => syncAllProfiles());

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && profileModal && !profileModal.hidden) {
      setProfileModalVisible(false);
    }
  });

  function reloadFromServer() {
    return window.easyfattSync.getConfig().then((config) => {
      setProfilesFromConfig(config);
      return config;
    });
  }

  window.EasyfattProfilesUI = {
    setProfilesFromConfig,
    getProfilesForSave,
    renderProfilesList,
    updateHeroFromProfiles,
    syncSingleProfile,
    openProfileModal,
    reload: reloadFromServer,
    getEnabledProfiles,
    setGoogleHero(authorized) {
      if (heroGoogle) {
        heroGoogle.textContent = authorized ? "Collegato" : "Non collegato";
        heroGoogle.dataset.tone = authorized ? "active" : "inactive";
      }
    },
  };
})();
