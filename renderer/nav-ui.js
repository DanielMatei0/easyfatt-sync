/* global window, document */
(function () {
  "use strict";

  const VIEW_STORAGE_KEY = "easyfatt-sync-active-view";
  const DEFAULT_VIEW = "dashboard";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function getActiveStored() {
    try {
      return window.localStorage.getItem(VIEW_STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }
  function setActiveStored(view) {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Sposta i nodi accordion-item nelle viste corrette.
   * Lasciamo il contenitore .accordion in posizione originale, ma trasferiamo gli item.
   */
  function redistributeAccordionItems() {
    const accordion = $("#settingsAccordion");
    if (!accordion) return;

    // Map: id accordion-item → view target
    const mapping = [
      { id: "accordion-google", target: "settings" },
      { id: "trigger-automation", target: "settings", closest: true },
      { id: "trigger-privacy", target: "about", closest: true },
      { id: "trigger-updates", target: "about", closest: true },
      { id: "trigger-notifications", target: "notifications", closest: true },
      { id: "trigger-backup", target: "backup", closest: true },
    ];

    mapping.forEach(({ id, target, closest }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const item = closest ? el.closest("[data-accordion-item]") : el;
      if (!item) return;
      const view = $(`[data-view="${target}"]`);
      if (!view) return;
      view.appendChild(item);
      // Trasformalo in "card piatta" sempre aperta dentro la view
      item.classList.add("is-flat", "is-open");
      const trigger = item.querySelector(".accordion-trigger");
      if (trigger) {
        trigger.setAttribute("aria-expanded", "true");
      }
    });

    // Se l'accordion è vuoto, nascondilo
    if (!accordion.querySelector("[data-accordion-item]")) {
      accordion.hidden = true;
    }
  }

  function setActiveView(view, options) {
    const target = (view || DEFAULT_VIEW).toString();
    const navItems = $$(".app-nav-item");
    const views = $$(".app-view");
    let matched = false;

    views.forEach((sec) => {
      const isActive = sec.dataset.view === target;
      sec.classList.toggle("is-active", isActive);
      sec.hidden = !isActive;
      if (isActive) matched = true;
    });

    navItems.forEach((btn) => {
      const isActive = btn.dataset.viewTarget === target;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-current", isActive ? "page" : "false");
    });

    if (!matched) {
      // fallback dashboard
      setActiveView(DEFAULT_VIEW, options);
      return;
    }

    // Mostra save-bar solo dove ha senso
    const saveBar = $("#saveBar");
    if (saveBar) {
      const showSave =
        target === "settings" ||
        target === "notifications" ||
        target === "backup";
      saveBar.hidden = !showSave || target === "marketing";
    }

    if (!options || options.persist !== false) {
      setActiveStored(target);
    }

    // Scroll smooth to top of main area
    const main = $(".column-main");
    if (main) main.scrollTop = 0;

    // Notifica
    document.dispatchEvent(
      new CustomEvent("easyfatt:view-changed", { detail: { view: target } })
    );
  }

  function bindNav() {
    $$(".app-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.viewTarget;
        if (!target) return;
        // Caso speciale: support apre direttamente il modal (vecchio comportamento) MA va anche alla view.
        setActiveView(target);
      });
    });

    // Sidebar version update
    const appVersionEl = document.getElementById("sidebarAppVersion");
    if (appVersionEl) {
      // Verrà aggiornata dal renderer.js quando ottiene la versione
    }
  }

  function bindHeaderShortcuts() {
    // Pulsanti CTA dentro dashboard view
    const dashSyncAll = document.getElementById("dashSyncAllBtn");
    const dashAddProfile = document.getElementById("dashAddProfileBtn");
    if (dashSyncAll) {
      dashSyncAll.addEventListener("click", () => {
        document.getElementById("syncAllBtn")?.click();
      });
    }
    if (dashAddProfile) {
      dashAddProfile.addEventListener("click", () => {
        setActiveView("sync");
        // Apri direttamente modal nuovo profilo
        setTimeout(() => {
          document.getElementById("addProfileBtn")?.click();
        }, 50);
      });
    }

    // Pulsanti view sync
    const viewSyncAll = document.getElementById("viewSyncAllBtn");
    const viewOpenWizard = document.getElementById("viewOpenWizardBtn");
    const viewAddProfile = document.getElementById("viewAddProfileBtn");
    if (viewSyncAll) {
      viewSyncAll.addEventListener("click", () => {
        document.getElementById("syncAllBtn")?.click();
      });
    }
    if (viewOpenWizard) {
      viewOpenWizard.addEventListener("click", () => {
        document.getElementById("openWizardBtn")?.click();
      });
    }
    if (viewAddProfile) {
      viewAddProfile.addEventListener("click", () => {
        document.getElementById("addProfileBtn")?.click();
      });
    }

    // Pulsante view history
    const viewHistoryExport = document.getElementById("viewHistoryExportBtn");
    if (viewHistoryExport) {
      viewHistoryExport.addEventListener("click", () => {
        document.getElementById("historyExportBtn")?.click();
      });
    }
    const viewHistoryClear = document.getElementById("viewHistoryClearBtn");
    if (viewHistoryClear) {
      viewHistoryClear.addEventListener("click", async () => {
        const ok = window.confirm(
          "Cancellare tutta la cronologia? Verranno persi anche gli snapshot usati per il confronto dati."
        );
        if (!ok) return;
        try {
          await window.easyfattSync?.clearSyncHistory?.();
        } catch (_) {
          /* ignore */
        }
      });
    }

    // Pulsanti view support
    const supportOpen = document.getElementById("supportViewOpenBtn");
    const supportDiag = document.getElementById("supportViewDiagBtn");
    if (supportOpen) {
      supportOpen.addEventListener("click", () => {
        document.getElementById("openSupportBtn")?.click();
      });
    }
    if (supportDiag) {
      supportDiag.addEventListener("click", async () => {
        try {
          const api = window.easyfattSync?.buildDiagnosticReport;
          if (!api) {
            window.alert?.("Funzione non disponibile.");
            return;
          }
          const report = await api();
          if (!report) {
            window.alert?.("Impossibile generare il report.");
            return;
          }
          window.alert?.(
            "Report diagnostico generato. Puoi allegarlo al form di supporto."
          );
        } catch (err) {
          window.alert?.("Impossibile generare report diagnostico.");
        }
      });
    }

    // Sidebar quick support
    const sideOpenSupport = document.getElementById("sideOpenSupportBtn");
    if (sideOpenSupport) {
      sideOpenSupport.addEventListener("click", () => {
        document.getElementById("openSupportBtn")?.click();
      });
    }
  }

  function init() {
    redistributeAccordionItems();
    bindNav();
    bindHeaderShortcuts();

    const stored = getActiveStored();
    const initial =
      stored && document.querySelector(`[data-view="${stored}"]`)
        ? stored
        : DEFAULT_VIEW;
    setActiveView(initial, { persist: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.EasyfattNavUI = {
    setActiveView,
    init,
  };
})();
