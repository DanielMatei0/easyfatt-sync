/* global window, document */
(function initMarketingAutomationWizard() {
  "use strict";

  const api = () => window.easyfattSync;

  const WIZARD_STEPS = [
    { id: "type", label: "Tipo" },
    { id: "basics", label: "Informazioni" },
    { id: "trigger", label: "Trigger" },
    { id: "consent", label: "Consenso" },
    { id: "preview", label: "Destinatari" },
    { id: "simulate", label: "Simulazione" },
    { id: "activate", label: "Attivazione" },
  ];

  const TYPE_CARDS = [
    {
      type: "birthday",
      label: "Compleanno clienti",
      desc: "Auguri automatici il giorno del compleanno.",
      example: "Es. «Buon compleanno Mario!» il 12 aprile.",
      icon: "birthday",
    },
    {
      type: "points_threshold",
      label: "Soglia punti",
      desc: "Notifica quando i punti fidelity raggiungono un valore.",
      example: "Es. omaggio a 100, 200 o 500 punti.",
      icon: "fidelity",
    },
    {
      type: "new_fidelity",
      label: "Nuova fidelity card",
      desc: "Benvenuto per nuove card o primi punti.",
      example: "Es. email di benvenuto alla attivazione card.",
      icon: "fidelity",
    },
    {
      type: "inactive_customer",
      label: "Cliente inattivo",
      desc: "Riattiva chi non acquista da tempo.",
      example: "Es. «Ci manchi!» dopo 90 giorni senza acquisti.",
      icon: "inactive",
    },
    {
      type: "custom",
      label: "Personalizzata",
      desc: "Campagna flessibile con regole base.",
      example: "Es. newsletter mirata con consenso marketing.",
      icon: "custom",
    },
  ];

  const COLUMN_HINTS = {
    birthDate: "Data di nascita",
    points: "Punti fidelity",
    fidelityCardNumber: "Numero card",
    fidelityActivatedAt: "Data attivazione",
    lastPurchaseDate: "Ultimo acquisto",
    marketingConsent: "Consenso marketing",
    email: "Email",
  };

  let deps = {};
  let step = 0;
  let editingId = null;
  let excelHeaders = [];
  let columnSamples = {};
  let previewData = null;
  let simulationResult = null;

  const state = defaultState();

  function defaultState() {
    return {
      type: "birthday",
      name: "",
      marketingProfileId: "",
      templateId: "",
      enabled: true,
      columnMapping: {},
      conditions: {
        birthdayEnabled: true,
        birthdayOncePerYear: true,
        pointsTriggerEnabled: true,
        pointsThreshold: 100,
        pointsThresholds: [100],
        multiCrossMode: "highest",
        firstThresholdOnly: true,
        inactiveDays: 90,
        fidelityMode: "new_fidelity",
        requireMarketingConsent: true,
        cooldownDays: 30,
      },
      schedule: { mode: "daily", time: "09:00" },
    };
  }

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function createId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getConfig() {
    return deps.getMarketingConfig?.() || { marketingProfiles: [], templates: [], automations: [] };
  }

  function getAppConfig() {
    return deps.getAppConfig?.() || { syncProfiles: [] };
  }

  function iconSvg(icon) {
    const icons = {
      birthday:
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M12 6c1.5-2 4-2 4 1a2.5 2.5 0 01-4 1M8 20h8M6 14h12l-1 6H7l-1-6z" stroke="currentColor" stroke-width="1.5"/></svg>',
      fidelity:
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 10h4M7 14h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      inactive:
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" stroke-width="1.5"/></svg>',
      custom:
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    };
    return icons[icon] || icons.custom;
  }

  function setOverlayOpen(el, open) {
    if (!el) return;
    el.hidden = !open;
    document.body.classList.toggle("mkt-modal-open", open);
  }

  function getMarketingProfile() {
    const cfg = getConfig();
    return (cfg.marketingProfiles || []).find((p) => p.id === state.marketingProfileId) || null;
  }

  function mergedColumnMapping() {
    const profile = getMarketingProfile();
    return { ...(profile?.columnMapping || {}), ...(state.columnMapping || {}) };
  }

  function buildAutomationPayload() {
    const existing = editingId
      ? (getConfig().automations || []).find((a) => a.id === editingId)
      : null;
    return {
      id: editingId || createId("auto"),
      name: state.name.trim(),
      type: state.type,
      enabled: state.enabled !== false,
      archived: existing?.archived || false,
      marketingProfileId: state.marketingProfileId,
      templateId: state.templateId,
      conditions: { ...state.conditions },
      schedule: { ...state.schedule },
      lastSimulationAt: existing?.lastSimulationAt || simulationResult?.simulatedAt || null,
      lastSimulationRecipients:
        existing?.lastSimulationRecipients ??
        (simulationResult?.summary?.valid != null ? simulationResult.summary.valid : null),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function loadExcelSamples() {
    const profile = getMarketingProfile();
    if (!profile?.syncProfileId) {
      excelHeaders = [];
      columnSamples = {};
      return;
    }
    try {
      const res = await api()?.previewMarketingExcel?.({ syncProfileId: profile.syncProfileId });
      excelHeaders = res?.headers || [];
      columnSamples = {};
      const rows = res?.sampleRows || [];
      excelHeaders.forEach((h) => {
        const vals = rows
          .map((row) => row[h])
          .filter((v) => v != null && String(v).trim() !== "")
          .slice(0, 4)
          .map((v) => String(v).trim());
        if (vals.length) columnSamples[h] = vals;
      });
    } catch {
      excelHeaders = [];
      columnSamples = {};
    }
  }

  function mountCombobox(container, options) {
    const {
      label,
      hint,
      value,
      placeholder,
      allowEmpty,
      onChange,
    } = options;
    const opts = options.options || [];
    const selected = opts.find((o) => o.value === value) || null;

    container.innerHTML = `
      <label class="mkt-field mkt-combobox-field">
        <span class="field-label">${escapeHtml(label)}</span>
        <div class="mkt-combobox" data-open="false">
          <button type="button" class="mkt-combobox-trigger" aria-haspopup="listbox" aria-expanded="false">
            <span class="mkt-combobox-value">${escapeHtml(selected?.label || placeholder || "— Seleziona —")}</span>
            <span class="mkt-combobox-chevron" aria-hidden="true">▾</span>
          </button>
          <div class="mkt-combobox-panel" hidden>
            <input type="search" class="mkt-combobox-search mkt-input" placeholder="Cerca…" autocomplete="off" />
            <ul class="mkt-combobox-list" role="listbox"></ul>
          </div>
        </div>
        ${selected?.samples?.length ? `<div class="mkt-combobox-samples"><span class="muted-text">Esempi:</span> ${selected.samples.map((s) => `<code>${escapeHtml(s)}</code>`).join(" ")}</div>` : ""}
        ${hint ? `<p class="field-hint">${escapeHtml(hint)}</p>` : ""}
      </label>`;

    const combo = container.querySelector(".mkt-combobox");
    const trigger = container.querySelector(".mkt-combobox-trigger");
    const panel = container.querySelector(".mkt-combobox-panel");
    const search = container.querySelector(".mkt-combobox-search");
    const list = container.querySelector(".mkt-combobox-list");
    const valueEl = container.querySelector(".mkt-combobox-value");
    const samplesEl = container.querySelector(".mkt-combobox-samples");

    function renderList(filter) {
      const q = String(filter || "").trim().toLowerCase();
      const filtered = opts.filter(
        (o) =>
          !q ||
          o.label.toLowerCase().includes(q) ||
          String(o.value).toLowerCase().includes(q)
      );
      if (allowEmpty) {
        filtered.unshift({ value: "", label: placeholder || "— Non mappata —", samples: [] });
      }
      list.innerHTML = filtered
        .map(
          (o) =>
            `<li role="option" data-value="${escapeHtml(o.value)}" class="${o.value === value ? "is-selected" : ""}">
              <span class="mkt-combobox-option-label">${escapeHtml(o.label)}</span>
              ${o.samples?.length ? `<span class="mkt-combobox-option-samples">${o.samples.map((s) => escapeHtml(s)).join(" · ")}</span>` : ""}
            </li>`
        )
        .join("");
    }

    function close() {
      combo.dataset.open = "false";
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    function openPanel() {
      combo.dataset.open = "true";
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      renderList(search.value);
      search.focus();
    }

    function select(val) {
      const opt = opts.find((o) => o.value === val) || { value: val, label: val, samples: [] };
      valueEl.textContent = opt.label || placeholder || "—";
      if (samplesEl) {
        if (opt.samples?.length) {
          samplesEl.innerHTML = `<span class="muted-text">Esempi:</span> ${opt.samples.map((s) => `<code>${escapeHtml(s)}</code>`).join(" ")}`;
          samplesEl.hidden = false;
        } else {
          samplesEl.hidden = true;
        }
      }
      close();
      onChange(val);
    }

    trigger.addEventListener("click", () => {
      if (combo.dataset.open === "true") close();
      else openPanel();
    });
    search.addEventListener("input", () => renderList(search.value));
    list.addEventListener("click", (e) => {
      const li = e.target.closest("[data-value]");
      if (li) select(li.dataset.value);
    });
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) close();
    });
    renderList("");
    return { setValue: select };
  }

  function headerOptionsForField(fieldKey) {
    const mapping = mergedColumnMapping();
    const current = mapping[fieldKey] || "";
    return excelHeaders.map((h) => ({
      value: h,
      label: h,
      samples: columnSamples[h] || [],
      selected: h === current,
    }));
  }

  function updateProgress() {
    const progress = $("marketingAutoWizardProgress");
    if (progress) {
      progress.innerHTML = WIZARD_STEPS.map(
        (s, i) =>
          `<span class="mkt-auto-wizard-step${i === step ? " is-active" : ""}${i < step ? " is-done" : ""}" title="${escapeHtml(s.label)}"><span class="mkt-auto-wizard-step-num">${i + 1}</span><span class="mkt-auto-wizard-step-label">${escapeHtml(s.label)}</span></span>`
      ).join("");
    }
    const label = $("marketingAutoWizardStepLabel");
    if (label) {
      label.textContent = `Passo ${step + 1} di ${WIZARD_STEPS.length} · ${WIZARD_STEPS[step].label}`;
    }
    const title = $("marketingAutoWizardTitle");
    if (title) {
      title.textContent = editingId ? "Modifica automazione" : "Nuova automazione";
    }
    $("marketingAutoWizardBackBtn")?.toggleAttribute("hidden", step === 0);
    $("marketingAutoWizardNextBtn")?.toggleAttribute("hidden", step >= WIZARD_STEPS.length - 1);
    $("marketingAutoWizardFinishBtn")?.toggleAttribute("hidden", step < WIZARD_STEPS.length - 1);
  }

  function renderStepType(body) {
    body.innerHTML = `
      <p class="mkt-auto-wizard-lead">Scegli il tipo di campagna. Potrai personalizzare i dettagli nei passaggi successivi.</p>
      <div class="mkt-auto-type-grid" role="list">
        ${TYPE_CARDS.map(
          (c) => `<button type="button" class="mkt-auto-type-card${state.type === c.type ? " is-selected" : ""}" data-type="${c.type}" role="listitem">
            <span class="mkt-auto-type-card-icon" aria-hidden="true">${iconSvg(c.icon)}</span>
            <span class="mkt-auto-type-card-body">
              <strong>${escapeHtml(c.label)}</strong>
              <span>${escapeHtml(c.desc)}</span>
              <em class="mkt-auto-type-example">${escapeHtml(c.example)}</em>
            </span>
          </button>`
        ).join("")}
      </div>`;
    body.querySelectorAll(".mkt-auto-type-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.type = btn.dataset.type;
        body.querySelectorAll(".mkt-auto-type-card").forEach((b) => {
          b.classList.toggle("is-selected", b.dataset.type === state.type);
        });
      });
    });
  }

  function renderStepBasics(body) {
    const cfg = getConfig();
    const profiles = cfg.marketingProfiles || [];
    const templates = cfg.templates || [];

    if (!profiles.length) {
      body.innerHTML = `
        <div class="mkt-inline-empty mkt-auto-empty-state">
          <h3>Nessun profilo marketing</h3>
          <p class="muted-text">Configura prima il marketing per collegare i dati Excel.</p>
          <button type="button" class="btn btn-primary" id="mAutoWizSetupBtn">Configura marketing</button>
        </div>`;
      $("mAutoWizSetupBtn")?.addEventListener("click", () => {
        closeWizard(true);
        deps.openMarketingSetup?.();
      });
      return;
    }

    if (!state.marketingProfileId && profiles[0]) {
      state.marketingProfileId = profiles[0].id;
    }

    body.innerHTML = `
      <p class="mkt-auto-wizard-lead">Dai un nome alla campagna e scegli il messaggio email da inviare.</p>
      <label class="mkt-field">
        <span class="field-label">Nome automazione</span>
        <input type="text" id="mAutoWizName" class="mkt-input" placeholder="Es. Auguri compleanno clienti" value="${escapeHtml(state.name)}" />
        <p id="mAutoWizNameError" class="mkt-field-error" hidden></p>
      </label>
      <div id="mAutoWizProfileCombo"></div>
      <div id="mAutoWizTemplateArea"></div>
      <p id="mAutoWizBasicsError" class="mkt-form-feedback is-error" hidden></p>`;

    $("mAutoWizName")?.addEventListener("input", (e) => {
      state.name = e.target.value;
    });

    const profileOpts = profiles.map((p) => ({
      value: p.id,
      label: p.name,
      samples: [],
    }));
    mountCombobox($("mAutoWizProfileCombo"), {
      label: "Profilo marketing",
      hint: "Da quale file Excel provengono i clienti.",
      value: state.marketingProfileId,
      options: profileOpts,
      onChange: async (val) => {
        state.marketingProfileId = val;
        await loadExcelSamples();
        renderStepBasics(body);
      },
    });

    const tplArea = $("mAutoWizTemplateArea");
    if (!templates.length) {
      tplArea.innerHTML = `
        <div class="mkt-inline-empty mkt-auto-tpl-empty">
          <p><strong>Nessun template disponibile</strong></p>
          <p class="muted-text">Crea un template email per continuare.</p>
          <button type="button" class="btn btn-primary btn-sm" id="mAutoWizCreateTplBtn">Crea template</button>
        </div>`;
      $("mAutoWizCreateTplBtn")?.addEventListener("click", openInlineTemplate);
      return;
    }

    tplArea.innerHTML = `<div id="mAutoWizTemplateCombo"></div>`;
    mountCombobox($("mAutoWizTemplateCombo"), {
      label: "Template email",
      hint: "Messaggio inviato ai destinatari idonei.",
      value: state.templateId,
      options: templates.map((t) => ({ value: t.id, label: t.name, samples: [t.subject].filter(Boolean) })),
      onChange: (val) => {
        state.templateId = val;
      },
    });
  }

  function renderStepTrigger(body) {
    const mapping = mergedColumnMapping();
    body.innerHTML = `<p class="mkt-auto-wizard-lead">Definisci quando inviare questa campagna.</p><div id="mAutoWizTriggerFields" class="mkt-auto-trigger-stack"></div>`;
    const fields = $("mAutoWizTriggerFields");

    function colCombo(fieldKey, label, hint) {
      const wrap = document.createElement("div");
      fields.appendChild(wrap);
      mountCombobox(wrap, {
        label,
        hint,
        value: state.columnMapping[fieldKey] || mapping[fieldKey] || "",
        placeholder: "— Seleziona colonna —",
        allowEmpty: false,
        options: headerOptionsForField(fieldKey),
        onChange: (val) => {
          state.columnMapping[fieldKey] = val;
        },
      });
    }

    if (state.type === "birthday") {
      fields.innerHTML = `
        <label class="mkt-toggle-card">
          <input type="checkbox" id="mAutoWizBirthdayEnabled" ${state.conditions.birthdayEnabled !== false ? "checked" : ""} />
          <span class="mkt-toggle-card-body">
            <strong>Trigger compleanno attivo</strong>
            <span>Invia solo il giorno del compleanno del cliente.</span>
          </span>
        </label>`;
      colCombo("birthDate", "Colonna data di nascita", "Dal file Excel.");
      fields.insertAdjacentHTML(
        "beforeend",
        `<label class="mkt-field"><span class="field-label">Ora invio</span><input type="text" id="mAutoWizScheduleTime" class="mkt-input" value="${escapeHtml(state.schedule.time || "09:00")}" placeholder="09:00" /><p class="field-hint">Formato HH:MM per esecuzione giornaliera.</p></label>
        <label class="mkt-toggle-card">
          <input type="checkbox" id="mAutoWizBirthdayOnce" ${state.conditions.birthdayOncePerYear !== false ? "checked" : ""} />
          <span class="mkt-toggle-card-body"><strong>Una volta all'anno</strong><span>Evita invii ripetuti nello stesso anno.</span></span>
        </label>
        <label class="mkt-field"><span class="field-label">Modalità</span>
          <select id="mAutoWizScheduleMode" class="mkt-select">
            <option value="daily" ${state.schedule.mode === "daily" ? "selected" : ""}>Giornaliera automatica</option>
            <option value="manual" ${state.schedule.mode === "manual" ? "selected" : ""}>Manuale (simula su richiesta)</option>
          </select>
        </label>`
      );
      $("mAutoWizBirthdayEnabled")?.addEventListener("change", (e) => {
        state.conditions.birthdayEnabled = e.target.checked;
      });
      $("mAutoWizBirthdayOnce")?.addEventListener("change", (e) => {
        state.conditions.birthdayOncePerYear = e.target.checked;
      });
      $("mAutoWizScheduleTime")?.addEventListener("input", (e) => {
        state.schedule.time = e.target.value;
      });
      $("mAutoWizScheduleMode")?.addEventListener("change", (e) => {
        state.schedule.mode = e.target.value;
      });
      return;
    }

    if (state.type === "points_threshold") {
      fields.innerHTML = `
        <label class="mkt-toggle-card">
          <input type="checkbox" id="mAutoWizPointsEnabled" ${state.conditions.pointsTriggerEnabled !== false ? "checked" : ""} />
          <span class="mkt-toggle-card-body"><strong>Trigger punti attivo</strong><span>Notifica al raggiungimento soglia.</span></span>
        </label>`;
      colCombo("points", "Colonna punti", "Valori numerici fidelity.");
      const thresholdsValue = (
        Array.isArray(state.conditions.pointsThresholds) && state.conditions.pointsThresholds.length
          ? state.conditions.pointsThresholds
          : Number(state.conditions.pointsThreshold) > 0
            ? [Number(state.conditions.pointsThreshold)]
            : []
      ).join(", ");
      fields.insertAdjacentHTML(
        "beforeend",
        `<label class="mkt-field"><span class="field-label">Soglie punti</span><input type="text" id="mAutoWizPointsThresholds" class="mkt-input" value="${escapeHtml(thresholdsValue)}" placeholder="Es. 30, 60, 100" inputmode="numeric" /><p class="field-hint">Una o più soglie separate da virgola. La mail parte quando il cliente supera una soglia; non si ripete finché non riscende sotto e la risupera.</p></label>
        <label class="mkt-field"><span class="field-label">Se supera più soglie insieme</span>
          <select id="mAutoWizMultiCross" class="mkt-select">
            <option value="highest" ${state.conditions.multiCrossMode !== "each" ? "selected" : ""}>Una email (soglia più alta)</option>
            <option value="each" ${state.conditions.multiCrossMode === "each" ? "selected" : ""}>Una email per ogni soglia</option>
          </select>
          <p class="field-hint">Es. da 20 a 100 con soglie 30/60/100: "una email" invia solo la 100, "una per soglia" ne invia 3.</p>
        </label>`
      );
      $("mAutoWizPointsEnabled")?.addEventListener("change", (e) => {
        state.conditions.pointsTriggerEnabled = e.target.checked;
      });
      $("mAutoWizPointsThresholds")?.addEventListener("input", (e) => {
        const list = String(e.target.value || "")
          .split(/[,;\s]+/)
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n) && n > 0);
        const unique = [...new Set(list)].sort((a, b) => a - b);
        state.conditions.pointsThresholds = unique;
        state.conditions.pointsThreshold = unique[0] || 0;
      });
      $("mAutoWizMultiCross")?.addEventListener("change", (e) => {
        state.conditions.multiCrossMode = e.target.value === "each" ? "each" : "highest";
      });
      return;
    }

    if (state.type === "new_fidelity") {
      fields.innerHTML = `<p class="field-hint">Scegli come individuare i nuovi clienti fidelity.</p>`;
      colCombo("fidelityCardNumber", "Colonna identificativo card", "Codice fidelity nel file.");
      fields.insertAdjacentHTML(
        "beforeend",
        `<fieldset class="mkt-radio-cards">
          <legend class="field-label">Modalità trigger</legend>
          <label class="mkt-radio-card"><input type="radio" name="fidelityMode" value="new_fidelity" ${state.conditions.fidelityMode === "new_fidelity" ? "checked" : ""} /><span><strong>Nuova fidelity</strong><span>Attivazione card oggi o primo contatto.</span></span></label>
          <label class="mkt-radio-card"><input type="radio" name="fidelityMode" value="new_row" ${state.conditions.fidelityMode === "new_row" ? "checked" : ""} /><span><strong>Nuova riga</strong><span>Cliente mai contattato in precedenza.</span></span></label>
          <label class="mkt-radio-card"><input type="radio" name="fidelityMode" value="first_points" ${state.conditions.fidelityMode === "first_points" ? "checked" : ""} /><span><strong>Primi punti</strong><span>Almeno un punto e mai notificato.</span></span></label>
        </fieldset>
        <label class="mkt-field"><span class="field-label">Cooldown (giorni)</span><input type="number" id="mAutoWizCooldown" class="mkt-input" min="0" value="${Number(state.conditions.cooldownDays) || 30}" /></label>`
      );
      fields.querySelectorAll('input[name="fidelityMode"]').forEach((r) => {
        r.addEventListener("change", () => {
          if (r.checked) state.conditions.fidelityMode = r.value;
        });
      });
      $("mAutoWizCooldown")?.addEventListener("input", (e) => {
        state.conditions.cooldownDays = Number(e.target.value) || 0;
      });
      return;
    }

    if (state.type === "inactive_customer") {
      colCombo("lastPurchaseDate", "Colonna ultimo acquisto", "Data dell'ultimo acquisto.");
      fields.insertAdjacentHTML(
        "beforeend",
        `<label class="mkt-field"><span class="field-label">Giorni di inattività</span><input type="number" id="mAutoWizInactiveDays" class="mkt-input" min="1" value="${Number(state.conditions.inactiveDays) || 90}" /><p class="field-hint">Cliente senza acquisti da almeno questo numero di giorni.</p></label>
        <label class="mkt-field"><span class="field-label">Cooldown (giorni)</span><input type="number" id="mAutoWizCooldown" class="mkt-input" min="0" value="${Number(state.conditions.cooldownDays) || 30}" /></label>`
      );
      $("mAutoWizInactiveDays")?.addEventListener("input", (e) => {
        state.conditions.inactiveDays = Number(e.target.value) || 90;
      });
      $("mAutoWizCooldown")?.addEventListener("input", (e) => {
        state.conditions.cooldownDays = Number(e.target.value) || 0;
      });
      return;
    }

    fields.innerHTML = `<p class="muted-text">Automazione personalizzata: verranno applicati consenso marketing, email valida e cooldown.</p>
      <label class="mkt-field"><span class="field-label">Cooldown (giorni)</span><input type="number" id="mAutoWizCooldown" class="mkt-input" min="0" value="${Number(state.conditions.cooldownDays) || 30}" /></label>`;
    $("mAutoWizCooldown")?.addEventListener("input", (e) => {
      state.conditions.cooldownDays = Number(e.target.value) || 0;
    });
  }

  function renderStepConsent(body) {
    const cfg = getConfig();
    body.innerHTML = `
      <p class="mkt-auto-wizard-lead">Rispetta il consenso marketing dei clienti (GDPR).</p>
      <div class="mkt-consent-card">
        <label class="mkt-toggle-card mkt-consent-toggle">
          <input type="checkbox" id="mAutoWizRequireConsent" ${state.conditions.requireMarketingConsent !== false ? "checked" : ""} />
          <span class="mkt-toggle-card-body">
            <strong>Richiedi consenso marketing</strong>
            <span>Esclude chi non ha acconsentito alle comunicazioni promozionali.</span>
          </span>
        </label>
        <div id="mAutoWizConsentColCombo"></div>
        <label class="mkt-field">
          <span class="field-label">Valori considerati validi</span>
          <textarea id="mAutoWizConsentValues" class="mkt-textarea" rows="4">${escapeHtml((cfg.validConsentValues || []).join("\n"))}</textarea>
          <p class="field-hint">Un valore per riga (es. sì, si, true, 1).</p>
        </label>
      </div>`;
    $("mAutoWizRequireConsent")?.addEventListener("change", (e) => {
      state.conditions.requireMarketingConsent = e.target.checked;
    });
    mountCombobox($("mAutoWizConsentColCombo"), {
      label: "Colonna consenso marketing",
      hint: "Colonna Excel con sì/no o equivalente.",
      value: state.columnMapping.marketingConsent || mergedColumnMapping().marketingConsent || "",
      allowEmpty: true,
      options: headerOptionsForField("marketingConsent"),
      onChange: (val) => {
        state.columnMapping.marketingConsent = val;
      },
    });
    $("mAutoWizConsentValues")?.addEventListener("change", async (e) => {
      const values = e.target.value
        .split(/[\n,;]+/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      if (values.length) {
        await deps.saveMarketing?.({ validConsentValues: values });
      }
    });
  }

  async function renderStepPreview(body) {
    body.innerHTML = `<p class="mkt-auto-wizard-lead">Anteprima dei destinatari in base alle regole impostate.</p><p class="muted-text">Caricamento…</p>`;
    previewData = null;
    try {
      const automation = buildAutomationPayload();
      automation.enabled = true;
      previewData = await api()?.previewMarketingAutomationDraft?.({
        automation,
        columnMappingOverride: state.columnMapping,
      });
    } catch (e) {
      body.innerHTML = `<p class="mkt-form-feedback is-error">${escapeHtml(e?.message || "Impossibile caricare l'anteprima.")}</p>`;
      return;
    }
    const s = previewData.summary || {};
    body.innerHTML = `
      <ul class="mkt-recipient-stats mkt-auto-preview-stats">
        <li class="mkt-recipient-stat"><span class="stat-label">Totale righe</span><span class="stat-value">${s.total ?? 0}</span></li>
        <li class="mkt-recipient-stat" data-tone="success"><span class="stat-label">Validi</span><span class="stat-value">${s.valid ?? 0}</span></li>
        <li class="mkt-recipient-stat"><span class="stat-label">Esclusi</span><span class="stat-value">${s.excluded ?? s.skipped ?? 0}</span></li>
        <li class="mkt-recipient-stat"><span class="stat-label">Senza email</span><span class="stat-value">${s.withoutEmail ?? 0}</span></li>
        <li class="mkt-recipient-stat"><span class="stat-label">Senza consenso</span><span class="stat-value">${s.withoutConsent ?? 0}</span></li>
        <li class="mkt-recipient-stat"><span class="stat-label">Duplicati email</span><span class="stat-value">${s.duplicateEmails ?? 0}</span></li>
      </ul>
      <div class="mkt-auto-preview-table-wrap">
        <table class="mkt-table mkt-auto-preview-table">
          <thead><tr><th>Nome</th><th>Email</th><th>Stato</th><th>Dettaglio</th></tr></thead>
          <tbody id="mAutoWizPreviewTbody"></tbody>
        </table>
      </div>`;
    const tbody = $("mAutoWizPreviewTbody");
    const rows = [
      ...(previewData.recipients || []).map(
        (r) => `<tr><td>${escapeHtml(r.name || "—")}</td><td>${escapeHtml(r.email)}</td><td><span class="mkt-status-pill" data-status="simulated">Valido</span></td><td class="muted-text">Pronto</td></tr>`
      ),
      ...(previewData.skipped || []).slice(0, 40).map(
        (r) => `<tr><td>${escapeHtml(r.name || "—")}</td><td>${escapeHtml(r.email)}</td><td><span class="mkt-status-pill" data-status="skipped">Escluso</span></td><td class="muted-text">${escapeHtml(r.reason)}</td></tr>`
      ),
    ];
    if (tbody) tbody.innerHTML = rows.join("") || `<tr><td colspan="4" class="muted-text">Nessun destinatario.</td></tr>`;
  }

  function renderStepSimulate(body) {
    const s = simulationResult?.summary || previewData?.summary || {};
    body.innerHTML = `
      <p class="mkt-auto-wizard-lead">Esegui una simulazione per verificare l'impatto prima di attivare.</p>
      <div class="mkt-sim-banner" role="status">
        <strong>Modalità simulazione</strong>
        <span>Nessun invio email reale. I risultati sono salvati nello storico locale.</span>
      </div>
      <button type="button" class="btn btn-primary" id="mAutoWizSimulateBtn">Simula automazione</button>
      <div id="mAutoWizSimulateResult" class="mkt-auto-sim-result" ${simulationResult ? "" : "hidden"}>
        ${simulationResult ? renderSimResultHtml(s) : ""}
      </div>`;
    $("mAutoWizSimulateBtn")?.addEventListener("click", runSimulation);
  }

  function renderSimResultHtml(s) {
    return `
      <ul class="mkt-recipient-stats">
        <li class="mkt-recipient-stat" data-tone="success"><span class="stat-label">Email simulate</span><span class="stat-value">${s.valid ?? simulationResult?.recipients?.length ?? 0}</span></li>
        <li class="mkt-recipient-stat"><span class="stat-label">Esclusi</span><span class="stat-value">${simulationResult?.skippedCount ?? s.skipped ?? 0}</span></li>
        <li class="mkt-recipient-stat"><span class="stat-label">Duplicati evitati</span><span class="stat-value">${s.duplicateEmails ?? 0}</span></li>
      </ul>
      <p class="muted-text">${escapeHtml(simulationResult?.message || "Simulazione completata.")}</p>`;
  }

  async function runSimulation() {
    const btn = $("mAutoWizSimulateBtn");
    if (btn) btn.disabled = true;
    try {
      const automation = buildAutomationPayload();
      automation.enabled = true;
      simulationResult = await api()?.simulateMarketingAutomationDraft?.({
        automation,
        columnMappingOverride: state.columnMapping,
      });
      simulationResult.simulatedAt = new Date().toISOString();
      deps.showToast?.(simulationResult.message || "Simulazione completata.");
      const resultEl = $("mAutoWizSimulateResult");
      if (resultEl) {
        resultEl.hidden = false;
        resultEl.innerHTML = renderSimResultHtml(simulationResult.summary || {});
      }
    } catch (e) {
      deps.showToast?.(e?.message || "Errore simulazione.", { error: true });
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderStepActivate(body) {
    const card = TYPE_CARDS.find((c) => c.type === state.type);
    const tpl = (getConfig().templates || []).find((t) => t.id === state.templateId);
    const prof = getMarketingProfile();
    body.innerHTML = `
      <p class="mkt-auto-wizard-lead">Controlla il riepilogo e attiva la campagna.</p>
      <dl class="mkt-auto-summary">
        <div><dt>Nome</dt><dd>${escapeHtml(state.name || "—")}</dd></div>
        <div><dt>Tipo</dt><dd>${escapeHtml(card?.label || state.type)}</dd></div>
        <div><dt>Profilo</dt><dd>${escapeHtml(prof?.name || "—")}</dd></div>
        <div><dt>Template</dt><dd>${escapeHtml(tpl?.name || "—")}</dd></div>
        <div><dt>Destinatari validi</dt><dd>${previewData?.summary?.valid ?? "—"}</dd></div>
      </dl>
      <label class="mkt-toggle-card">
        <input type="checkbox" id="mAutoWizEnabled" ${state.enabled !== false ? "checked" : ""} />
        <span class="mkt-toggle-card-body"><strong>Automazione attiva</strong><span>Se disattivata, non verrà eseguita automaticamente.</span></span>
      </label>
      ${
        getConfig().realSendEnabled
          ? `<div class="mkt-sim-banner mkt-sim-banner-live" role="status">
        <strong>Invio reale attivo</strong>
        <span>Le automazioni programmate inviano email tramite Aven Labs. Per gli invii manuali è richiesta la conferma del consenso marketing.</span>
      </div>`
          : `<div class="mkt-sim-banner" role="status">
        <strong>Solo simulazione</strong>
        <span>L'invio reale non è abilitato. Attivalo in Impostazioni marketing → Dati azienda e brand.</span>
      </div>`
      }`;
    $("mAutoWizEnabled")?.addEventListener("change", (e) => {
      state.enabled = e.target.checked;
    });
  }

  async function renderWizardStep() {
    const body = $("marketingAutoWizardBody");
    if (!body) return;
    updateProgress();
    previewData = step === 4 ? previewData : step > 4 ? previewData : null;

    if (step === 0) renderStepType(body);
    else if (step === 1) {
      await loadExcelSamples();
      renderStepBasics(body);
    } else if (step === 2) {
      await loadExcelSamples();
      renderStepTrigger(body);
    } else if (step === 3) {
      await loadExcelSamples();
      renderStepConsent(body);
    } else if (step === 4) await renderStepPreview(body);
    else if (step === 5) renderStepSimulate(body);
    else if (step === 6) renderStepActivate(body);
  }

  function validateStep() {
    if (step === 1) {
      if (!state.name.trim()) {
        const err = $("mAutoWizNameError");
        if (err) {
          err.hidden = false;
          err.textContent = "Inserisci un nome per l'automazione.";
        }
        return false;
      }
      if (!state.marketingProfileId) {
        deps.showToast?.("Seleziona un profilo marketing.", { error: true });
        return false;
      }
      if (!state.templateId) {
        deps.showToast?.("Seleziona o crea un template email.", { error: true });
        return false;
      }
    }
    if (step === 2) {
      const map = mergedColumnMapping();
      if (state.type === "birthday" && !map.birthDate && !state.columnMapping.birthDate) {
        deps.showToast?.("Seleziona la colonna data di nascita.", { error: true });
        return false;
      }
      if (state.type === "points_threshold" && !map.points && !state.columnMapping.points) {
        deps.showToast?.("Seleziona la colonna punti.", { error: true });
        return false;
      }
      if (
        state.type === "points_threshold" &&
        !(Array.isArray(state.conditions.pointsThresholds) && state.conditions.pointsThresholds.length)
      ) {
        deps.showToast?.("Imposta almeno una soglia punti (es. 30, 60, 100).", { error: true });
        return false;
      }
      if (state.type === "inactive_customer" && !map.lastPurchaseDate && !state.columnMapping.lastPurchaseDate) {
        deps.showToast?.("Seleziona la colonna ultimo acquisto.", { error: true });
        return false;
      }
    }
    return true;
  }

  function draftPayload() {
    return {
      step,
      updatedAt: new Date().toISOString(),
      editingAutomationId: editingId,
      data: {
        type: state.type,
        name: state.name,
        marketingProfileId: state.marketingProfileId,
        templateId: state.templateId,
        enabled: state.enabled,
        conditions: { ...state.conditions },
        schedule: { ...state.schedule },
        columnMapping: { ...state.columnMapping },
      },
    };
  }

  async function persistDraft() {
    await deps.saveMarketing?.({ automationWizardDraft: draftPayload() });
  }

  async function clearDraft() {
    await deps.saveMarketing?.({ automationWizardDraft: null });
  }

  function applyDraft(draft) {
    if (!draft?.data) return;
    step = draft.step || 0;
    editingId = draft.editingAutomationId || null;
    Object.assign(state, defaultState(), draft.data);
    state.conditions = { ...defaultState().conditions, ...(draft.data.conditions || {}) };
    state.schedule = { ...defaultState().schedule, ...(draft.data.schedule || {}) };
    state.columnMapping = { ...(draft.data.columnMapping || {}) };
  }

  function loadFromAutomation(automation) {
    if (!automation) return;
    state.type = automation.type;
    state.name = automation.name;
    state.marketingProfileId = automation.marketingProfileId;
    state.templateId = automation.templateId;
    state.enabled = automation.enabled !== false;
    state.conditions = { ...defaultState().conditions, ...(automation.conditions || {}) };
    state.schedule = { ...(automation.schedule || defaultState().schedule) };
  }

  async function finishWizard() {
    const payload = buildAutomationPayload();
    const cfg = getConfig();
    let profiles = [...(cfg.marketingProfiles || [])];
    const pIdx = profiles.findIndex((p) => p.id === state.marketingProfileId);
    if (pIdx >= 0 && Object.keys(state.columnMapping).length) {
      profiles[pIdx] = {
        ...profiles[pIdx],
        columnMapping: { ...profiles[pIdx].columnMapping, ...state.columnMapping },
      };
    }
    let autos = [...(cfg.automations || [])];
    const idx = autos.findIndex((a) => a.id === payload.id);
    if (idx >= 0) autos[idx] = { ...autos[idx], ...payload };
    else autos.push(payload);

    await deps.saveMarketing?.({
      marketingProfiles: profiles,
      automations: autos,
      automationWizardDraft: null,
    });
    deps.showToast?.(editingId ? "Automazione aggiornata." : "Automazione attivata.");
    closeWizard(false);
    deps.onComplete?.(payload);
  }

  function closeWizard(saveDraftOnClose) {
    if (saveDraftOnClose && (state.name.trim() || step > 0)) {
      persistDraft();
      deps.showToast?.("Bozza salvata. Puoi riprendere quando vuoi.", { info: true });
    }
    setOverlayOpen($("marketingAutoWizardOverlay"), false);
    editingId = null;
    step = 0;
    Object.assign(state, defaultState());
    previewData = null;
    simulationResult = null;
  }

  function openInlineTemplate() {
    const starterByType = {
      birthday: "birthday",
      points_threshold: "points_threshold",
      new_fidelity: "new_fidelity",
      inactive_customer: "inactive_customer",
    };
    const starterType = starterByType[state.type] || null;
    window.EasyfattTemplateEditor?.open?.(null, {
      starterType,
      onSaved: (payload) => {
        state.templateId = payload.id;
        deps.showToast?.("Template creato.");
        if (step === 1) renderStepBasics($("marketingAutoWizardBody"));
      },
    });
  }

  async function open(editId, typePreset) {
    const cfg = getConfig();
    editingId = editId || null;
    Object.assign(state, defaultState());
    step = 0;
    previewData = null;
    simulationResult = null;

    if (editId) {
      const auto = (cfg.automations || []).find((a) => a.id === editId);
      loadFromAutomation(auto);
    } else if (typePreset) {
      state.type = typePreset;
    }

    if (!editId && cfg.automationWizardDraft && !typePreset) {
      const resume = window.confirm(
        "Hai una bozza di automazione non completata. Vuoi riprenderla?"
      );
      if (resume) applyDraft(cfg.automationWizardDraft);
    }

    setOverlayOpen($("marketingAutoWizardOverlay"), true);
    await renderWizardStep();
  }

  async function resumeDraft() {
    const draft = getConfig().automationWizardDraft;
    if (!draft) return;
    applyDraft(draft);
    previewData = null;
    simulationResult = null;
    setOverlayOpen($("marketingAutoWizardOverlay"), true);
    await renderWizardStep();
  }

  function bindEvents() {
    $("marketingAutoWizardCloseBtn")?.addEventListener("click", () => {
      if (step > 0 || state.name.trim()) {
        if (window.confirm("Salvare la bozza e chiudere?")) closeWizard(true);
        else closeWizard(false);
      } else closeWizard(false);
    });
    $("marketingAutoWizardBackBtn")?.addEventListener("click", () => {
      if (step > 0) {
        step -= 1;
        renderWizardStep();
      }
    });
    $("marketingAutoWizardNextBtn")?.addEventListener("click", async () => {
      if (!validateStep()) return;
      if (step < WIZARD_STEPS.length - 1) {
        step += 1;
        await renderWizardStep();
        await persistDraft();
      }
    });
    $("marketingAutoWizardFinishBtn")?.addEventListener("click", finishWizard);
    $("marketingAutoDraftResumeBtn")?.addEventListener("click", resumeDraft);
    $("marketingAutoDraftDiscardBtn")?.addEventListener("click", async () => {
      if (!window.confirm("Eliminare la bozza?")) return;
      await clearDraft();
      deps.renderDraftBanner?.();
    });
  }

  function init(dependencies) {
    deps = dependencies || {};
    if (!$("marketingAutoWizardOverlay")) return;
    bindEvents();
  }

  window.EasyfattAutomationWizard = {
    init,
    open,
    resumeDraft,
    renderDraftBanner: () => deps.renderDraftBanner?.(),
  };
})();
