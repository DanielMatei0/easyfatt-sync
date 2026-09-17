/**
 * window.confirm / window.alert nativi di Chromium lasciano su Windows la pagina
 * senza focus da tastiera dopo la chiusura: i campi di testo non accettano più
 * input finché non si cambia finestra. Qui li si sostituisce con le finestre di
 * Electron (stesso comportamento sincrono), che poi restituiscono il focus.
 * Va caricato prima di tutti gli altri script.
 */
(function () {
  const api = window.easyfattSync;
  if (!api || typeof api.confirmSync !== "function") return;
  window.confirm = (message) => Boolean(api.confirmSync(message));
  window.alert = (message) => {
    api.alertSync(message);
  };
})();
