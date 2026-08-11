/**
 * Telemetria renderer → main (AvenGest).
 *  - Cattura errori non gestiti (window.onerror) e promise rifiutate (unhandledrejection)
 *    e li inoltra al processo main via IPC (`window.easyfattSync.reportError`).
 *  - Gestisce il form "Segnala un problema" (ticket) nella view Supporto.
 * La chiave API vive solo nel main: qui non c'è nessun segreto.
 */
(function initTelemetry() {
  "use strict";

  const api = () => window.easyfattSync;

  function currentScreen() {
    const active = document.querySelector(".app-view:not([hidden])");
    return (active && active.getAttribute("data-view")) || location.hash || "app";
  }

  function report(payload) {
    try {
      api()?.reportError?.(payload);
    } catch {
      /* non deve mai far fallire il renderer */
    }
  }

  // Errori sincroni non gestiti
  window.addEventListener("error", (event) => {
    const err = event?.error;
    report({
      message: (err && err.message) || event?.message || "Errore JS",
      name: (err && err.name) || "Error",
      stack: err && err.stack ? String(err.stack) : undefined,
      kind: "window.onerror",
      url: event?.filename ? `${event.filename}:${event.lineno || 0}` : undefined,
      screen: currentScreen(),
    });
  });

  // Promise rifiutate senza catch
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    report({
      message:
        (reason && reason.message) ||
        (typeof reason === "string" ? reason : "Promise rifiutata"),
      name: (reason && reason.name) || "UnhandledRejection",
      stack: reason && reason.stack ? String(reason.stack) : undefined,
      kind: "unhandledrejection",
      screen: currentScreen(),
    });
  });

  // ── Analytics: pageview per schermata ──────────────────────────
  let lastPage = null;
  function trackPage(screen) {
    const path = screen || currentScreen();
    if (!path || path === lastPage) return;
    lastPage = path;
    try {
      api()?.trackAnalytics?.({ type: "pageview", path, name: path });
    } catch {
      /* best-effort */
    }
  }

  // ── Form ticket ────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    // Pageview iniziale + a ogni cambio vista (click sui pulsanti di navigazione).
    trackPage();
    document.addEventListener("click", (event) => {
      const navBtn = event.target && event.target.closest("[data-view-target]");
      if (navBtn) {
        const target = navBtn.getAttribute("data-view-target");
        // il cambio vista avviene nello stesso tick: leggi il target del click
        setTimeout(() => trackPage(target), 0);
      }
    });

    const form = document.getElementById("ticketForm");
    const openBtn = document.getElementById("ticketOpenFormBtn");
    const cancelBtn = document.getElementById("ticketCancelBtn");
    const submitBtn = document.getElementById("ticketSubmitBtn");
    const feedback = document.getElementById("ticketFeedback");
    if (!form || !openBtn) return;

    const showFeedback = (msg, isError) => {
      if (!feedback) return;
      feedback.textContent = msg;
      feedback.hidden = !msg;
      feedback.classList.toggle("is-error", !!isError);
      feedback.classList.toggle("is-success", !isError && !!msg);
    };

    openBtn.addEventListener("click", () => {
      form.hidden = false;
      showFeedback("", false);
      document.getElementById("ticketSubject")?.focus();
      form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    cancelBtn?.addEventListener("click", () => {
      form.hidden = true;
      showFeedback("", false);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const subject = document.getElementById("ticketSubject")?.value?.trim() || "";
      const description = document.getElementById("ticketDescription")?.value?.trim() || "";
      const name = document.getElementById("ticketName")?.value?.trim() || "";
      const email = document.getElementById("ticketEmail")?.value?.trim() || "";
      const priority = document.getElementById("ticketPriority")?.value || "NORMAL";

      if (subject.length < 3) {
        showFeedback("Inserisci un oggetto (almeno 3 caratteri).", true);
        return;
      }
      if (description.length < 10) {
        showFeedback("Descrivi il problema con almeno 10 caratteri.", true);
        return;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFeedback("Inserisci un indirizzo email valido (oppure lascialo vuoto).", true);
        return;
      }

      if (typeof api()?.openSupportTicket !== "function") {
        showFeedback("Riavvia l'app per attivare l'invio dei ticket.", true);
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      showFeedback("Invio ticket in corso…", false);
      try {
        const result = await api().openSupportTicket({
          subject,
          description,
          priority,
          external_user: name || email ? { name, email } : undefined,
        });
        if (result?.ok) {
          showFeedback(
            `Ticket inviato${result.ticketId ? ` (rif. ${result.ticketId})` : ""}. Ti ricontatteremo.`,
            false
          );
          form.reset();
          const p = document.getElementById("ticketPriority");
          if (p) p.value = "NORMAL";
          setTimeout(() => {
            form.hidden = true;
            showFeedback("", false);
          }, 4000);
        } else {
          showFeedback(result?.message || "Invio non riuscito. Riprova.", true);
        }
      } catch {
        showFeedback("Errore imprevisto durante l'invio. Riprova.", true);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
})();
