/**
 * Messaggi errore client-friendly (nessuno stack trace verso l'UI).
 */

function stripTechnicalDetails(message) {
  if (!message) return "";
  return String(message)
    .split("\n")[0]
    .replace(/\s+at\s+.+/g, "")
    .trim();
}

function toClientMessage(error, context = "generic") {
  if (!error) {
    return "Si è verificato un problema. Riprova.";
  }

  const raw = stripTechnicalDetails(error.message || String(error));
  const code = error.code || "";
  const lower = raw.toLowerCase();

  if (/google non collegato|collega google/i.test(raw)) {
    return raw;
  }

  if (
    context === "google" ||
    /invalid_grant|invalid_credentials|token has been expired|token expired|unauthorized|auth/i.test(
      lower
    ) ||
    error.status === 401 ||
    error.status === 403
  ) {
    return 'Collegamento Google scaduto o non valido. Clicca "Collega Google" per ricollegare l\'account.';
  }

  if (
    code === "EBUSY" ||
    code === "EPERM" ||
    code === "EACCES" ||
    code === "ENOENT" ||
    /ebusy|eacces|eperm|locked|in use|accesso negato|cannot access|being used/i.test(lower)
  ) {
    if (code === "ENOENT" || /no such file|non trovato/i.test(lower)) {
      return "File Excel non trovato. Verifica il percorso nelle impostazioni.";
    }
    return "Il file Excel è aperto o in scrittura. Chiudi Easyfatt (e Excel se aperto) e riprova.";
  }

  if (context === "sync" && /config incompleta/i.test(lower)) {
    return raw;
  }

  if (context === "backup" && raw) {
    return raw;
  }

  if (/network|fetch failed|enotfound|etimedout|econnreset|timeout/i.test(lower)) {
    return "Connessione di rete non disponibile. Controlla internet e riprova.";
  }

  if (raw.length > 220) {
    return `${raw.slice(0, 217)}...`;
  }

  return raw || "Si è verificato un problema. Riprova.";
}

module.exports = {
  toClientMessage,
  stripTechnicalDetails,
};
