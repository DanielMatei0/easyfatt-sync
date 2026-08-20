/**
 * Blocco interazione del corpo app (#appShell) a CONTATORE DI RIFERIMENTI.
 *
 * Problema risolto: più modali (legal, support, profile, backup...) impostavano
 * la classe `.app-shell.is-blocked` (pointer-events:none) in modo indipendente e
 * incoerente. Con modali sovrapposti la classe restava attaccata dopo l'ultima
 * chiusura → input/select del corpo principale bloccati in modo intermittente.
 *
 * Qui teniamo un Set degli owner attivi: la classe è presente sse e solo se
 * almeno un owner la richiede. Idempotente.
 */
(function initShellBlock() {
  "use strict";

  const owners = new Set();

  function apply() {
    const appShell = document.getElementById("appShell");
    if (!appShell) return;
    appShell.classList.toggle("is-blocked", owners.size > 0);
  }

  window.shellBlock = {
    acquire(id) {
      if (!id) return;
      owners.add(id);
      apply();
    },
    release(id) {
      if (!id) return;
      owners.delete(id);
      apply();
    },
    /** Comodità: sostituisce toggle("is-blocked", visible) mantenendo il conteggio. */
    set(id, visible) {
      if (visible) this.acquire(id);
      else this.release(id);
    },
    isBlocked() {
      return owners.size > 0;
    },
    /** Solo per diagnostica in DevTools. */
    _owners() {
      return Array.from(owners);
    },
  };
})();
