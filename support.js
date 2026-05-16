const os = require("os");
const { SUPPORT_API_URL, SUPPORT_EMAIL } = require("./supportConstants");
const { resolveIssueTypeLabel } = require("./supportIssueTypes");

const REQUEST_TIMEOUT_MS = 30000;
const MAX_MESSAGE_LENGTH = 4000;

function getPlatformLabel() {
  const platform = process.platform;
  if (platform === "win32") return `Windows ${os.release()}`;
  if (platform === "darwin") return `macOS ${os.release()}`;
  if (platform === "linux") return `Linux ${os.release()}`;
  return `${platform} ${os.release()}`;
}

function validateSupportForm(form) {
  const errors = {};

  const name = String(form?.name || "").trim();
  const email = String(form?.email || "").trim();
  const message = String(form?.message || "").trim();
  const issueTypeRaw = String(form?.issueType || "").trim();

  if (name.length < 2) {
    errors.name = "Inserisci il nome dell’attività (almeno 2 caratteri).";
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Inserisci un indirizzo email valido.";
  }

  if (!issueTypeRaw) {
    errors.issueType = "Seleziona il tipo di problema.";
  }

  if (message.length < 10) {
    errors.message = "Descrivi il problema con almeno 10 caratteri.";
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `La descrizione è troppo lunga (max ${MAX_MESSAGE_LENGTH} caratteri).`;
  }

  const issueType = resolveIssueTypeLabel(issueTypeRaw);

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: {
      name,
      email,
      phone: String(form?.phone || "").trim(),
      issueType,
      message,
    },
  };
}

async function submitSupportRequest(form, context) {
  const validation = validateSupportForm(form);
  if (!validation.ok) {
    return {
      ok: false,
      validationErrors: validation.errors,
    };
  }

  const payload = {
    ...validation.values,
    appVersion: context.appVersion,
    platform: context.platform || process.platform,
    platformLabel: context.platformLabel || getPlatformLabel(),
    lastSyncAt: context.lastSyncAt ?? null,
    lastSyncRows: context.lastSyncRows ?? null,
    googleAuthorized: !!context.googleAuthorized,
    excelPath: context.excelPath || "",
    sheetName: context.sheetName || "",
    createdAt: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SUPPORT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || body?.ok === false) {
      return {
        ok: false,
        message: `Errore invio. Riprova o scrivi a ${SUPPORT_EMAIL}.`,
      };
    }

    return { ok: true };
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        ok: false,
        message: `Errore invio. Riprova o scrivi a ${SUPPORT_EMAIL}.`,
      };
    }

    return {
      ok: false,
      message: `Errore invio. Riprova o scrivi a ${SUPPORT_EMAIL}.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  submitSupportRequest,
  validateSupportForm,
  getPlatformLabel,
  SUPPORT_EMAIL,
};
