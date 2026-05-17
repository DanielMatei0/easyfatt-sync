const MAX_RECIPIENTS = 50;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e);
}

function sanitizeString(value, maxLen = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLen);
}

function validatePayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Payload non valido." };
  }

  const bp = body.businessProfile;
  if (!bp || typeof bp !== "object") {
    return { ok: false, message: "businessProfile mancante." };
  }

  const automation = body.automation;
  if (!automation?.id || !automation?.name) {
    return { ok: false, message: "automazione non valida." };
  }

  const template = body.template;
  if (!template?.subject) {
    return { ok: false, message: "template.subject obbligatorio." };
  }

  const recipients = Array.isArray(body.recipients) ? body.recipients : [];
  if (!recipients.length) {
    return { ok: false, message: "Nessun destinatario." };
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return {
      ok: false,
      message: `Massimo ${MAX_RECIPIENTS} destinatari per richiesta.`,
    };
  }

  for (const r of recipients) {
    if (!isValidEmail(r.email)) {
      return { ok: false, message: `Email non valida: ${sanitizeString(r.email, 80)}` };
    }
  }

  const dryRun = !!body.metadata?.dryRun;

  return {
    ok: true,
    dryRun,
    businessProfile: bp,
    automation,
    template,
    recipients,
    metadata: body.metadata || {},
  };
}

module.exports = {
  MAX_RECIPIENTS,
  isValidEmail,
  validatePayload,
};
