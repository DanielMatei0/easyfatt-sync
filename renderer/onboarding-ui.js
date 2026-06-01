/**
 * Wizard onboarding (configurazione guidata).
 *
 * Comportamento:
 * - maybeStart(config) apre il wizard automaticamente SOLO se non ci sono profili
 *   e onboardingCompleted/onboardingSkipped non sono true.
 * - openManual(config) lo apre da pulsante "Apri configurazione guidata".
 * - Skip salva onboardingCompleted=true (non crea profili vuoti).
 * - Step Google: se già collegato salta richiesta login.
 * - Step Sheet ID: estrae automaticamente l'ID anche se incollano l'URL completo.
 */
(function initOnboardingUI() {
  const overlay = document.getElementById("onboardingOverlay");
  if (!overlay) return;

  const card = overlay.querySelector(".onboarding-card");
  const titleEl = document.getElementById("onboardingTitle");
  const subtitleEl = document.getElementById("onboardingSubtitle");
  const stepLabelEl = document.getElementById("onboardingStepLabel");
  const progressPercentEl = document.getElementById("onboardingProgressPercent");
  const progressFillEl = document.getElementById("onboardingProgressFill");

  const skipBtn = document.getElementById("onboardingSkipBtn");
  const backBtn = document.getElementById("onboardingBackBtn");
  const nextBtn = document.getElementById("onboardingNextBtn");
  const finishBtn = document.getElementById("onboardingFinishBtn");
  const closeBtn = document.getElementById("onboardingCloseBtn");

  // Step inputs
  const obExcelPath = document.getElementById("obExcelPath");
  const obBrowseBtn = document.getElementById("obBrowseBtn");
  const obFileCard = document.getElementById("obFileCard");
  const obFileName = document.getElementById("obFileName");
  const obFileMeta = document.getElementById("obFileMeta");
  const obFileBadge = document.getElementById("obFileBadge");
  const obFileChangeBtn = document.getElementById("obFileChangeBtn");
  const obFileError = document.getElementById("obFileError");

  const obProfileName = document.getElementById("obProfileName");

  const obSpreadsheetId = document.getElementById("obSpreadsheetId");
  const obSheetName = document.getElementById("obSheetName");
  const obSheetError = document.getElementById("obSheetError");

  const obConnectGoogleBtn = document.getElementById("obConnectGoogleBtn");
  const obChangeAccountBtn = document.getElementById("obChangeAccountBtn");
  const obGoogleStatus = document.getElementById("obGoogleStatus");
  const obGoogleConnectedBox = document.getElementById("obGoogleConnectedBox");
  const obGoogleConnectBox = document.getElementById("obGoogleConnectBox");

  const obVerifyGoogle = document.getElementById("obVerifyGoogle");
  const obVerifyFile = document.getElementById("obVerifyFile");
  const obVerifySheet = document.getElementById("obVerifySheet");
  const obRetryVerifyBtn = document.getElementById("obRetryVerifyBtn");

  const obSummaryName = document.getElementById("obSummaryName");
  const obSummaryFile = document.getElementById("obSummaryFile");
  const obSummarySheet = document.getElementById("obSummarySheet");
  const obSummaryGoogle = document.getElementById("obSummaryGoogle");
  const obFinishError = document.getElementById("obFinishError");

  const STEPS = [
    {
      key: "welcome",
      title: "Benvenuto in Easyfatt Sync",
      subtitle: "Ti accompagniamo nella configurazione in pochi minuti.",
      canAdvance: () => true,
    },
    {
      key: "google",
      title: "Collega il tuo account Google",
      subtitle: "Serve solo per scrivere sul tuo foglio. Non vediamo la tua password.",
      canAdvance: () => googleAuthorized === true,
      advanceErrorMsg: "Collega Google per continuare.",
    },
    {
      key: "excel",
      title: "Seleziona il file Excel",
      subtitle: "Scegli il file esportato da Easyfatt e dai un nome alla configurazione.",
      canAdvance: () => !!(obExcelPath?.value?.trim() && obProfileName?.value?.trim()),
      advanceErrorMsg: "Seleziona un file Excel e inserisci un nome.",
    },
    {
      key: "sheet",
      title: "Indica il foglio Google",
      subtitle: "Copia il codice del foglio dall’URL del browser.",
      canAdvance: () => !!(getNormalizedSheetId() && obSheetName?.value?.trim()),
      advanceErrorMsg: "Inserisci il codice foglio e il nome scheda.",
    },
    {
      key: "verify",
      title: "Verifica configurazione",
      subtitle: "Controlliamo che file, account e foglio siano pronti.",
      canAdvance: () => verifyState.google && verifyState.file && verifyState.sheet,
      advanceErrorMsg: "Risolvi i problemi mostrati prima di continuare.",
    },
    {
      key: "summary",
      title: "Riepilogo",
      subtitle: "Conferma e avvia la prima sincronizzazione.",
      canAdvance: () => true,
    },
  ];

  let currentStep = 0;
  let configRef = null;
  let googleAuthorized = false;
  let isClosing = false;
  let isPersisting = false;
  const verifyState = { google: false, file: false, sheet: false };

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function basename(path) {
    if (!path) return "";
    return String(path).split(/[\\/]/).pop() || path;
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function extractSheetIdFromUrl(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
    return text;
  }

  function getNormalizedSheetId() {
    const raw = obSpreadsheetId?.value?.trim() || "";
    const id = extractSheetIdFromUrl(raw);
    return /^[a-zA-Z0-9-_]{20,}$/.test(id) ? id : "";
  }

  function updateProgress() {
    const total = STEPS.length;
    const idx = currentStep + 1;
    const percent = Math.round((idx / total) * 100);
    if (stepLabelEl) stepLabelEl.textContent = `Step ${idx} di ${total}`;
    if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
    if (progressFillEl) progressFillEl.style.width = `${percent}%`;
  }

  function showStep(index) {
    currentStep = Math.max(0, Math.min(index, STEPS.length - 1));
    const step = STEPS[currentStep];

    overlay.querySelectorAll("[data-onboarding-step]").forEach((el) => {
      const isActive = el.getAttribute("data-onboarding-step") === step.key;
      el.hidden = !isActive;
      el.classList.toggle("is-active", isActive);
    });

    if (titleEl) titleEl.textContent = step.title;
    if (subtitleEl) subtitleEl.textContent = step.subtitle;

    if (backBtn) backBtn.hidden = currentStep === 0;
    if (nextBtn) nextBtn.hidden = currentStep >= STEPS.length - 1;
    if (finishBtn) finishBtn.hidden = currentStep < STEPS.length - 1;

    updateProgress();
    focusFirstField(step.key);

    if (step.key === "verify") runVerification();
    if (step.key === "summary") renderSummary();
    if (step.key === "google") renderGoogleState();
  }

  function focusFirstField(stepKey) {
    setTimeout(() => {
      switch (stepKey) {
        case "excel":
          if (!obExcelPath?.value) obBrowseBtn?.focus();
          else obProfileName?.focus();
          break;
        case "sheet":
          obSpreadsheetId?.focus();
          break;
        case "google":
          if (googleAuthorized) nextBtn?.focus();
          else obConnectGoogleBtn?.focus();
          break;
        case "verify":
          obRetryVerifyBtn?.focus();
          break;
        case "summary":
          finishBtn?.focus();
          break;
        default:
          nextBtn?.focus();
      }
    }, 40);
  }

  function renderGoogleState() {
    if (!obGoogleConnectedBox || !obGoogleConnectBox) return;
    obGoogleConnectedBox.hidden = !googleAuthorized;
    obGoogleConnectBox.hidden = !!googleAuthorized;
    if (obGoogleStatus && !googleAuthorized) {
      obGoogleStatus.textContent = "Account Google non collegato";
    }
  }

  async function refreshGoogleAuthorized() {
    try {
      const auth = await window.easyfattSync.isGoogleAuthorized();
      googleAuthorized = !!auth?.authorized;
    } catch {
      googleAuthorized = false;
    }
    renderGoogleState();
    return googleAuthorized;
  }

  function showFileCard({ name, size, ok, message }) {
    if (!obFileCard) return;

    if (!name) {
      obFileCard.hidden = true;
      return;
    }

    obFileCard.hidden = false;
    if (obFileName) obFileName.textContent = name;
    if (obFileMeta) obFileMeta.textContent = size != null ? formatBytes(size) : "";
    if (obFileBadge) {
      obFileBadge.textContent = ok ? "File valido" : (message || "File non valido");
      obFileBadge.dataset.tone = ok ? "success" : "error";
    }
  }

  async function handleFileSelected(filePath) {
    if (!filePath) return;
    if (obExcelPath) obExcelPath.value = filePath;
    if (obFileError) {
      obFileError.hidden = true;
      obFileError.textContent = "";
    }

    const name = basename(filePath);
    showFileCard({ name, ok: true });

    if (obProfileName && !obProfileName.value.trim()) {
      const auto = name.replace(/\.(xlsx|xls|csv)$/i, "");
      obProfileName.value = auto || "Connessione principale";
    }

    try {
      const preview = await window.easyfattSync.previewExcel(filePath);
      if (preview?.ok) {
        showFileCard({
          name,
          size: preview.fileSize,
          ok: true,
        });
        if (obFileMeta) {
          const cols = preview.headers?.length || 0;
          const rows = preview.totalRows ?? 0;
          obFileMeta.textContent = `${cols} colonne · ${rows} righe`;
        }
      }
    } catch (error) {
      showFileCard({
        name,
        ok: false,
        message: "File non leggibile",
      });
      if (obFileError) {
        obFileError.hidden = false;
        obFileError.textContent = error?.message || "Impossibile leggere il file Excel.";
      }
    }
  }

  function setVerifyItem(el, state, message) {
    if (!el) return;
    el.dataset.state = state;
    const msgEl = el.querySelector(".onboarding-verify-msg");
    if (msgEl) msgEl.textContent = message;
  }

  async function runVerification() {
    Object.assign(verifyState, { google: false, file: false, sheet: false });

    setVerifyItem(obVerifyGoogle, "pending", "Verifico l’account Google…");
    setVerifyItem(obVerifyFile, "pending", "Controllo il file Excel…");
    setVerifyItem(obVerifySheet, "pending", "Verifico il codice del foglio…");

    // Google
    const auth = await refreshGoogleAuthorized();
    if (auth) {
      setVerifyItem(obVerifyGoogle, "success", "Account Google collegato.");
      verifyState.google = true;
    } else {
      setVerifyItem(obVerifyGoogle, "error", "Google non collegato. Torna al passo 2.");
    }

    // File
    const excelPath = obExcelPath?.value?.trim();
    if (!excelPath) {
      setVerifyItem(obVerifyFile, "error", "Nessun file selezionato.");
    } else {
      try {
        const preview = await window.easyfattSync.previewExcel(excelPath);
        const cols = preview?.headers?.length || 0;
        const rows = preview?.totalRows ?? 0;
        setVerifyItem(
          obVerifyFile,
          "success",
          `File leggibile: ${cols} colonne, ${rows} righe.`
        );
        verifyState.file = true;
      } catch (error) {
        setVerifyItem(
          obVerifyFile,
          "error",
          error?.message || "Il file non è leggibile."
        );
      }
    }

    // Sheet
    const sheetId = getNormalizedSheetId();
    const sheetName = obSheetName?.value?.trim();
    if (!sheetId) {
      setVerifyItem(obVerifySheet, "error", "Codice foglio non valido.");
    } else if (!sheetName) {
      setVerifyItem(obVerifySheet, "error", "Inserisci il nome della scheda.");
    } else {
      setVerifyItem(
        obVerifySheet,
        "success",
        `Codice rilevato (scheda "${sheetName}").`
      );
      verifyState.sheet = true;
    }
  }

  function renderSummary() {
    const sheetId = getNormalizedSheetId();
    if (obSummaryName) {
      obSummaryName.textContent =
        obProfileName?.value?.trim() || "Connessione principale";
    }
    if (obSummaryFile) {
      const p = obExcelPath?.value?.trim();
      obSummaryFile.textContent = p ? basename(p) : "—";
    }
    if (obSummarySheet) {
      const tab = obSheetName?.value?.trim() || "Clienti";
      obSummarySheet.textContent = sheetId
        ? `${sheetId.slice(0, 14)}…  ·  scheda: ${tab}`
        : "—";
    }
    if (obSummaryGoogle) {
      obSummaryGoogle.textContent = googleAuthorized
        ? "Collegato"
        : "Non collegato";
    }
    if (obFinishError) {
      obFinishError.hidden = true;
      obFinishError.textContent = "";
    }
  }

  function tryAdvance() {
    const step = STEPS[currentStep];
    if (!step.canAdvance()) {
      if (step.key === "google") {
        renderGoogleState();
        if (obGoogleStatus && !googleAuthorized) {
          obGoogleStatus.textContent = step.advanceErrorMsg || "Collega Google per continuare.";
        }
      }
      if (step.key === "excel" && obFileError) {
        obFileError.hidden = false;
        obFileError.textContent = step.advanceErrorMsg || "";
      }
      if (step.key === "sheet" && obSheetError) {
        obSheetError.hidden = false;
        obSheetError.textContent = step.advanceErrorMsg || "";
      }
      return;
    }
    if (obSheetError) obSheetError.hidden = true;
    if (obFileError) obFileError.hidden = true;
    showStep(currentStep + 1);
  }

  function openOverlay() {
    overlay.hidden = false;
    setTimeout(() => card?.focus?.(), 30);
  }

  function closeOverlay() {
    overlay.hidden = true;
  }

  async function reloadConfig() {
    try {
      configRef = await window.easyfattSync.getConfig();
    } catch {
      configRef = configRef || {};
    }
    return configRef;
  }

  async function markCompleted() {
    if (isPersisting) return;
    isPersisting = true;
    try {
      const config = await reloadConfig();
      await window.easyfattSync.saveConfig({
        ...config,
        onboardingCompleted: true,
        onboardingSkipped: false,
      });
    } catch {
      /* non bloccante */
    } finally {
      isPersisting = false;
    }
  }

  async function handleSkip() {
    if (isClosing) return;
    isClosing = true;
    closeOverlay();
    await markCompleted();
    isClosing = false;
  }

  async function handleClose() {
    await handleSkip();
  }

  async function buildAndSaveProfile() {
    const config = await reloadConfig();
    const profile = {
      id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: obProfileName?.value?.trim() || "Connessione principale",
      excelPath: obExcelPath?.value?.trim() || "",
      spreadsheetId: getNormalizedSheetId(),
      sheetName: obSheetName?.value?.trim() || "Clienti",
      watchEnabled: false,
      scheduleEnabled: false,
      syncTimes: ["09:00", "13:00", "18:00"],
      enabled: true,
      columnMapping: [],
    };

    const profiles = [...(config?.syncProfiles || []), profile];

    await window.easyfattSync.saveConfig({
      ...config,
      syncProfiles: profiles,
      activeProfileId: profile.id,
      onboardingCompleted: true,
      onboardingSkipped: false,
    });

    return profile;
  }

  async function handleFinish() {
    if (finishBtn) finishBtn.disabled = true;
    const originalLabel = finishBtn?.textContent;
    if (finishBtn) finishBtn.textContent = "Sincronizzazione in corso…";

    try {
      const profile = await buildAndSaveProfile();
      await window.easyfattSync.syncNow(profile.id);

      closeOverlay();
      window.EasyfattDashboardUI?.refresh?.();
      window.EasyfattHistoryUI?.refresh?.();
      window.EasyfattProfilesUI?.reload?.();
      window.EasyfattAppHooks?.addActivity?.({
        type: "success",
        title: "Configurazione completata",
        description: `"${profile.name}" è pronto e sincronizzato.`,
      });
    } catch (error) {
      if (obFinishError) {
        obFinishError.hidden = false;
        obFinishError.textContent =
          error?.message || "Sincronizzazione non riuscita. Puoi riprovare dalla dashboard.";
      }
      // configurazione comunque salvata
      closeOverlay();
      window.EasyfattProfilesUI?.reload?.();
    } finally {
      if (finishBtn) {
        finishBtn.disabled = false;
        if (originalLabel) finishBtn.textContent = originalLabel;
      }
    }
  }

  // ────────── Event bindings ──────────
  skipBtn?.addEventListener("click", handleSkip);
  closeBtn?.addEventListener("click", handleClose);
  backBtn?.addEventListener("click", () => showStep(currentStep - 1));
  nextBtn?.addEventListener("click", tryAdvance);
  finishBtn?.addEventListener("click", handleFinish);

  obBrowseBtn?.addEventListener("click", async () => {
    try {
      const filePath = await window.easyfattSync.selectExcel();
      if (filePath) await handleFileSelected(filePath);
    } catch (error) {
      if (obFileError) {
        obFileError.hidden = false;
        obFileError.textContent = error?.message || "Errore selezione file.";
      }
    }
  });

  obFileChangeBtn?.addEventListener("click", () => obBrowseBtn?.click());

  obConnectGoogleBtn?.addEventListener("click", async () => {
    if (obConnectGoogleBtn) obConnectGoogleBtn.disabled = true;
    try {
      await window.easyfattSync.connectGoogle();
      await refreshGoogleAuthorized();
      if (googleAuthorized) {
        // avanza in automatico
        showStep(currentStep + 1);
      } else if (obGoogleStatus) {
        obGoogleStatus.textContent = "Collegamento non completato. Riprova.";
      }
    } catch (error) {
      if (obGoogleStatus) {
        obGoogleStatus.textContent = error?.message || "Errore collegamento Google.";
      }
    } finally {
      if (obConnectGoogleBtn) obConnectGoogleBtn.disabled = false;
    }
  });

  obChangeAccountBtn?.addEventListener("click", async () => {
    try {
      await window.easyfattSync.logoutGoogle();
      await refreshGoogleAuthorized();
      await window.easyfattSync.connectGoogle();
      await refreshGoogleAuthorized();
    } catch {
      /* lasciamo lo stato precedente */
    }
  });

  obRetryVerifyBtn?.addEventListener("click", runVerification);

  // Normalizza l'ID se incollano un URL completo
  obSpreadsheetId?.addEventListener("blur", () => {
    const id = extractSheetIdFromUrl(obSpreadsheetId.value);
    if (id && id !== obSpreadsheetId.value.trim()) {
      obSpreadsheetId.value = id;
    }
  });

  obSpreadsheetId?.addEventListener("input", () => {
    if (obSheetError) obSheetError.hidden = true;
  });

  // Tastiera: Enter avanti (tranne in textarea), Escape chiude
  overlay.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      const target = event.target;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "textarea") return;
      if (target?.type === "button" || target?.type === "submit") return;

      event.preventDefault();
      if (currentStep === STEPS.length - 1) {
        handleFinish();
      } else {
        tryAdvance();
      }
    }
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      handleClose();
    }
  });

  // ────────── Public API ──────────

  async function openFlow(config) {
    configRef = config || (await reloadConfig());
    await refreshGoogleAuthorized();
    showStep(0);
    openOverlay();
  }

  function shouldAutoStart(config) {
    if (!config) return false;
    const profiles = Array.isArray(config.syncProfiles) ? config.syncProfiles : [];
    if (profiles.length > 0) return false;
    if (config.onboardingCompleted || config.onboardingSkipped) return false;
    return true;
  }

  async function maybeStart(config) {
    if (!shouldAutoStart(config)) return false;
    await openFlow(config);
    return true;
  }

  async function openManual() {
    const config = await reloadConfig();
    await openFlow(config);
  }

  window.EasyfattOnboardingUI = {
    maybeStart,
    openManual,
    open: openFlow,
    close: closeOverlay,
  };
})();
