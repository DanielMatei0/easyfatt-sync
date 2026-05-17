/* global window, document */
(function initMarketingTemplateEditor() {
  "use strict";

  const api = () => window.easyfattSync;

  const VARIABLES = [
    { token: "{{firstName}}", label: "Nome", hint: "Usa {{firstName}} per personalizzare il nome del cliente." },
    { token: "{{lastName}}", label: "Cognome" },
    { token: "{{points}}", label: "Punti" },
    { token: "{{businessName}}", label: "Negozio" },
    { token: "{{fidelityCardNumber}}", label: "N° fidelity" },
    { token: "{{birthday}}", label: "Compleanno" },
    { token: "{{reward}}", label: "Premio" },
  ];

  const BLOCK_TYPES = [
    { type: "heading", label: "Titolo", icon: "H" },
    { type: "text", label: "Testo", icon: "¶" },
    { type: "button", label: "Bottone", icon: "▢" },
    { type: "reward_box", label: "Box premio", icon: "★" },
    { type: "image", label: "Immagine", icon: "🖼" },
    { type: "divider", label: "Separatore", icon: "—" },
    { type: "footer", label: "Footer", icon: "⌁" },
  ];

  let deps = {};
  let draft = null;
  let activeField = null;
  let previewMode = "desktop";
  let logoDataUrl = "";
  let openOptions = {};
  let addBlockMenuBound = false;

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
    return deps.getMarketingConfig?.() || {};
  }

  function defaultDraft(existing) {
    const t = existing || {};
    return {
      id: t.id || createId("tmpl"),
      name: t.name || "",
      subject: t.subject || "",
      previewText: t.previewText || "",
      blocks: Array.isArray(t.blocks) ? JSON.parse(JSON.stringify(t.blocks)) : [],
      legacy: !!t.legacy,
      starterType: t.starterType || null,
      createdAt: t.createdAt || new Date().toISOString(),
    };
  }

  function sortBlocks(blocks) {
    return [...(blocks || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function defaultBlockContent(type) {
    switch (type) {
      case "heading":
        return { text: "Titolo email" };
      case "text":
        return { text: "Scrivi qui il messaggio per i tuoi clienti.\n\nUsa {{firstName}} per personalizzare il saluto." };
      case "button":
        return { label: "Scopri di più", url: "https://" };
      case "reward_box":
        return { title: "Il tuo premio", text: "{{reward}}" };
      case "image":
        return { alt: "", imageDataUrl: "" };
      case "footer":
        return {};
      default:
        return {};
    }
  }

  function addBlock(type) {
    const maxOrder = draft.blocks.reduce((m, b) => Math.max(m, b.order ?? 0), -1);
    draft.blocks.push({
      id: createId("blk"),
      type,
      order: maxOrder + 1,
      content: defaultBlockContent(type),
    });
    renderEditor();
    schedulePreview();
  }

  function moveBlock(id, dir) {
    const sorted = sortBlocks(draft.blocks);
    const idx = sorted.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx].order ?? idx;
    const b = sorted[swap].order ?? swap;
    sorted[idx].order = b;
    sorted[swap].order = a;
    renderEditor();
    schedulePreview();
  }

  function removeBlock(id) {
    draft.blocks = draft.blocks.filter((b) => b.id !== id);
    renderEditor();
    schedulePreview();
  }

  function updateBlockContent(id, key, value) {
    const block = draft.blocks.find((b) => b.id === id);
    if (!block) return;
    if (!block.content) block.content = {};
    block.content[key] = value;
    schedulePreview();
  }

  function trackActiveField(el) {
    if (!el) return;
    el.addEventListener("focus", () => {
      activeField = el;
    });
  }

  function insertVariable(token) {
    if (!activeField) {
      deps.showToast?.("Seleziona prima un campo di testo.", { info: true });
      return;
    }
    const el = activeField;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.value = el.value.slice(0, start) + token + el.value.slice(end);
    el.focus();
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  let previewTimer = null;
  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 200);
  }

  async function loadLogoPreview() {
    const bp = getConfig().businessProfile || {};
    const path = bp.logoPath;
    if (!path) {
      logoDataUrl = "";
      return;
    }
    try {
      logoDataUrl = (await api()?.getMarketingLogoDataUrl?.(path)) || "";
    } catch {
      logoDataUrl = "";
    }
  }

  async function refreshPreview() {
    const frame = $("mTplEditorPreviewFrame");
    const subEl = $("mTplEditorPreviewSubject");
    if (!frame) return;
    try {
      const rendered = await api()?.renderMarketingEmailPreview?.({
        template: {
          ...draft,
          subject: $("mTplEdSubject")?.value ?? draft.subject,
          previewText: $("mTplEdPreview")?.value ?? draft.previewText,
          blocks: draft.blocks,
        },
        logoPath: getConfig().businessProfile?.logoPath,
      });
      if (subEl) subEl.textContent = rendered?.subject || "—";
      const w = previewMode === "mobile" ? "375px" : "100%";
      frame.innerHTML = `<div class="mkt-email-preview-inner" style="max-width:${w};margin:0 auto;">${rendered?.bodyHtml || ""}</div>`;
    } catch (e) {
      frame.innerHTML = `<p class="muted-text">${escapeHtml(e?.message || "Anteprima non disponibile")}</p>`;
    }
  }

  function blockEditorHtml(block, index, total) {
    const c = block.content || {};
    const typeMeta = BLOCK_TYPES.find((t) => t.type === block.type) || { label: block.type };
    let fields = "";

    if (block.type === "heading" || block.type === "text") {
      const rows = block.type === "text" ? 5 : 2;
      fields = `<label class="mkt-field"><span class="field-label">${block.type === "heading" ? "Titolo" : "Testo"}</span>
        <textarea class="mkt-textarea mkt-tpl-block-field" data-block-id="${block.id}" data-key="text" rows="${rows}">${escapeHtml(c.text || "")}</textarea></label>`;
    } else if (block.type === "button") {
      fields = `<label class="mkt-field"><span class="field-label">Testo bottone</span>
        <input type="text" class="mkt-input mkt-tpl-block-field" data-block-id="${block.id}" data-key="label" value="${escapeHtml(c.label || "")}" /></label>
        <label class="mkt-field"><span class="field-label">Link bottone</span>
        <input type="url" class="mkt-input mkt-tpl-block-field" data-block-id="${block.id}" data-key="url" value="${escapeHtml(c.url || "")}" placeholder="https://..." /></label>`;
    } else if (block.type === "reward_box") {
      fields = `<label class="mkt-field"><span class="field-label">Titolo premio</span>
        <input type="text" class="mkt-input mkt-tpl-block-field" data-block-id="${block.id}" data-key="title" value="${escapeHtml(c.title || "")}" /></label>
        <label class="mkt-field"><span class="field-label">Descrizione</span>
        <textarea class="mkt-textarea mkt-tpl-block-field" data-block-id="${block.id}" data-key="text" rows="2">${escapeHtml(c.text || "")}</textarea></label>`;
    } else if (block.type === "image") {
      fields = `<p class="field-hint">Immagine opzionale (URL o carica file locale).</p>
        <label class="mkt-field"><span class="field-label">URL immagine</span>
        <input type="text" class="mkt-input mkt-tpl-block-field" data-block-id="${block.id}" data-key="imageUrl" value="${escapeHtml(c.imageUrl || "")}" /></label>
        <label class="mkt-field"><span class="field-label">Testo alternativo</span>
        <input type="text" class="mkt-input mkt-tpl-block-field" data-block-id="${block.id}" data-key="alt" value="${escapeHtml(c.alt || "")}" /></label>`;
    } else if (block.type === "footer") {
      fields = `<p class="muted-text">Il footer usa i dati azienda e le opzioni in «Dati azienda e brand».</p>`;
    } else if (block.type === "divider") {
      fields = `<p class="muted-text">Linea separatrice tra le sezioni.</p>`;
    }

    return `<article class="mkt-tpl-block-card" data-block-type="${block.type}">
      <header class="mkt-tpl-block-head">
        <span class="mkt-tpl-block-type-badge">${escapeHtml(typeMeta.label)}</span>
        <div class="mkt-tpl-block-actions">
          <button type="button" class="btn btn-ghost btn-sm mkt-tpl-move" data-id="${block.id}" data-dir="-1"${index === 0 ? " disabled" : ""} aria-label="Su">↑</button>
          <button type="button" class="btn btn-ghost btn-sm mkt-tpl-move" data-id="${block.id}" data-dir="1"${index >= total - 1 ? " disabled" : ""} aria-label="Giù">↓</button>
          <button type="button" class="btn btn-ghost btn-sm mkt-tpl-remove" data-id="${block.id}" aria-label="Elimina">✕</button>
        </div>
      </header>
      <div class="mkt-tpl-block-body">${fields}</div>
    </article>`;
  }

  function renderEditor() {
    const list = $("mTplBlocksList");
    const legacy = $("mTplLegacyNotice");
    if (legacy) legacy.hidden = !draft.legacy;
    if ($("mTplEdName")) $("mTplEdName").value = draft.name;
    if ($("mTplEdSubject")) $("mTplEdSubject").value = draft.subject;
    if ($("mTplEdPreview")) $("mTplEdPreview").value = draft.previewText;

    if (!list) return;
    const sorted = sortBlocks(draft.blocks);
    if (!sorted.length) {
      list.innerHTML = `<p class="mkt-inline-empty">Nessun blocco. Aggiungi contenuti con «Aggiungi blocco».</p>`;
    } else {
      list.innerHTML = sorted
        .map((b, i) => blockEditorHtml(b, i, sorted.length))
        .join("");
    }

    list.querySelectorAll(".mkt-tpl-block-field").forEach((el) => {
      trackActiveField(el);
      el.addEventListener("input", () => {
        updateBlockContent(el.dataset.blockId, el.dataset.key, el.value);
      });
    });
    list.querySelectorAll(".mkt-tpl-move").forEach((btn) => {
      btn.addEventListener("click", () => moveBlock(btn.dataset.id, Number(btn.dataset.dir)));
    });
    list.querySelectorAll(".mkt-tpl-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (window.confirm("Eliminare questo blocco?")) removeBlock(btn.dataset.id);
      });
    });

    ["mTplEdName", "mTplEdSubject", "mTplEdPreview"].forEach((id) => {
      const el = $(id);
      if (el) trackActiveField(el);
    });
  }

  function bindVariableChips() {
    const wrap = $("mTplEdVariables");
    if (!wrap) return;
    wrap.innerHTML = VARIABLES.map(
      (v) =>
        `<button type="button" class="mkt-var-chip" data-token="${escapeHtml(v.token)}" title="${escapeHtml(v.hint || v.label)}">${escapeHtml(v.token)}</button>`
    ).join("");
    wrap.querySelectorAll(".mkt-var-chip").forEach((btn) => {
      btn.addEventListener("click", () => insertVariable(btn.dataset.token));
    });
  }

  function closeAddBlockMenu() {
    const menu = $("mTplAddBlockMenu");
    if (menu) menu.hidden = true;
  }

  function toggleAddBlockMenu() {
    const menu = $("mTplAddBlockMenu");
    if (!menu) return;
    menu.hidden = !menu.hidden;
  }

  function bindAddBlockMenu() {
    if (addBlockMenuBound) return;
    addBlockMenuBound = true;

    const toolbar = document.querySelector(".mkt-tpl-blocks-toolbar");
    const btn = $("mTplAddBlockBtn");
    const menu = $("mTplAddBlockMenu");

    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleAddBlockMenu();
    });

    menu?.querySelectorAll("[data-block-type]").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        addBlock(item.dataset.blockType);
        closeAddBlockMenu();
      });
    });

    document.addEventListener("click", (e) => {
      if (!menu || menu.hidden) return;
      if (toolbar?.contains(e.target)) return;
      closeAddBlockMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAddBlockMenu();
    });
  }

  async function saveTemplate() {
    draft.name = $("mTplEdName")?.value?.trim() || "Template";
    draft.subject = $("mTplEdSubject")?.value?.trim() || "";
    draft.previewText = $("mTplEdPreview")?.value?.trim() || "";
    if (!draft.subject) {
      deps.showToast?.("Inserisci l'oggetto dell'email.", { error: true });
      return;
    }
    if (!draft.blocks.length) {
      deps.showToast?.("Aggiungi almeno un blocco al template.", { error: true });
      return;
    }
    try {
      const compiled = await api()?.compileMarketingTemplate?.({
        template: draft,
        logoPath: getConfig().businessProfile?.logoPath,
      });
      const payload = {
        ...draft,
        bodyHtml: compiled?.bodyHtml || "",
        bodyText: compiled?.bodyText || "",
        legacy: false,
        updatedAt: new Date().toISOString(),
      };
      const cfg = getConfig();
      let templates = [...(cfg.templates || [])];
      const idx = templates.findIndex((t) => t.id === payload.id);
      if (idx >= 0) templates[idx] = { ...templates[idx], ...payload };
      else templates.push(payload);
      await deps.saveMarketing?.({ templates });
      deps.showToast?.("Template salvato.");
      close();
      deps.onSaved?.(payload);
      openOptions.onSaved?.(payload);
    } catch (e) {
      deps.showToast?.(e?.message || "Errore salvataggio.", { error: true });
    }
  }

  async function open(existing, options = {}) {
    openOptions = options || {};
    draft = defaultDraft(existing);
    if (!draft.blocks.length && openOptions.starterType) {
      createStarterBlocks(draft, openOptions.starterType);
    }
    previewMode = "desktop";
    await loadLogoPreview();
    const overlay = $("marketingTemplateOverlay");
    if ($("marketingTemplateModalTitle")) {
      $("marketingTemplateModalTitle").textContent = existing?.id
        ? "Modifica template"
        : "Nuovo template";
    }
    if ($("marketingTemplateModalSub")) {
      $("marketingTemplateModalSub").textContent =
        "Componi l'email con blocchi semplici — nessun codice HTML.";
    }
    overlay.hidden = false;
    document.body.classList.add("mkt-modal-open");
    closeAddBlockMenu();
    renderEditor();
    bindVariableChips();
    await refreshPreview();
  }

  function close() {
    closeAddBlockMenu();
    const overlay = $("marketingTemplateOverlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("mkt-modal-open");
    draft = null;
  }

  function createStarterBlocks(draftObj, type) {
    const starters = {
      birthday: [
        { type: "heading", content: { text: "Buon compleanno {{firstName}}! 🎂" } },
        {
          type: "text",
          content: {
            text: "Ciao {{firstName}},\n\nda tutto il team di {{businessName}} ti auguriamo un felice compleanno!",
          },
        },
        { type: "reward_box", content: { title: "Un pensiero per te", text: "{{reward}}" } },
        { type: "footer", content: {} },
      ],
      points_threshold: [
        { type: "heading", content: { text: "Hai raggiunto {{points}} punti!" } },
        {
          type: "text",
          content: {
            text: "Ciao {{firstName}}, complimenti per i tuoi {{points}} punti fidelity!",
          },
        },
        { type: "reward_box", content: { title: "Il tuo premio", text: "{{reward}}" } },
        { type: "footer", content: {} },
      ],
      new_fidelity: [
        { type: "heading", content: { text: "Benvenuto in {{businessName}}" } },
        {
          type: "text",
          content: {
            text: "Ciao {{firstName}}, la tua card {{fidelityCardNumber}} è attiva!",
          },
        },
        { type: "footer", content: {} },
      ],
      inactive_customer: [
        { type: "heading", content: { text: "Ci manchi, {{firstName}}!" } },
        {
          type: "text",
          content: { text: "Torna a trovarci da {{businessName}} — abbiamo novità per te." },
        },
        { type: "footer", content: {} },
      ],
    };
    const defs = starters[type] || starters.birthday;
    draftObj.blocks = defs.map((d, i) => ({
      id: createId("blk"),
      type: d.type,
      order: i,
      content: { ...d.content },
    }));
  }

  function init(dependencies) {
    deps = dependencies || {};
    bindAddBlockMenu();
    $("marketingTemplateCloseBtn")?.addEventListener("click", close);
    $("marketingTemplateSaveBtn")?.addEventListener("click", saveTemplate);
    $("mTplEdPreviewDesktop")?.addEventListener("click", () => {
      previewMode = "desktop";
      document.querySelectorAll(".mkt-preview-mode-btn").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.mode === "desktop");
      });
      refreshPreview();
    });
    $("mTplEdPreviewMobile")?.addEventListener("click", () => {
      previewMode = "mobile";
      document.querySelectorAll(".mkt-preview-mode-btn").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.mode === "mobile");
      });
      refreshPreview();
    });
    ["mTplEdName", "mTplEdSubject", "mTplEdPreview"].forEach((id) => {
      $(id)?.addEventListener("input", () => {
        if (draft) {
          draft.name = $("mTplEdName")?.value ?? draft.name;
          draft.subject = $("mTplEdSubject")?.value ?? draft.subject;
          draft.previewText = $("mTplEdPreview")?.value ?? draft.previewText;
        }
        schedulePreview();
      });
    });
  }

  window.EasyfattTemplateEditor = {
    init,
    open,
    close,
    createStarter: createStarterBlocks,
  };
})();
