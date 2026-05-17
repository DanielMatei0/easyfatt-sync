/* global window, document */
(function initMarketingUI() {
  "use strict";

  const api = () => window.easyfattSync;

  const COLUMN_FIELDS = [
    { key: "firstName", label: "Nome", hint: "Nome del cliente come compare nell'email." },
    { key: "lastName", label: "Cognome", hint: "Cognome per personalizzare il saluto." },
    { key: "email", label: "Email", hint: "Indirizzo destinatario — campo essenziale per ogni invio.", required: true },
    { key: "phone", label: "Telefono", hint: "Opzionale, utile per future comunicazioni." },
    { key: "birthDate", label: "Data nascita", hint: "Formato data Excel; usata per automazione compleanno." },
    { key: "fidelityCardNumber", label: "Numero fidelity", hint: "Codice card fidelity del cliente." },
    { key: "fidelityActivatedAt", label: "Data attivazione fidelity", hint: "Data di attivazione card per automazione nuova fidelity." },
    { key: "points", label: "Punti", hint: "Punti fidelity attuali per soglie e promozioni." },
    { key: "marketingConsent", label: "Consenso marketing", hint: "Colonna sì/no o valori equivalenti per filtrare i destinatari." },
    { key: "lastPurchaseDate", label: "Ultimo acquisto", hint: "Data ultimo acquisto per clienti inattivi." },
  ];

  const AUTO_META = {
    birthday: {
      label: "Compleanno cliente",
      desc: "Invia un augurio automatico il giorno del compleanno del cliente.",
    },
    points_threshold: {
      label: "Soglia punti fidelity",
      desc: "Notifica quando i punti raggiungono la soglia impostata.",
    },
    new_fidelity: {
      label: "Nuova fidelity card",
      desc: "Messaggio di benvenuto alla attivazione della card oggi.",
    },
    inactive_customer: {
      label: "Cliente inattivo",
      desc: "Riattiva clienti senza acquisti da un periodo definito.",
    },
    custom: {
      label: "Personalizzata",
      desc: "Automazione libera per campagne su misura.",
    },
  };

  const AUTO_CATEGORIES = [
    {
      id: "fidelity_points",
      label: "Soglia punti",
      desc: "Notifica quando i punti fidelity raggiungono una soglia.",
      types: ["points_threshold"],
      icon: "fidelity",
    },
    {
      id: "fidelity_new",
      label: "Nuova fidelity card",
      desc: "Benvenuto per chi attiva una nuova card fidelity.",
      types: ["new_fidelity"],
      icon: "fidelity",
    },
    {
      id: "birthday",
      label: "Compleanni",
      desc: "Auguri automatici il giorno del compleanno.",
      types: ["birthday"],
      icon: "birthday",
    },
    {
      id: "inactive",
      label: "Clienti inattivi",
      desc: "Riattiva chi chi non acquista da tempo.",
      types: ["inactive_customer"],
      icon: "inactive",
    },
    {
      id: "custom",
      label: "Personalizzate",
      desc: "Campagne su misura con regole flessibili.",
      types: ["custom"],
      icon: "custom",
    },
  ];

  const LIFECYCLE_LABELS = {
    active: "Attiva",
    disabled: "Disattivata",
    archived: "Archiviata",
  };

  const STARTER_TEMPLATES = [
    { type: "birthday", label: "Compleanno cliente" },
    { type: "points_threshold", label: "Premio punti" },
    { type: "new_fidelity", label: "Benvenuto fidelity" },
    { type: "inactive_customer", label: "Cliente inattivo" },
  ];

  const STATUS_LABELS = {
    simulated: "Simulato",
    sent: "Inviato",
    failed: "Fallito",
    skipped: "Saltato",
  };

  let marketingConfig = null;
  let appConfig = null;
  let wizardStep = 0;
  let wizardDraft = {
    syncProfileId: "",
    profileName: "",
    columnMapping: {},
    businessName: "",
    senderName: "",
    replyToEmail: "",
    headers: [],
  };
  let editingAutomationId = null;
  let recipientsAutomationId = null;
  let automationListCategoryId = null;
  let automationFilter = "all";
  let createAutomationTypePreset = null;
  let sendConfirmAutomationId = null;

  function createId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  }

  function fmtDateShort(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
  }

  function showFeedback(el, message, isError) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-error", "is-success");
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle("is-error", !!isError);
    el.classList.toggle("is-success", !isError);
  }

  const toastTimers = new Map();

  function showToast(message, options = {}) {
    const text = String(message || "").trim();
    if (!text) return;
    let host = $("marketingToastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "marketingToastHost";
      host.className = "mkt-toast-host";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      document.body.appendChild(host);
    }
    const tone = options.error ? "error" : options.info ? "info" : "success";
    const toast = document.createElement("div");
    toast.className = "mkt-toast";
    toast.dataset.tone = tone;
    toast.setAttribute("role", "status");
    toast.textContent = text;
    host.hidden = false;
    host.appendChild(toast);
    const duration = Math.min(8000, Math.max(2800, text.length * 45));
    const timer = window.setTimeout(() => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => {
        toast.remove();
        if (host.childElementCount === 0) {
          host.hidden = true;
        }
      }, 220);
      toastTimers.delete(toast);
    }, duration);
    toastTimers.set(toast, timer);
  }

  function setOverlayOpen(overlay, open) {
    if (!overlay) return;
    overlay.hidden = !open;
    document.body.classList.toggle("mkt-modal-open", open);
  }

  async function loadData() {
    const [m, c] = await Promise.all([api()?.getMarketingConfig?.(), api()?.getConfig?.()]);
    marketingConfig = m || {
      enabled: false,
      marketingProfiles: [],
      automations: [],
      templates: [],
      sendHistory: [],
      deletedAutomationNames: {},
    };
    appConfig = c || { syncProfiles: [] };
    return marketingConfig;
  }

  async function saveMarketing(partial) {
    if (partial.businessProfile && marketingConfig?.businessProfile) {
      partial.businessProfile = {
        ...marketingConfig.businessProfile,
        ...partial.businessProfile,
      };
    }
    marketingConfig = { ...marketingConfig, ...partial };
    if (partial.businessProfile) {
      marketingConfig.businessName = partial.businessProfile.businessName || marketingConfig.businessName;
      marketingConfig.senderName = partial.businessProfile.senderName || marketingConfig.senderName;
      marketingConfig.replyToEmail = partial.businessProfile.replyToEmail || marketingConfig.replyToEmail;
    }
    const res = await api()?.saveMarketingConfig?.(marketingConfig);
    if (res?.config) marketingConfig = res.config;
    renderAll();
    return marketingConfig;
  }

  function getPrimaryMarketingProfile() {
    return marketingConfig?.marketingProfiles?.[0] || null;
  }

  function getSyncProfileName(syncProfileId) {
    const sp = (appConfig?.syncProfiles || []).find((p) => p.id === syncProfileId);
    return sp?.name || "—";
  }

  function findAutomation(id) {
    return (marketingConfig?.automations || []).find((a) => a.id === id) || null;
  }

  function getAutomationLifecycle(automation) {
    if (!automation) return "disabled";
    if (automation.archived) return "archived";
    if (automation.enabled === false) return "disabled";
    return "active";
  }

  function getCategoryById(categoryId) {
    return AUTO_CATEGORIES.find((c) => c.id === categoryId) || null;
  }

  function getAutomationsInCategory(categoryId) {
    const cat = getCategoryById(categoryId);
    if (!cat) return [];
    return (marketingConfig?.automations || []).filter((a) => cat.types.includes(a.type));
  }

  function matchesAutomationFilter(automation, filter) {
    const life = getAutomationLifecycle(automation);
    if (filter === "archived") return life === "archived";
    if (life === "archived") return false;
    if (filter === "active") return life === "active";
    if (filter === "disabled") return life === "disabled";
    return true;
  }

  function getCategoryStats(categoryId) {
    const autos = getAutomationsInCategory(categoryId);
    const visible = autos.filter((a) => !a.archived);
    const active = visible.filter((a) => a.enabled !== false).length;
    let statusLabel = "Vuota";
    let statusTone = "muted";
    if (autos.some((a) => a.archived)) {
      const nonArchived = autos.filter((a) => !a.archived);
      if (!nonArchived.length && autos.length) {
        statusLabel = "Archiviata";
        statusTone = "archived";
      }
    }
    if (visible.length) {
      if (active === visible.length) {
        statusLabel = "Operativa";
        statusTone = "success";
      } else if (active > 0) {
        statusLabel = "Parziale";
        statusTone = "accent";
      } else {
        statusLabel = "In pausa";
        statusTone = "muted";
      }
    }
    return { total: autos.length, visible: visible.length, active, statusLabel, statusTone };
  }

  function getLastRunForAutomation(automation) {
    if (automation?.lastSimulationAt) return automation.lastSimulationAt;
    const entry = (marketingConfig?.sendHistory || []).find(
      (h) =>
        h.automationId === automation?.id &&
        (h.status === "simulated" || h.status === "sent")
    );
    return entry?.sentAt || null;
  }

  function getLastSimulationCount(automation) {
    if (automation?.lastSimulationRecipients != null) {
      return automation.lastSimulationRecipients;
    }
    return null;
  }

  function getMarketingProfileName(marketingProfileId) {
    const p = (marketingConfig?.marketingProfiles || []).find((x) => x.id === marketingProfileId);
    return p?.name || "—";
  }

  function categoryIconSvg(icon) {
    const icons = {
      fidelity:
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 10h4M7 14h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      birthday:
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 6c1.5-2 4-2 4 1a2.5 2.5 0 01-4 1M8 20h8M6 14h12l-1 6H7l-1-6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      inactive:
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      custom:
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    };
    return icons[icon] || icons.custom;
  }

  function setMarketingTab(tab) {
    document.querySelectorAll(".mkt-tab").forEach((btn) => {
      const active = btn.dataset.marketingTab === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll(".mkt-panel").forEach((panel) => {
      panel.hidden = panel.dataset.marketingPanel !== tab;
    });
  }

  function updateStatusBadge(stats) {
    const badge = $("marketingStatusBadge");
    if (!badge) return;
    if (!marketingConfig?.enabled) {
      badge.dataset.state = "unconfigured";
      badge.textContent = "Non configurato";
      return;
    }
    if (stats?.realSendEnabled || marketingConfig?.realSendEnabled) {
      badge.dataset.state = "active";
      badge.textContent = "Invio reale attivo";
    } else {
      badge.dataset.state = "simulation";
      badge.textContent = "Simulazione";
    }
    updateSimBanner();
  }

  function updateSimBanner() {
    const banner = $("marketingSimBanner");
    if (!banner) return;
    const textWrap = banner.querySelector(".mkt-sim-banner-text");
    if (!textWrap) return;
    const real = !!marketingConfig?.realSendEnabled;
    if (real) {
      textWrap.innerHTML =
        "<strong>Invio reale attivo.</strong> <span>Le automazioni programmate possono inviare email tramite il backend Aven Labs. Per gli invii manuali è richiesta la conferma del consenso marketing.</span>";
    } else {
      textWrap.innerHTML =
        "<strong>Modalità simulazione.</strong> <span>Nessun invio reale: le email vengono preparate e registrate nello storico locale. Abilita l'invio reale in Impostazioni → Dati azienda e brand.</span>";
    }
  }

  function renderShell() {
    const enabled = !!marketingConfig?.enabled;
    const empty = $("marketingEmptyState");
    const main = $("marketingMainContent");
    if (empty) empty.hidden = enabled;
    if (main) main.hidden = !enabled;
  }

  async function refreshStats() {
    try {
      const stats = await api()?.getMarketingStats?.();
      if (!stats) return;
      updateStatusBadge(stats);
      if ($("marketingStatAutomations")) {
        $("marketingStatAutomations").textContent = String(stats.activeAutomations);
      }
      if ($("marketingStatRecipients")) {
        $("marketingStatRecipients").textContent = String(stats.dueToday ?? 0);
      }
      if ($("marketingStatLastSend")) {
        $("marketingStatLastSend").textContent = stats.lastSendAt
          ? fmtDate(stats.lastSendAt)
          : "—";
      }
      const profile = getPrimaryMarketingProfile();
      if ($("marketingStatProfile")) {
        $("marketingStatProfile").textContent = profile
          ? profile.name || getSyncProfileName(profile.syncProfileId)
          : "—";
      }
    } catch (_) {
      /* ignore */
    }
  }

  function buildSelectOptions(headers, selected) {
    const opts = ['<option value="">— Non mappata —</option>'];
    headers.forEach((h) => {
      const sel = selected === h ? " selected" : "";
      opts.push(`<option value="${escapeHtml(h)}"${sel}>${escapeHtml(h)}</option>`);
    });
    return opts.join("");
  }

  function buildMappingFieldHtml(field, mapping, headers, dataAttr) {
    const selected = mapping?.[field.key] || "";
    const req = field.required ? ' <span class="mkt-required">*</span>' : "";
    return `
      <label class="mkt-field mkt-map-field">
        <span class="field-label">${escapeHtml(field.label)}${req}</span>
        <select class="mkt-select" ${dataAttr}="${field.key}">
          ${buildSelectOptions(headers, selected)}
        </select>
        <p class="field-hint">${escapeHtml(field.hint)}</p>
      </label>`;
  }

  function renderOverview() {
    const list = $("marketingOverviewList");
    if (!list) return;
    const profiles = marketingConfig?.marketingProfiles || [];
    const autos = marketingConfig?.automations || [];
    if (!profiles.length) {
      list.innerHTML =
        '<li class="mkt-overview-empty muted-text">Completa la configurazione per vedere il riepilogo.</li>';
      return;
    }
    list.innerHTML = profiles
      .map((p) => {
        const syncName = getSyncProfileName(p.syncProfileId);
        const activeCount = autos.filter((a) => a.marketingProfileId === p.id && a.enabled).length;
        const mapped = Object.keys(p.columnMapping || {}).filter(Boolean).length;
        return `<li class="mkt-overview-item">
          <div class="mkt-overview-item-head">
            <strong>${escapeHtml(p.name)}</strong>
            <span class="mkt-pill" data-tone="accent">${activeCount} attive</span>
          </div>
          <p class="muted-text">${escapeHtml(syncName)} · ${mapped} campi mappati</p>
        </li>`;
      })
      .join("");
  }

  function showAutomationCategoriesView() {
    automationListCategoryId = null;
    const catView = $("marketingAutomationCategoriesView");
    const listView = $("marketingAutomationListView");
    if (catView) catView.hidden = false;
    if (listView) listView.hidden = true;
    renderAutomationCategories();
  }

  function openAutomationCategory(categoryId, filter) {
    automationListCategoryId = categoryId;
    if (filter) automationFilter = filter;
    const cat = getCategoryById(categoryId);
    const catView = $("marketingAutomationCategoriesView");
    const listView = $("marketingAutomationListView");
    if (catView) catView.hidden = true;
    if (listView) listView.hidden = false;
    if ($("marketingAutomationListTitle")) $("marketingAutomationListTitle").textContent = cat?.label || "Automazioni";
    if ($("marketingAutomationListDesc")) $("marketingAutomationListDesc").textContent = cat?.desc || "";
    document.querySelectorAll(".mkt-filter-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.autoFilter === automationFilter);
    });
    renderAutomationList();
  }

  function renderAutomationPanel() {
    if (automationListCategoryId) openAutomationCategory(automationListCategoryId);
    else showAutomationCategoriesView();
  }

  function renderAutomationCategories() {
    renderAutomationDraftBanner();
    const grid = $("marketingAutomationCategories");
    if (!grid) return;
    grid.innerHTML = AUTO_CATEGORIES.map((cat) => {
      const stats = getCategoryStats(cat.id);
      return `<article class="mkt-category-card" role="listitem" data-category="${cat.id}">
        <div class="mkt-category-card-icon" aria-hidden="true">${categoryIconSvg(cat.icon)}</div>
        <div class="mkt-category-card-body">
          <div class="mkt-category-card-head">
            <h3>${escapeHtml(cat.label)}</h3>
            <span class="mkt-pill" data-tone="${stats.statusTone}">${escapeHtml(stats.statusLabel)}</span>
          </div>
          <p class="mkt-category-card-desc">${escapeHtml(cat.desc)}</p>
          <p class="mkt-category-card-meta"><span><strong>${stats.active}</strong> attive</span><span> · </span><span>${stats.visible} automazioni</span></p>
        </div>
        <footer class="mkt-category-card-foot">
          <button type="button" class="btn btn-secondary btn-sm" data-cat-action="open" data-category="${cat.id}">Apri</button>
          <button type="button" class="btn btn-primary btn-sm" data-cat-action="create" data-category="${cat.id}">Nuova automazione</button>
        </footer>
      </article>`;
    }).join("");
    grid.querySelectorAll("[data-cat-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const catId = btn.dataset.category;
        if (btn.dataset.catAction === "open") {
          automationFilter = "all";
          openAutomationCategory(catId, "all");
        } else {
          const cat = getCategoryById(catId);
          createAutomationTypePreset = cat?.types?.[0] || "custom";
          openAutomationModal(null, createAutomationTypePreset);
        }
      });
    });
  }

  function renderAutomationList() {
    const list = $("marketingAutomationsList");
    const empty = $("marketingAutomationsEmpty");
    const emptyText = $("marketingAutomationsEmptyText");
    if (!list) return;
    const autos = getAutomationsInCategory(automationListCategoryId).filter((a) =>
      matchesAutomationFilter(a, automationFilter)
    );
    if (empty) empty.hidden = autos.length > 0;
    if (emptyText) {
      emptyText.textContent =
        automationFilter === "archived"
          ? "Nessuna automazione archiviata in questa categoria."
          : "Nessuna automazione configurata";
    }
    list.innerHTML = autos
      .map((a) => {
        const meta = AUTO_META[a.type] || AUTO_META.custom;
        const tpl = (marketingConfig.templates || []).find((t) => t.id === a.templateId);
        const life = getAutomationLifecycle(a);
        const lastRun = getLastRunForAutomation(a);
        const lastCount = getLastSimulationCount(a);
        const scheduleLabel =
          a.schedule?.mode === "daily" ? `Giornaliera · ${a.schedule?.time || "09:00"}` : "Manuale";
        const canSimulate = life === "active";
        const realSend = !!marketingConfig?.realSendEnabled;
        return `<article class="mkt-auto-card" data-auto-id="${a.id}" data-lifecycle="${life}">
          <header class="mkt-auto-card-head">
            <div class="mkt-auto-card-title">
              <h3>${escapeHtml(a.name)}</h3>
              <span class="mkt-pill" data-lifecycle="${life}">${escapeHtml(LIFECYCLE_LABELS[life])}</span>
            </div>
            <span class="mkt-auto-type">${escapeHtml(meta.label)}</span>
          </header>
          <p class="mkt-auto-desc">${escapeHtml(meta.desc)}</p>
          <dl class="mkt-auto-meta">
            <div><dt>Template</dt><dd>${escapeHtml(tpl?.name || "—")}</dd></div>
            <div><dt>Profilo</dt><dd>${escapeHtml(getMarketingProfileName(a.marketingProfileId))}</dd></div>
            <div><dt>Ultima esecuzione</dt><dd>${lastRun ? fmtDate(lastRun) : "Mai"}</dd></div>
            <div><dt>Ultima simulazione</dt><dd>${lastCount != null ? `${lastCount} destinatari` : "—"}</dd></div>
            <div><dt>Modalità</dt><dd>${escapeHtml(scheduleLabel)}</dd></div>
          </dl>
          <footer class="mkt-auto-card-foot">
            <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${a.id}">Modifica</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="duplicate" data-id="${a.id}">Duplica</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="preview" data-id="${a.id}">Anteprima</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="simulate" data-id="${a.id}"${canSimulate ? "" : " disabled"}>Simula</button>
            ${realSend && canSimulate ? `<button type="button" class="btn btn-primary btn-sm mkt-btn-send-real" data-action="send-real" data-id="${a.id}">Invia email reali</button>` : ""}
            ${canSimulate ? `<button type="button" class="btn btn-ghost btn-sm" data-action="dry-run" data-id="${a.id}">Test backend</button>` : ""}
            ${life === "archived" ? `<button type="button" class="btn btn-ghost btn-sm" data-action="unarchive" data-id="${a.id}">Ripristina</button>` : `<button type="button" class="btn btn-ghost btn-sm" data-action="archive" data-id="${a.id}">Archivia</button>`}
            ${life === "active" ? `<button type="button" class="btn btn-ghost btn-sm" data-action="disable" data-id="${a.id}">Disattiva</button>` : life === "disabled" ? `<button type="button" class="btn btn-ghost btn-sm" data-action="enable" data-id="${a.id}">Attiva</button>` : ""}
            <button type="button" class="btn btn-ghost btn-sm mkt-btn-danger-text" data-action="delete" data-id="${a.id}">Elimina</button>
          </footer>
        </article>`;
      })
      .join("");
    list.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAutomationAction(btn.dataset.action, btn.dataset.id));
    });
  }

  async function duplicateAutomation(id) {
    const source = findAutomation(id);
    if (!source) return;
    const copy = {
      ...source,
      conditions: { ...(source.conditions || {}) },
      schedule: { ...(source.schedule || { mode: "manual", time: "09:00" }) },
      id: createId("auto"),
      name: `Copia di ${source.name}`,
      enabled: false,
      archived: false,
      lastSimulationAt: null,
      lastSimulationRecipients: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveMarketing({ automations: [...(marketingConfig.automations || []), copy] });
    showToast(`Automazione duplicata: «${copy.name}».`);
    const catId = automationListCategoryId || AUTO_CATEGORIES.find((c) => c.types.includes(copy.type))?.id;
    if (catId) openAutomationCategory(catId);
  }

  async function setAutomationArchived(id, archived) {
    const autos = (marketingConfig.automations || []).map((a) =>
      a.id === id ? { ...a, archived, enabled: archived ? false : a.enabled, updatedAt: new Date().toISOString() } : a
    );
    await saveMarketing({ automations: autos });
  }

  async function setAutomationEnabled(id, enabled) {
    const autos = (marketingConfig.automations || []).map((a) =>
      a.id === id ? { ...a, enabled, archived: false, updatedAt: new Date().toISOString() } : a
    );
    await saveMarketing({ automations: autos });
  }

  async function deleteAutomation(id) {
    const auto = findAutomation(id);
    if (!auto) return;
    const msg =
      `Eliminare definitivamente l'automazione «${auto.name}»?\n\n` +
      "La configurazione verrà rimossa. Lo storico invii resterà conservato e comparirà come «Automazione eliminata».";
    if (!window.confirm(msg)) return;
    const deletedAutomationNames = {
      ...(marketingConfig.deletedAutomationNames || {}),
      [id]: auto.name,
    };
    marketingConfig.automations = (marketingConfig.automations || []).filter((a) => a.id !== id);
    await saveMarketing({ deletedAutomationNames });
    showToast(`Automazione «${auto.name}» eliminata. Lo storico è conservato.`);
  }

  async function handleAutomationAction(action, id) {
    if (action === "preview") {
      recipientsAutomationId = id;
      await openRecipientsModal(id);
      return;
    }
    if (action === "simulate") await runSimulation(id);
    else if (action === "send-real") await openSendConfirmModal(id);
    else if (action === "dry-run") await runDryRun(id);
    else if (action === "edit") openAutomationModal(id);
    else if (action === "duplicate") await duplicateAutomation(id);
    else if (action === "archive") {
      await setAutomationArchived(id, true);
      showToast("Automazione archiviata.");
    } else if (action === "unarchive") {
      await setAutomationArchived(id, false);
      showToast("Automazione ripristinata.");
    } else if (action === "enable") {
      await setAutomationEnabled(id, true);
      showToast("Automazione attivata.");
    } else if (action === "disable") {
      await setAutomationEnabled(id, false);
      showToast("Automazione disattivata.");
    } else if (action === "delete") await deleteAutomation(id);
  }
  function renderStarterTemplates() {
    const row = $("marketingStarterTemplates");
    if (!row) return;
    row.hidden = false;
    row.innerHTML = `
      <p class="mkt-starter-tpl-label">Template pronti:</p>
      ${STARTER_TEMPLATES.map(
        (s) =>
          `<button type="button" class="btn btn-ghost btn-sm mkt-starter-tpl-btn" data-starter-tpl="${s.type}">${escapeHtml(s.label)}</button>`
      ).join("")}`;
    row.querySelectorAll("[data-starter-tpl]").forEach((btn) => {
      btn.addEventListener("click", () => openTemplateModal(null, btn.dataset.starterTpl));
    });
  }

  function renderTemplates() {
    const list = $("marketingTemplatesList");
    const empty = $("marketingTemplatesEmpty");
    if (!list) return;
    const templates = marketingConfig?.templates || [];
    if (empty) empty.hidden = templates.length > 0;
    renderStarterTemplates();
    list.innerHTML = templates
      .map(
        (t) => `<article class="mkt-tpl-card">
        <header class="mkt-tpl-card-head">
          <h3>${escapeHtml(t.name)}</h3>
          ${t.legacy ? '<span class="mkt-pill" data-tone="archived">Legacy</span>' : ""}
        </header>
        <p class="mkt-tpl-subject">${escapeHtml(t.subject)}</p>
        <p class="muted-text">${escapeHtml(t.previewText || "Senza preheader")}</p>
        <footer class="mkt-tpl-card-foot">
          <button type="button" class="btn btn-secondary btn-sm" data-edit-tpl="${t.id}">Modifica</button>
          <button type="button" class="btn btn-ghost btn-sm mkt-btn-danger-text" data-del-tpl="${t.id}">Elimina</button>
        </footer>
      </article>`
      )
      .join("");

    list.querySelectorAll("[data-edit-tpl]").forEach((btn) => {
      btn.addEventListener("click", () => openTemplateModal(btn.dataset.editTpl));
    });
    list.querySelectorAll("[data-del-tpl]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.confirm("Eliminare il template?")) return;
        marketingConfig.templates = (marketingConfig.templates || []).filter(
          (t) => t.id !== btn.dataset.delTpl
        );
        await saveMarketing({});
      });
    });
  }

  function renderMappingForm() {
    const form = $("marketingMappingForm");
    if (!form) return;
    const profile = getPrimaryMarketingProfile();
    if (!profile) {
      form.innerHTML =
        '<p class="mkt-inline-empty">Completa la configurazione guidata per impostare il mapping colonne.</p>';
      return;
    }
    const headers = wizardDraft.headers.length ? wizardDraft.headers : [];
    form.innerHTML = COLUMN_FIELDS.map((f) =>
      buildMappingFieldHtml(f, profile.columnMapping, headers, "data-map-key")
    ).join("");
    form.querySelectorAll("[data-map-key]").forEach((sel) => {
      const val = profile.columnMapping?.[sel.dataset.mapKey];
      if (val) sel.value = val;
    });
  }

  function renderSetupPanel() {
    const profile = getPrimaryMarketingProfile();
    const syncSel = $("marketingSetupSyncProfile");
    const nameInput = $("marketingSetupProfileName");
    const profiles = (appConfig?.syncProfiles || []).filter((p) => p.excelPath);

    if (syncSel) {
      syncSel.innerHTML =
        '<option value="">— Seleziona profilo sync —</option>' +
        profiles
          .map((p) => {
            const sel = profile?.syncProfileId === p.id ? " selected" : "";
            return `<option value="${escapeHtml(p.id)}"${sel}>${escapeHtml(p.name)}</option>`;
          })
          .join("");
    }
    if (nameInput && profile) nameInput.value = profile.name || "";

    const summary = $("marketingSetupSummary");
    if (summary) {
      const mapped = profile ? Object.keys(profile.columnMapping || {}).filter((k) => profile.columnMapping[k]).length : 0;
      summary.innerHTML = `
        <li><span>Profilo sync</span><strong>${escapeHtml(profile ? getSyncProfileName(profile.syncProfileId) : "—")}</strong></li>
        <li><span>Nome marketing</span><strong>${escapeHtml(profile?.name || "—")}</strong></li>
        <li><span>Campi mappati</span><strong>${mapped} / ${COLUMN_FIELDS.length}</strong></li>
        <li><span>Negozio</span><strong>${escapeHtml(marketingConfig?.businessName || "—")}</strong></li>
        <li><span>Mittente</span><strong>${escapeHtml(marketingConfig?.senderName || "—")}</strong></li>`;
    }
  }

  function renderHistory() {
    const tbody = $("marketingHistoryBody");
    const table = $("marketingHistoryTable");
    const empty = $("marketingHistoryEmpty");
    if (!tbody) return;
    const history = marketingConfig?.sendHistory || [];
    if (empty) empty.hidden = history.length > 0;
    if (table) table.hidden = history.length === 0;
    tbody.innerHTML = history
      .slice(0, 100)
      .map((h) => {
        const auto = (marketingConfig.automations || []).find((a) => a.id === h.automationId);
        let autoName = "Automazione eliminata";
        if (h.automationId === "__test__") autoName = "Email di test";
        else if (auto) autoName = auto.name;
        else if (marketingConfig.deletedAutomationNames?.[h.automationId]) {
          autoName = `${marketingConfig.deletedAutomationNames[h.automationId]} (eliminata)`;
        }
        const status = STATUS_LABELS[h.status] || h.status;
        return `<tr data-status="${escapeHtml(h.status)}">
          <td>${escapeHtml(autoName)}</td>
          <td><strong>${escapeHtml(h.recipientEmail)}</strong>${h.recipientName ? `<br><span class="muted-text">${escapeHtml(h.recipientName)}</span>` : ""}</td>
          <td><span class="mkt-status-pill" data-status="${escapeHtml(h.status)}">${escapeHtml(status)}</span></td>
          <td>${fmtDate(h.sentAt)}</td>
          <td class="muted-text">${escapeHtml(h.reason || "—")}</td>
        </tr>`;
      })
      .join("");
  }

  async function refreshBrandLogoPreview() {
    const bp = marketingConfig?.businessProfile || {};
    const img = $("mBrandLogoPreview");
    const empty = $("mBrandLogoEmpty");
    const removeBtn = $("mBrandRemoveLogoBtn");
    if (!img) return;
    if (!bp.logoPath) {
      img.hidden = true;
      img.removeAttribute("src");
      if (empty) empty.hidden = false;
      if (removeBtn) removeBtn.hidden = true;
      return;
    }
    try {
      const dataUrl = await api()?.getMarketingLogoDataUrl?.(bp.logoPath);
      if (dataUrl) {
        img.src = dataUrl;
        img.hidden = false;
        if (empty) empty.hidden = true;
        if (removeBtn) removeBtn.hidden = false;
      }
    } catch {
      img.hidden = true;
      if (empty) empty.hidden = false;
    }
  }

  function collectBrandProfileFromForm() {
    return {
      businessName: $("mBrandBusinessName")?.value?.trim() || "",
      senderName: $("mBrandSenderName")?.value?.trim() || "",
      replyToEmail: $("mBrandReplyToEmail")?.value?.trim() || "",
      phone: $("mBrandPhone")?.value?.trim() || "",
      website: $("mBrandWebsite")?.value?.trim() || "",
      address: $("mBrandAddress")?.value?.trim() || "",
      city: $("mBrandCity")?.value?.trim() || "",
      vatNumber: $("mBrandVat")?.value?.trim() || "",
      logoPath: marketingConfig?.businessProfile?.logoPath || "",
      logoPosition: $("mBrandLogoPosition")?.value || "top_center",
      logoSize: $("mBrandLogoSize")?.value || "medium",
      primaryColor: $("mBrandPrimaryColor")?.value || "#ff7a00",
      secondaryColor: $("mBrandSecondaryColor")?.value || "#14161a",
      instagramUrl: $("mBrandInstagram")?.value?.trim() || "",
      facebookUrl: $("mBrandFacebook")?.value?.trim() || "",
      whatsappUrl: $("mBrandWhatsapp")?.value?.trim() || "",
      footerText: $("mBrandFooterText")?.value?.trim() || "",
      privacyDisclaimer: $("mBrandPrivacy")?.value?.trim() || "",
      unsubscribeText:
        $("mBrandUnsubscribe")?.value?.trim() ||
        "Ricevi questa email perché sei iscritto al programma fidelity di {{businessName}}.",
      footerDisplay: {
        phone: $("mBrandShowPhone")?.checked !== false,
        website: $("mBrandShowWebsite")?.checked !== false,
        address: $("mBrandShowAddress")?.checked !== false,
        vatNumber: !!$("mBrandShowVat")?.checked,
        social: $("mBrandShowSocial")?.checked !== false,
        privacy: $("mBrandShowPrivacy")?.checked !== false,
      },
    };
  }

  function renderBrandProfile() {
    const bp = marketingConfig?.businessProfile || {};
    if ($("mBrandBusinessName")) {
      $("mBrandBusinessName").value = bp.businessName || marketingConfig?.businessName || "";
    }
    if ($("mBrandSenderName")) {
      $("mBrandSenderName").value = bp.senderName || marketingConfig?.senderName || "";
    }
    if ($("mBrandReplyToEmail")) {
      $("mBrandReplyToEmail").value = bp.replyToEmail || marketingConfig?.replyToEmail || "";
    }
    if ($("mBrandPhone")) $("mBrandPhone").value = bp.phone || "";
    if ($("mBrandWebsite")) $("mBrandWebsite").value = bp.website || "";
    if ($("mBrandAddress")) $("mBrandAddress").value = bp.address || "";
    if ($("mBrandCity")) $("mBrandCity").value = bp.city || "";
    if ($("mBrandVat")) $("mBrandVat").value = bp.vatNumber || "";
    if ($("mBrandPrimaryColor")) $("mBrandPrimaryColor").value = bp.primaryColor || "#ff7a00";
    if ($("mBrandSecondaryColor")) $("mBrandSecondaryColor").value = bp.secondaryColor || "#14161a";
    if ($("mBrandLogoPosition")) $("mBrandLogoPosition").value = bp.logoPosition || "top_center";
    if ($("mBrandLogoSize")) $("mBrandLogoSize").value = bp.logoSize || "medium";
    if ($("mBrandInstagram")) $("mBrandInstagram").value = bp.instagramUrl || "";
    if ($("mBrandFacebook")) $("mBrandFacebook").value = bp.facebookUrl || "";
    if ($("mBrandWhatsapp")) $("mBrandWhatsapp").value = bp.whatsappUrl || "";
    if ($("mBrandFooterText")) $("mBrandFooterText").value = bp.footerText || "";
    if ($("mBrandPrivacy")) $("mBrandPrivacy").value = bp.privacyDisclaimer || "";
    if ($("mBrandUnsubscribe")) {
      $("mBrandUnsubscribe").value =
        bp.unsubscribeText ||
        "Ricevi questa email perché sei iscritto al programma fidelity di {{businessName}}.";
    }
    const fd = bp.footerDisplay || {};
    if ($("mBrandShowPhone")) $("mBrandShowPhone").checked = fd.phone !== false;
    if ($("mBrandShowWebsite")) $("mBrandShowWebsite").checked = fd.website !== false;
    if ($("mBrandShowAddress")) $("mBrandShowAddress").checked = fd.address !== false;
    if ($("mBrandShowVat")) $("mBrandShowVat").checked = !!fd.vatNumber;
    if ($("mBrandShowSocial")) $("mBrandShowSocial").checked = fd.social !== false;
    if ($("mBrandShowPrivacy")) $("mBrandShowPrivacy").checked = fd.privacy !== false;
    if ($("marketingSenderEmail")) {
      $("marketingSenderEmail").value = marketingConfig?.senderEmail || "";
    }
    if ($("mktRealSendEnabled")) {
      $("mktRealSendEnabled").checked = !!marketingConfig?.realSendEnabled;
    }
    if ($("mktMarketingApiUrl")) {
      $("mktMarketingApiUrl").value =
        marketingConfig?.marketingApiUrl || "https://aven-labs.com/api/marketing/easyfatt-sync/send";
    }
    refreshBrandLogoPreview();
  }

  function renderSenderAndConsent() {
    renderBrandProfile();
    if ($("marketingRequireConsent")) {
      $("marketingRequireConsent").checked = marketingConfig?.requireMarketingConsent !== false;
    }
    if ($("marketingConsentValues")) {
      $("marketingConsentValues").value = (marketingConfig?.validConsentValues || []).join("\n");
    }
  }

  function renderAll() {
    renderShell();
    renderOverview();
    renderAutomationPanel();
    renderTemplates();
    renderMappingForm();
    renderSetupPanel();
    renderHistory();
    renderSenderAndConsent();
    refreshStats();
  }

  /* ── Wizard ─────────────────────────────────────── */

  function updateWizardProgress() {
    document.querySelectorAll(".mkt-wizard-step-dot").forEach((dot) => {
      const step = Number(dot.dataset.step);
      dot.classList.toggle("is-active", step === wizardStep);
      dot.classList.toggle("is-done", step < wizardStep);
    });
  }

  function openWizard() {
    wizardStep = 0;
    wizardDraft = {
      syncProfileId: getPrimaryMarketingProfile()?.syncProfileId || "",
      profileName: getPrimaryMarketingProfile()?.name || "",
      columnMapping: { ...(getPrimaryMarketingProfile()?.columnMapping || {}) },
      businessName: marketingConfig?.businessName || "",
      senderName: marketingConfig?.senderName || "",
      replyToEmail: marketingConfig?.replyToEmail || "",
      headers: wizardDraft.headers || [],
    };
    setOverlayOpen($("marketingWizardOverlay"), true);
    renderWizardStep();
  }

  function closeWizard() {
    setOverlayOpen($("marketingWizardOverlay"), false);
  }

  function renderWizardStep() {
    const body = $("marketingWizardBody");
    const label = $("marketingWizardStepLabel");
    const back = $("marketingWizardBackBtn");
    const next = $("marketingWizardNextBtn");
    const finish = $("marketingWizardFinishBtn");
    if (!body) return;

    if (label) label.textContent = `Passo ${wizardStep + 1} di 4`;
    if (back) back.hidden = wizardStep === 0;
    if (next) next.hidden = wizardStep === 3;
    if (finish) finish.hidden = wizardStep !== 3;
    updateWizardProgress();

    const profiles = (appConfig?.syncProfiles || []).filter((p) => p.excelPath);

    if (wizardStep === 0) {
      body.innerHTML = `
        <p class="mkt-wizard-intro">Scegli quale sincronizzazione Excel usare come origine dati per il marketing.</p>
        <label class="mkt-field">
          <span class="field-label">Profilo sync</span>
          <select id="wizSyncProfile" class="mkt-select">
            <option value="">— Seleziona —</option>
            ${profiles.map((p) => `<option value="${escapeHtml(p.id)}"${wizardDraft.syncProfileId === p.id ? " selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
          <p class="field-hint">Il file Excel deve essere già configurato in Sincronizzazioni.</p>
        </label>
        <label class="mkt-field">
          <span class="field-label">Nome profilo marketing</span>
          <input type="text" id="wizProfileName" class="mkt-input" value="${escapeHtml(wizardDraft.profileName)}" placeholder="Es. Clienti negozio" />
          <p class="field-hint">Nome interno per riconoscere questa configurazione.</p>
        </label>
        <p id="wizStep0Error" class="mkt-form-feedback is-error" hidden></p>`;
      $("wizSyncProfile")?.addEventListener("change", (e) => {
        wizardDraft.syncProfileId = e.target.value;
        const sp = profiles.find((p) => p.id === wizardDraft.syncProfileId);
        const nameEl = $("wizProfileName");
        if (sp && nameEl && !nameEl.value.trim()) nameEl.value = sp.name;
      });
      return;
    }

    if (wizardStep === 1) {
      body.innerHTML = `
        <p class="mkt-wizard-intro">Collega le colonne del file Excel ai campi usati dalle automazioni.</p>
        <button type="button" id="wizLoadHeaders" class="btn btn-secondary btn-sm">Carica intestazioni dal file</button>
        <p id="wizHeadersStatus" class="field-hint" role="status"></p>
        <div id="wizMappingGrid" class="mkt-mapping-grid"></div>
        <p id="wizStep1Error" class="mkt-form-feedback is-error" hidden></p>`;
      $("wizLoadHeaders")?.addEventListener("click", loadWizardHeaders);
      renderWizardMapping();
      return;
    }

    if (wizardStep === 2) {
      body.innerHTML = `
        <p class="mkt-wizard-intro">Impostazioni attività e mittente per i template email.</p>
        <label class="mkt-field"><span class="field-label">Nome negozio</span><input type="text" id="wizBusiness" class="mkt-input" value="${escapeHtml(wizardDraft.businessName)}" /><p class="field-hint">Compare nelle variabili {{businessName}}.</p></label>
        <label class="mkt-field"><span class="field-label">Nome mittente</span><input type="text" id="wizSender" class="mkt-input" value="${escapeHtml(wizardDraft.senderName)}" /></label>
        <label class="mkt-field"><span class="field-label">Email risposta</span><input type="email" id="wizReply" class="mkt-input" value="${escapeHtml(wizardDraft.replyToEmail)}" /><p class="field-hint">Indirizzo per eventuali risposte dei clienti.</p></label>`;
      return;
    }

    body.innerHTML = `
      <h3 class="mkt-wizard-summary-title">Riepilogo configurazione</h3>
      <ul class="mkt-summary-list">
        <li><span>Profilo sync</span><strong id="wizSumProfile">—</strong></li>
        <li><span>Nome marketing</span><strong>${escapeHtml(wizardDraft.profileName || "—")}</strong></li>
        <li><span>Negozio</span><strong>${escapeHtml(wizardDraft.businessName || "—")}</strong></li>
        <li><span>Mittente</span><strong>${escapeHtml(wizardDraft.senderName || "—")}</strong></li>
      </ul>
      <aside class="mkt-consent-callout" role="note">
        <span class="mkt-consent-callout-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 4.3h3.4L20 12l-6.3 7.7h-3.4L4 12l6.3-7.7z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <p>Assicurati di avere il consenso dei destinatari prima di inviare comunicazioni marketing.</p>
      </aside>`;
    const sp = profiles.find((p) => p.id === wizardDraft.syncProfileId);
    const sum = $("wizSumProfile");
    if (sum) sum.textContent = sp?.name || "—";
  }

  async function loadWizardHeaders() {
    const status = $("wizHeadersStatus");
    if (!wizardDraft.syncProfileId) {
      if (status) status.textContent = "Seleziona prima un profilo sync.";
      return;
    }
    try {
      if (status) status.textContent = "Caricamento colonne…";
      const res = await api()?.previewMarketingExcel?.({ syncProfileId: wizardDraft.syncProfileId });
      wizardDraft.headers = res?.headers || [];
      if (status) {
        status.textContent = `${wizardDraft.headers.length} colonne trovate · ${res?.totalRows || 0} righe nel file`;
      }
      renderWizardMapping();
    } catch (e) {
      if (status) status.textContent = e?.message || "Impossibile leggere il file Excel.";
    }
  }

  function renderWizardMapping() {
    const grid = $("wizMappingGrid");
    if (!grid) return;
    grid.innerHTML = COLUMN_FIELDS.map((f) =>
      buildMappingFieldHtml(f, wizardDraft.columnMapping, wizardDraft.headers, "data-wiz-map")
    ).join("");
  }

  function collectWizardMapping() {
    const mapping = {};
    document.querySelectorAll("[data-wiz-map]").forEach((sel) => {
      if (sel.value) mapping[sel.dataset.wizMap] = sel.value;
    });
    wizardDraft.columnMapping = mapping;
  }

  async function finishWizard() {
    collectWizardMapping();
    const name = $("wizProfileName")?.value?.trim() || wizardDraft.profileName || "Marketing";
    const existing = getPrimaryMarketingProfile();
    const mProfile = {
      id: existing?.id || createId("mprof"),
      syncProfileId: wizardDraft.syncProfileId,
      name,
      columnMapping: wizardDraft.columnMapping,
    };

    const templates = marketingConfig?.templates?.length
      ? marketingConfig.templates
      : [
          {
            id: createId("tmpl"),
            name: "Compleanno",
            subject: "Buon compleanno {{firstName}}!",
            previewText: "Un augurio speciale da {{businessName}}",
            bodyHtml:
              "<p>Ciao {{firstName}},</p><p>ti auguriamo un felice compleanno da {{businessName}}!</p>",
            bodyText: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

    await saveMarketing({
      enabled: true,
      businessName: $("wizBusiness")?.value?.trim() || wizardDraft.businessName,
      senderName: $("wizSender")?.value?.trim() || wizardDraft.senderName,
      replyToEmail: $("wizReply")?.value?.trim() || wizardDraft.replyToEmail,
      marketingProfiles: [mProfile],
      templates,
    });
    closeWizard();
    setMarketingTab("automations");
    showAutomationCategoriesView();
    showFeedback($("marketingMappingFeedback"), "Marketing configurato con successo.", false);
  }

  function wizardNext() {
    if (wizardStep === 0) {
      wizardDraft.syncProfileId = $("wizSyncProfile")?.value || wizardDraft.syncProfileId;
      wizardDraft.profileName = $("wizProfileName")?.value?.trim() || "";
      if (!wizardDraft.syncProfileId) {
        showFeedback($("wizStep0Error"), "Seleziona un profilo sync.", true);
        return;
      }
      showFeedback($("wizStep0Error"), "", false);
    }
    if (wizardStep === 1) {
      collectWizardMapping();
      if (!wizardDraft.columnMapping?.email) {
        showFeedback($("wizStep1Error"), "Mappa almeno la colonna Email per continuare.", true);
        return;
      }
      showFeedback($("wizStep1Error"), "", false);
    }
    if (wizardStep === 2) {
      wizardDraft.businessName = $("wizBusiness")?.value?.trim() || "";
      wizardDraft.senderName = $("wizSender")?.value?.trim() || "";
      wizardDraft.replyToEmail = $("wizReply")?.value?.trim() || "";
    }
    wizardStep += 1;
    renderWizardStep();
  }

  function wizardBack() {
    if (wizardStep > 0) {
      wizardStep -= 1;
      renderWizardStep();
    }
  }

  /* ── Automation modal ─────────────────────────── */

  const WIZARD_STEP_LABELS = [
    "Tipo",
    "Informazioni",
    "Trigger",
    "Consenso",
    "Destinatari",
    "Simulazione",
    "Attivazione",
  ];

  function renderAutomationDraftBanner() {
    const banner = $("marketingAutoDraftBanner");
    const draft = marketingConfig?.automationWizardDraft;
    if (!banner) return;
    if (!draft?.data) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    const desc = $("marketingAutoDraftBannerDesc");
    if (desc) {
      const name = draft.data.name?.trim();
      const stepLabel = WIZARD_STEP_LABELS?.[draft.step] || `passo ${draft.step + 1}`;
      desc.textContent = name
        ? `«${name}» — ${stepLabel}`
        : `Automazione non completata (${stepLabel}).`;
    }
  }

  function openAutomationModal(editId, typePreset) {
    const preset = typePreset || createAutomationTypePreset || null;
    window.EasyfattAutomationWizard?.open?.(editId || null, preset);
    createAutomationTypePreset = null;
  }

  function onAutomationWizardComplete(payload) {
    const catId =
      automationListCategoryId ||
      AUTO_CATEGORIES.find((c) => c.types.includes(payload.type))?.id;
    if (catId) {
      setMarketingTab("automations");
      openAutomationCategory(catId);
    }
    renderAutomationDraftBanner();
    renderAll();
  }

  /* ── Template editor (visual) ─────────────────── */

  function openTemplateModal(editId, starterType) {
    const t = editId ? (marketingConfig.templates || []).find((x) => x.id === editId) : null;
    window.EasyfattTemplateEditor?.open?.(t, { starterType: starterType || null });
  }

  function closeTemplateModal() {
    window.EasyfattTemplateEditor?.close?.();
  }

  /* ── Recipients modal ─────────────────────────── */

  async function openRecipientsModal(automationId) {
    recipientsAutomationId = automationId;
    const overlay = $("marketingRecipientsOverlay");
    const summary = $("marketingRecipientsSummary");
    const tbody = $("marketingRecipientsBody");
    const empty = $("marketingRecipientsEmpty");
    const auto = (marketingConfig.automations || []).find((a) => a.id === automationId);
    if ($("marketingRecipientsSubtitle")) {
      $("marketingRecipientsSubtitle").textContent = auto?.name || "";
    }
    if (summary) summary.innerHTML = "";
    if (tbody) tbody.innerHTML = "";
    if (empty) empty.hidden = true;
    setOverlayOpen(overlay, true);
    updateRecipientsModalActions();
    try {
      const data = await api()?.getAutomationRecipients?.(automationId);
      if (summary && data?.summary) {
        const s = data.summary;
        summary.innerHTML = `
          <li class="mkt-recipient-stat"><span class="stat-label">Totali</span><span class="stat-value">${s.total}</span></li>
          <li class="mkt-recipient-stat" data-tone="success"><span class="stat-label">Validi</span><span class="stat-value">${s.valid}</span></li>
          <li class="mkt-recipient-stat"><span class="stat-label">Senza email</span><span class="stat-value">${s.withoutEmail}</span></li>
          <li class="mkt-recipient-stat"><span class="stat-label">Senza consenso</span><span class="stat-value">${s.withoutConsent}</span></li>
          <li class="mkt-recipient-stat"><span class="stat-label">Già contattati</span><span class="stat-value">${s.alreadyContacted ?? 0}</span></li>
          <li class="mkt-recipient-stat"><span class="stat-label">Saltati</span><span class="stat-value">${s.skipped}</span></li>`;
      }
      const rows = [
        ...(data?.recipients || []).map(
          (r) => `<tr class="mkt-row-valid">
            <td>${escapeHtml(r.name || "—")}</td>
            <td>${escapeHtml(r.email)}</td>
            <td><span class="mkt-status-pill" data-status="simulated">Valido</span></td>
            <td class="muted-text">Pronto per simulazione</td>
          </tr>`
        ),
        ...(data?.skipped || []).map(
          (s) => `<tr class="mkt-row-skipped">
            <td>${escapeHtml(s.name || "—")}</td>
            <td>${escapeHtml(s.email)}</td>
            <td><span class="mkt-status-pill" data-status="skipped">Saltato</span></td>
            <td class="muted-text">${escapeHtml(s.reason)}</td>
          </tr>`
        ),
      ];
      if (tbody) tbody.innerHTML = rows.join("");
      const noRows = rows.length === 0;
      if (empty) empty.hidden = !noRows;
    } catch (e) {
      if (summary) {
        summary.innerHTML = `<li class="mkt-recipient-stat"><span class="stat-label">Errore</span><span class="stat-value">${escapeHtml(e?.message || "Caricamento fallito")}</span></li>`;
      }
    }
  }

  function closeRecipientsModal() {
    setOverlayOpen($("marketingRecipientsOverlay"), false);
  }

  /* ── Real send & simulate ─────────────────────── */

  function updateRecipientsModalActions() {
    const real = !!marketingConfig?.realSendEnabled;
    const sendBtn = $("marketingRecipientsSendRealBtn");
    const dryBtn = $("marketingRecipientsDryRunBtn");
    const simBtn = $("marketingRecipientsSimulateBtn");
    const note = $("marketingRecipientsFootNote");
    if (sendBtn) sendBtn.hidden = !real;
    if (dryBtn) dryBtn.hidden = false;
    if (simBtn) simBtn.hidden = false;
    if (note) {
      note.textContent = real
        ? "Puoi simulare in locale, testare il backend (dry-run) o inviare email reali."
        : "La simulazione registra gli esiti nello storico locale.";
    }
  }

  async function openSendConfirmModal(automationId) {
    if (!marketingConfig?.realSendEnabled) {
      showToast("Abilita l'invio reale nelle impostazioni marketing.", { info: true });
      return;
    }
    sendConfirmAutomationId = automationId;
    const auto = findAutomation(automationId);
    const tpl = (marketingConfig.templates || []).find((t) => t.id === auto?.templateId);
    const bp = marketingConfig.businessProfile || {};
    const summary = $("marketingSendConfirmSummary");
    const consent = $("marketingSendConsentCheck");
    const results = $("marketingSendConfirmResults");
    if (consent) consent.checked = false;
    if (results) {
      results.hidden = true;
      results.innerHTML = "";
    }

    let recipientCount = "—";
    try {
      const data = await api()?.getAutomationRecipients?.(automationId);
      recipientCount = String(data?.summary?.valid ?? 0);
    } catch (_) {
      /* ignore */
    }

    if (summary) {
      summary.innerHTML = `
        <li><span>Automazione</span><strong>${escapeHtml(auto?.name || "—")}</strong></li>
        <li><span>Destinatari idonei</span><strong>${escapeHtml(recipientCount)} (max 50 per invio)</strong></li>
        <li><span>Template</span><strong>${escapeHtml(tpl?.name || "—")}</strong></li>
        <li><span>Mittente</span><strong>${escapeHtml(bp.senderName || marketingConfig.senderName || "—")}</strong></li>
        <li><span>Reply-to</span><strong>${escapeHtml(bp.replyToEmail || marketingConfig.replyToEmail || "—")}</strong></li>`;
    }

    setOverlayOpen($("marketingSendConfirmOverlay"), true);
  }

  function closeSendConfirmModal() {
    setOverlayOpen($("marketingSendConfirmOverlay"), false);
    sendConfirmAutomationId = null;
  }

  function renderSendResults(res) {
    const el = $("marketingSendConfirmResults");
    if (!el) return;
    el.hidden = false;
    const rows = (res?.results || [])
      .map(
        (r) =>
          `<tr data-status="${escapeHtml(r.status)}"><td>${escapeHtml(r.email)}</td><td><span class="mkt-status-pill" data-status="${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></td><td class="muted-text">${escapeHtml(r.reason || "—")}</td></tr>`
      )
      .join("");
    el.innerHTML = `
      <p class="mkt-send-results-msg">${escapeHtml(res?.message || "")}</p>
      <div class="table-wrap mkt-recipients-table-wrap">
        <table class="data-table"><thead><tr><th>Email</th><th>Esito</th><th>Dettaglio</th></tr></thead>
        <tbody>${rows || "<tr><td colspan=\"3\">Nessun risultato</td></tr>"}</tbody></table>
      </div>`;
  }

  async function runRealSend(automationId) {
    if (!automationId) return;
    const consent = $("marketingSendConsentCheck");
    if (!consent?.checked) {
      showToast("Conferma il consenso marketing prima di inviare.", { error: true });
      return;
    }
    const btn = $("marketingSendConfirmRunBtn");
    if (btn) btn.disabled = true;
    try {
      const res = await api()?.sendMarketingAutomation?.({
        automationId,
        consentConfirmed: true,
      });
      renderSendResults(res);
      showToast(res?.message || "Invio completato.");
      closeRecipientsModal();
      await loadData();
      renderAll();
      setMarketingTab("history");
    } catch (e) {
      showToast(e?.message || "Errore durante l'invio.", { error: true });
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function runDryRun(automationId) {
    if (!automationId) return;
    try {
      const res = await api()?.dryRunMarketingAutomation?.(automationId);
      showToast(res?.message || "Dry-run completato.");
      closeRecipientsModal();
      await loadData();
      renderAll();
      setMarketingTab("history");
    } catch (e) {
      showToast(e?.message || "Errore dry-run.", { error: true });
    }
  }

  async function runSimulation(automationId) {
    if (!automationId) return;
    try {
      const res = await api()?.simulateMarketingAutomation?.(automationId);
      showToast(res?.message || "Simulazione completata.");
      closeRecipientsModal();
      closeSimulatePicker();
      await loadData();
      renderAll();
      setMarketingTab("history");
    } catch (e) {
      showToast(e?.message || "Errore durante la simulazione.", { error: true });
    }
  }

  function openSimulatePicker() {
    if (!marketingConfig?.enabled) {
      openWizard();
      return;
    }
    const autos = (marketingConfig.automations || []).filter(
      (a) => a.enabled && !a.archived
    );
    if (!autos.length) {
      showToast("Crea almeno un'automazione attiva prima di simulare.", { info: true });
      setMarketingTab("automations");
      return;
    }
    if (autos.length === 1) {
      runSimulation(autos[0].id);
      return;
    }
    const sel = $("marketingSimulateSelect");
    if (sel) {
      sel.innerHTML = autos.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
    }
    setOverlayOpen($("marketingSimulateOverlay"), true);
  }

  function closeSimulatePicker() {
    setOverlayOpen($("marketingSimulateOverlay"), false);
  }

  async function reloadHeadersForSetup() {
    const profile = getPrimaryMarketingProfile();
    const syncId = $("marketingSetupSyncProfile")?.value || profile?.syncProfileId;
    const status = $("marketingHeadersStatus");
    if (!syncId) {
      if (status) status.textContent = "Seleziona un profilo sync.";
      return;
    }
    try {
      if (status) status.textContent = "Caricamento colonne…";
      const res = await api()?.previewMarketingExcel?.({ syncProfileId: syncId });
      wizardDraft.headers = res?.headers || [];
      if (status) {
        status.textContent = `${wizardDraft.headers.length} colonne · ${res?.totalRows || 0} righe`;
      }
      renderMappingForm();
    } catch (e) {
      if (status) status.textContent = e?.message || "Errore lettura Excel.";
    }
  }

  async function bindEvents() {
    document.querySelectorAll(".mkt-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMarketingTab(btn.dataset.marketingTab);
        if (btn.dataset.marketingTab === "automations") renderAutomationPanel();
      });
    });

    const setupHandlers = [
      ["marketingSetupBtn", openWizard],
      ["marketingEmptySetupBtn", openWizard],
      ["marketingReopenWizardBtn", openWizard],
    ];
    setupHandlers.forEach(([id, fn]) => $(id)?.addEventListener("click", fn));

    $("marketingNewAutomationBtn")?.addEventListener("click", () => {
      if (!marketingConfig?.enabled) {
        openWizard();
        return;
      }
      openAutomationModal();
    });
    $("marketingAutomationBackBtn")?.addEventListener("click", showAutomationCategoriesView);
    document.querySelectorAll(".mkt-filter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        automationFilter = chip.dataset.autoFilter || "all";
        document.querySelectorAll(".mkt-filter-chip").forEach((c) => {
          c.classList.toggle("is-active", c === chip);
        });
        renderAutomationList();
      });
    });
    $("marketingAddAutomationBtn")?.addEventListener("click", () => {
      const cat = getCategoryById(automationListCategoryId);
      openAutomationModal(null, cat?.types?.[0]);
    });
    $("marketingFirstAutomationBtn")?.addEventListener("click", () => {
      const cat = getCategoryById(automationListCategoryId);
      openAutomationModal(null, cat?.types?.[0]);
    });
    $("marketingAddTemplateBtn")?.addEventListener("click", () => openTemplateModal());
    $("marketingFirstTemplateBtn")?.addEventListener("click", () => openTemplateModal());
    $("marketingSimulateHeroBtn")?.addEventListener("click", openSimulatePicker);

    $("marketingWizardCloseBtn")?.addEventListener("click", closeWizard);
    $("marketingWizardBackBtn")?.addEventListener("click", wizardBack);
    $("marketingWizardNextBtn")?.addEventListener("click", wizardNext);
    $("marketingWizardFinishBtn")?.addEventListener("click", finishWizard);

    $("marketingTemplateCloseBtn")?.addEventListener("click", closeTemplateModal);

    $("marketingSaveBrandBtn")?.addEventListener("click", async () => {
      const businessProfile = collectBrandProfileFromForm();
      const realSendEnabled = !!$("mktRealSendEnabled")?.checked;
      const marketingApiUrl = $("mktMarketingApiUrl")?.value?.trim() || "";
      await saveMarketing({
        businessProfile,
        businessName: businessProfile.businessName,
        senderName: businessProfile.senderName,
        replyToEmail: businessProfile.replyToEmail,
        senderEmail: $("marketingSenderEmail")?.value?.trim() || "",
        realSendEnabled,
        marketingApiUrl: marketingApiUrl || undefined,
      });
      showFeedback($("marketingBrandFeedback"), "Impostazioni salvate.", false);
      updateSimBanner();
    });

    $("mBrandPickLogoBtn")?.addEventListener("click", async () => {
      try {
        const res = await api()?.pickMarketingLogo?.();
        if (res?.canceled) return;
        if (!res?.logoPath) {
          showToast("Logo non caricato.", { error: true });
          return;
        }
        const businessProfile = {
          ...collectBrandProfileFromForm(),
          logoPath: res.logoPath,
        };
        await saveMarketing({ businessProfile });
        showToast("Logo caricato.");
      } catch (e) {
        showToast(e?.message || "Errore caricamento logo.", { error: true });
      }
    });

    $("mBrandRemoveLogoBtn")?.addEventListener("click", async () => {
      const businessProfile = { ...collectBrandProfileFromForm(), logoPath: "" };
      await saveMarketing({ businessProfile });
      showToast("Logo rimosso.", { info: true });
    });

    $("marketingRecipientsCloseBtn")?.addEventListener("click", closeRecipientsModal);
    $("marketingRecipientsSimulateBtn")?.addEventListener("click", () => {
      if (recipientsAutomationId) runSimulation(recipientsAutomationId);
    });
    $("marketingRecipientsSendRealBtn")?.addEventListener("click", () => {
      if (recipientsAutomationId) {
        closeRecipientsModal();
        openSendConfirmModal(recipientsAutomationId);
      }
    });
    $("marketingRecipientsDryRunBtn")?.addEventListener("click", () => {
      if (recipientsAutomationId) runDryRun(recipientsAutomationId);
    });
    $("marketingSendConfirmCloseBtn")?.addEventListener("click", closeSendConfirmModal);
    $("marketingSendConfirmCancelBtn")?.addEventListener("click", closeSendConfirmModal);
    $("marketingSendConfirmRunBtn")?.addEventListener("click", () => {
      if (sendConfirmAutomationId) runRealSend(sendConfirmAutomationId);
    });
    $("marketingRecipientsTestBtn")?.addEventListener("click", async () => {
      const auto = (marketingConfig.automations || []).find((a) => a.id === recipientsAutomationId);
      const tplId = auto?.templateId || marketingConfig?.templates?.[0]?.id;
      const email = window.prompt("Email di test (simulazione):", marketingConfig?.replyToEmail || "");
      if (!email || !tplId) return;
      try {
        const res = await api()?.simulateMarketingTestEmail?.({ templateId: tplId, testEmail: email });
        showToast(res?.message || "Test simulato.");
        await loadData();
        renderAll();
      } catch (e) {
        showToast(e?.message || "Errore.", { error: true });
      }
    });

    $("marketingSimulateCloseBtn")?.addEventListener("click", closeSimulatePicker);
    $("marketingSimulateRunBtn")?.addEventListener("click", () => {
      runSimulation($("marketingSimulateSelect")?.value);
    });

    $("marketingSaveConsentBtn")?.addEventListener("click", async () => {
      const lines = ($("marketingConsentValues")?.value || "")
        .split("\n")
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean);
      await saveMarketing({
        requireMarketingConsent: $("marketingRequireConsent")?.checked !== false,
        validConsentValues: lines.length ? lines : undefined,
      });
      showFeedback($("marketingConsentFeedback"), "Impostazioni consenso salvate.", false);
    });

    $("marketingSaveMappingBtn")?.addEventListener("click", async () => {
      const profile = getPrimaryMarketingProfile();
      if (!profile) {
        showFeedback($("marketingMappingFeedback"), "Configura prima il marketing.", true);
        return;
      }
      const mapping = {};
      document.querySelectorAll("[data-map-key]").forEach((sel) => {
        if (sel.value) mapping[sel.dataset.mapKey] = sel.value;
      });
      if (!mapping.email) {
        showFeedback($("marketingMappingFeedback"), "La colonna Email è obbligatoria.", true);
        return;
      }
      profile.columnMapping = mapping;
      await saveMarketing({
        marketingProfiles: (marketingConfig.marketingProfiles || []).map((p) =>
          p.id === profile.id ? profile : p
        ),
      });
      showFeedback($("marketingMappingFeedback"), "Mapping salvato.", false);
    });

    $("marketingReloadHeadersBtn")?.addEventListener("click", reloadHeadersForSetup);
    $("marketingSetupSyncProfile")?.addEventListener("change", async () => {
      const profile = getPrimaryMarketingProfile();
      const syncId = $("marketingSetupSyncProfile")?.value;
      if (profile && syncId) {
        profile.syncProfileId = syncId;
        profile.name = $("marketingSetupProfileName")?.value?.trim() || profile.name;
        await saveMarketing({
          marketingProfiles: (marketingConfig.marketingProfiles || []).map((p) =>
            p.id === profile.id ? profile : p
          ),
        });
      }
      reloadHeadersForSetup();
    });

    $("marketingClearHistoryBtn")?.addEventListener("click", async () => {
      const msg =
        "Cancellare tutto lo storico invii marketing?\n\nQuesta azione non può essere annullata. Le automazioni e le altre impostazioni non verranno modificate.";
      if (!window.confirm(msg)) return;
      await api()?.clearMarketingHistory?.();
      await loadData();
      renderAll();
      showToast("Storico marketing cancellato.");
    });

    document.querySelectorAll(".mkt-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.hidden = true;
          document.body.classList.remove("mkt-modal-open");
        }
      });
    });

    document.addEventListener("easyfatt:view-changed", async (e) => {
      if (e.detail?.view === "marketing") {
        await loadData();
        const profile = getPrimaryMarketingProfile();
        if (profile?.syncProfileId) {
          try {
            const res = await api()?.previewMarketingExcel?.({
              syncProfileId: profile.syncProfileId,
            });
            wizardDraft.headers = res?.headers || [];
          } catch (_) {
            wizardDraft.headers = [];
          }
        }
        renderAll();
      }
    });

    api()?.onMarketingUpdated?.((cfg) => {
      marketingConfig = cfg;
      renderAll();
    });
  }

  async function init() {
    if (!document.querySelector('[data-view="marketing"]')) return;
    await loadData();
    window.EasyfattAutomationWizard?.init?.({
      getMarketingConfig: () => marketingConfig,
      getAppConfig: () => appConfig,
      saveMarketing,
      showToast,
      openMarketingSetup: openWizard,
      renderDraftBanner: renderAutomationDraftBanner,
      onComplete: onAutomationWizardComplete,
    });
    window.EasyfattTemplateEditor?.init?.({
      getMarketingConfig: () => marketingConfig,
      saveMarketing,
      showToast,
      onSaved: () => renderTemplates(),
    });
    await bindEvents();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.EasyfattMarketingUI = { loadData, renderAll, openWizard };
})();
