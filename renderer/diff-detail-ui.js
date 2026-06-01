/* global window, document */
/**
 * diff-detail-ui.js
 *
 * Modal "Dettaglio sincronizzazione" con confronto stile GitHub diff.
 * - apre via EasyfattDiffUI.openByEvent(event)
 * - chiede al main il dettaglio diff tramite easyfattSync.getHistoryDiff(eventId)
 * - tabs: Panoramica / Aggiunte / Modificate / Rimosse
 *
 * Privacy: i dati restano locali. Nessuna chiamata di rete.
 */
(function () {
  "use strict";

  const overlay = document.getElementById("diffDetailOverlay");
  if (!overlay) return;

  const els = {
    overlay,
    closeBtn: document.getElementById("diffDetailCloseBtn"),
    title: document.getElementById("diffDetailTitle"),
    subtitle: document.getElementById("diffDetailSubtitle"),
    metaStatus: document.getElementById("diffMetaStatus"),
    metaProfile: document.getElementById("diffMetaProfile"),
    metaDate: document.getElementById("diffMetaDate"),
    metaDuration: document.getElementById("diffMetaDuration"),
    metaFile: document.getElementById("diffMetaFile"),
    metaSheet: document.getElementById("diffMetaSheet"),
    statAdded: document.getElementById("diffStatAdded"),
    statModified: document.getElementById("diffStatModified"),
    statRemoved: document.getElementById("diffStatRemoved"),
    statUnchanged: document.getElementById("diffStatUnchanged"),
    tabAddedCount: document.getElementById("diffTabAddedCount"),
    tabModifiedCount: document.getElementById("diffTabModifiedCount"),
    tabRemovedCount: document.getElementById("diffTabRemovedCount"),
    tabs: Array.from(overlay.querySelectorAll(".diff-tab")),
    panels: Array.from(overlay.querySelectorAll(".diff-panel")),
    overviewBody: document.getElementById("diffOverviewBody"),
    addedList: document.getElementById("diffAddedList"),
    modifiedList: document.getElementById("diffModifiedList"),
    removedList: document.getElementById("diffRemovedList"),
    truncatedNote: document.getElementById("diffTruncatedNote"),
  };

  function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  function fmtDuration(ms) {
    const n = Number(ms) || 0;
    if (n < 1000) return `${n} ms`;
    const s = n / 1000;
    if (s < 60) return `${s.toFixed(s >= 10 ? 0 : 1)} s`;
    const m = Math.floor(s / 60);
    const rs = Math.round(s % 60);
    return `${m}m ${rs}s`;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text == null || text === "" ? "—" : String(text);
  }

  function clearChildren(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function open() {
    overlay.hidden = false;
    document.body.classList.add("diff-modal-open");
    setTimeout(() => {
      els.closeBtn?.focus();
    }, 30);
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove("diff-modal-open");
    setActiveTab("overview");
  }

  function setActiveTab(name) {
    els.tabs.forEach((t) => {
      const isActive = t.dataset.diffTab === name;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    els.panels.forEach((p) => {
      p.hidden = p.dataset.diffPanel !== name;
    });
  }

  function renderEmptyList(container, message) {
    clearChildren(container);
    const p = document.createElement("p");
    p.className = "diff-empty";
    p.textContent = message;
    container.appendChild(p);
  }

  function renderRowFields(row) {
    if (!row || typeof row !== "object") return "";
    const entries = Object.entries(row).filter(
      ([, v]) => v !== "" && v != null
    );
    if (!entries.length) return "";
    return entries
      .slice(0, 12)
      .map(
        ([k, v]) =>
          `<span class="diff-row-field"><span class="diff-row-field-name">${escapeHtml(
            k
          )}</span><span class="diff-row-field-value">${escapeHtml(v)}</span></span>`
      )
      .join("");
  }

  function renderAddedList(items) {
    if (!items || !items.length) {
      renderEmptyList(els.addedList, "Nessuna riga aggiunta.");
      return;
    }
    clearChildren(els.addedList);
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "diff-row diff-row-added";
      card.innerHTML = `
        <div class="diff-row-head">
          <span class="diff-row-marker" aria-hidden="true">+</span>
          <span class="diff-row-label">${escapeHtml(item.label || "Nuova riga")}</span>
        </div>
        <div class="diff-row-fields">${renderRowFields(item.row)}</div>
      `;
      els.addedList.appendChild(card);
    });
  }

  function renderRemovedList(items) {
    if (!items || !items.length) {
      renderEmptyList(els.removedList, "Nessuna riga rimossa.");
      return;
    }
    clearChildren(els.removedList);
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "diff-row diff-row-removed";
      card.innerHTML = `
        <div class="diff-row-head">
          <span class="diff-row-marker" aria-hidden="true">−</span>
          <span class="diff-row-label">${escapeHtml(item.label || "Riga rimossa")}</span>
        </div>
        <div class="diff-row-fields">${renderRowFields(item.row)}</div>
      `;
      els.removedList.appendChild(card);
    });
  }

  function renderModifiedList(items) {
    if (!items || !items.length) {
      renderEmptyList(els.modifiedList, "Nessuna riga modificata.");
      return;
    }
    clearChildren(els.modifiedList);
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "diff-row diff-row-modified";
      const fields = (item.changedFields || [])
        .map((f) => {
          return `
            <div class="diff-field-change">
              <span class="diff-field-name">${escapeHtml(f.field)}</span>
              <div class="diff-field-lines">
                <div class="diff-line diff-line-before"><span class="diff-line-marker">−</span><span class="diff-line-value">${escapeHtml(
                  f.before || "(vuoto)"
                )}</span></div>
                <div class="diff-line diff-line-after"><span class="diff-line-marker">+</span><span class="diff-line-value">${escapeHtml(
                  f.after || "(vuoto)"
                )}</span></div>
              </div>
            </div>
          `;
        })
        .join("");
      card.innerHTML = `
        <div class="diff-row-head">
          <span class="diff-row-marker" aria-hidden="true">~</span>
          <span class="diff-row-label">${escapeHtml(item.label || "Riga modificata")}</span>
          <span class="diff-row-count">${item.changedFields?.length || 0} campo${
        item.changedFields?.length === 1 ? "" : "i"
      } modificat${item.changedFields?.length === 1 ? "o" : "i"}</span>
        </div>
        <div class="diff-field-list">${fields}</div>
      `;
      els.modifiedList.appendChild(card);
    });
  }

  function renderOverview(event, summary, details) {
    clearChildren(els.overviewBody);

    const wrap = document.createElement("div");
    wrap.className = "diff-overview-wrap";

    if (summary && summary.firstSnapshot) {
      const note = document.createElement("div");
      note.className = "diff-overview-note diff-overview-info";
      note.innerHTML = `
        <strong>Primo snapshot creato.</strong>
        Dalla prossima sincronizzazione potrai vedere il confronto con i dati precedenti.
      `;
      wrap.appendChild(note);
    }

    if (!summary) {
      const note = document.createElement("div");
      note.className = "diff-overview-note";
      note.innerHTML =
        "<strong>Dettaglio modifiche non disponibile per questa sincronizzazione.</strong> Potrebbe essere un evento precedente all'attivazione del diff o un sync senza dati.";
      wrap.appendChild(note);
    } else if (!summary.firstSnapshot) {
      const summaryLine = document.createElement("p");
      summaryLine.className = "diff-overview-summary";
      const a = summary.addedCount || 0;
      const m = summary.modifiedCount || 0;
      const r = summary.removedCount || 0;
      const u = summary.unchangedCount || 0;
      summaryLine.innerHTML = `Confronto con la sync precedente: <strong class="diff-tone-added">+${a}</strong>, <strong class="diff-tone-modified">~${m}</strong>, <strong class="diff-tone-removed">−${r}</strong>, <span class="diff-tone-muted">${u} invariate</span>.`;
      wrap.appendChild(summaryLine);
    }

    if (event?.message) {
      const msg = document.createElement("p");
      msg.className = "diff-overview-message";
      msg.textContent = event.message;
      wrap.appendChild(msg);
    }

    if (summary && (summary.totalBefore || summary.totalAfter)) {
      const totals = document.createElement("p");
      totals.className = "diff-overview-totals";
      totals.innerHTML = `Righe totali: prima <strong>${summary.totalBefore || 0}</strong> → dopo <strong>${
        summary.totalAfter || 0
      }</strong>.`;
      wrap.appendChild(totals);
    }

    if (!details && summary && !summary.firstSnapshot) {
      const note = document.createElement("p");
      note.className = "diff-overview-note diff-overview-info";
      note.textContent =
        "Il dettaglio per riga non è disponibile (potrebbe essere stato eliminato per fare spazio).";
      wrap.appendChild(note);
    }

    els.overviewBody.appendChild(wrap);
  }

  async function openByEvent(event) {
    if (!event) return;

    // Reset
    setText(els.subtitle, event.profileName || "Sincronizzazione");
    setText(els.metaProfile, event.profileName || "—");
    setText(els.metaDate, fmtDateTime(event.at));
    setText(els.metaDuration, fmtDuration(event.durationMs));
    setText(els.metaFile, event.excelFile || "—");
    setText(els.metaSheet, event.sheetName || "—");

    const statusEl = els.metaStatus;
    if (statusEl) {
      const ok = event.status !== "error";
      statusEl.textContent = ok ? "Successo" : "Errore";
      statusEl.dataset.tone = ok ? "success" : "error";
    }

    const summary = event.diffSummary || null;
    setText(els.statAdded, summary?.addedCount || 0);
    setText(els.statModified, summary?.modifiedCount || 0);
    setText(els.statRemoved, summary?.removedCount || 0);
    setText(els.statUnchanged, summary?.unchangedCount || 0);
    setText(els.tabAddedCount, summary?.addedCount || 0);
    setText(els.tabModifiedCount, summary?.modifiedCount || 0);
    setText(els.tabRemovedCount, summary?.removedCount || 0);

    // Reset liste e tab
    setActiveTab("overview");
    renderEmptyList(els.addedList, "Caricamento…");
    renderEmptyList(els.modifiedList, "Caricamento…");
    renderEmptyList(els.removedList, "Caricamento…");
    if (els.truncatedNote) els.truncatedNote.hidden = true;

    renderOverview(event, summary, null);
    open();

    // Carica dettaglio diff
    let details = null;
    try {
      if (event.hasDiffDetails && window.easyfattSync?.getHistoryDiff) {
        details = await window.easyfattSync.getHistoryDiff(event.id);
      }
    } catch (_) {
      details = null;
    }

    if (details) {
      renderAddedList(details.added);
      renderModifiedList(details.modified);
      renderRemovedList(details.removed);
      if (els.truncatedNote) {
        els.truncatedNote.hidden = !details.truncated;
      }
      renderOverview(event, summary, details);
    } else {
      renderAddedList([]);
      renderModifiedList([]);
      renderRemovedList([]);
      if (summary?.firstSnapshot) {
        renderEmptyList(
          els.addedList,
          "Primo snapshot: dalla prossima sync vedrai qui le nuove righe."
        );
        renderEmptyList(els.modifiedList, "Nessuna riga modificata.");
        renderEmptyList(els.removedList, "Nessuna riga rimossa.");
      } else {
        renderEmptyList(els.addedList, "Dettaglio non disponibile.");
        renderEmptyList(els.modifiedList, "Dettaglio non disponibile.");
        renderEmptyList(els.removedList, "Dettaglio non disponibile.");
      }
    }
  }

  // Tab switching
  els.tabs.forEach((t) => {
    t.addEventListener("click", () => setActiveTab(t.dataset.diffTab));
  });

  // Close handlers
  els.closeBtn?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") close();
  });

  window.EasyfattDiffUI = {
    openByEvent,
    close,
  };
})();
