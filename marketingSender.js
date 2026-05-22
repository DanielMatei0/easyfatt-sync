const { MARKETING_API_URL, MARKETING_MAX_BATCH_SIZE } = require("./marketingConstants");

function getSenderApiUrl(marketingApiUrl) {
  const sendUrl = String(marketingApiUrl || MARKETING_API_URL).trim() || MARKETING_API_URL;
  if (/\/send\/?$/i.test(sendUrl)) return sendUrl.replace(/\/send\/?$/i, "/sender");
  return `${sendUrl.replace(/\/+$/g, "")}/sender`;
}

/**
 * Invio batch email marketing verso API Aven Labs.
 * Nessuna API key nell'app — solo payload destinatari + template.
 */
async function sendMarketingBatch(options = {}) {
  const {
    marketingApiUrl,
    payload,
    dryRun = false,
    realSendEnabled = false,
  } = options;

  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Payload invio non valido." };
  }

  const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
  if (!recipients.length) {
    return { ok: false, message: "Nessun destinatario da inviare." };
  }

  if (recipients.length > MARKETING_MAX_BATCH_SIZE) {
    return {
      ok: false,
      message: `Massimo ${MARKETING_MAX_BATCH_SIZE} destinatari per invio. Riduci il batch.`,
    };
  }

  const url = String(marketingApiUrl || MARKETING_API_URL).trim() || MARKETING_API_URL;

  if (!dryRun && !realSendEnabled) {
    return {
      ok: false,
      simulated: true,
      message: "Invio reale disabilitato. Abilita l'invio reale nelle impostazioni marketing.",
    };
  }

  const body = {
    ...payload,
    metadata: {
      ...(payload.metadata || {}),
      dryRun: !!dryRun,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        message: data.message || data.error || `Errore invio marketing (${response.status})`,
        results: data.results,
      };
    }

    return {
      ok: true,
      dryRun: !!dryRun,
      simulated: !!dryRun || !!data.simulated,
      results: data.results || [],
      message: data.message,
    };
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? "Timeout durante la comunicazione con il server marketing."
        : error.message || "Errore di rete. Verifica la connessione.";
    return { ok: false, message };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyMarketingSender(options = {}) {
  const { marketingApiUrl, senderEmail, action = "prepare" } = options;
  const email = String(senderEmail || "").trim().toLowerCase();
  if (!email) {
    return { ok: false, message: "Inserisci un indirizzo email mittente." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(getSenderApiUrl(marketingApiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderEmail: email, action }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok && data.ok !== false,
      ...data,
      message:
        data.message ||
        (response.ok
          ? "Verifica mittente aggiornata."
          : `Errore verifica mittente (${response.status})`),
    };
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? "Timeout durante la verifica del mittente."
        : error.message || "Errore di rete durante la verifica del mittente.";
    return { ok: false, status: "network_error", message, records: [] };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  sendMarketingBatch,
  verifyMarketingSender,
  getSenderApiUrl,
  MARKETING_MAX_BATCH_SIZE,
};
