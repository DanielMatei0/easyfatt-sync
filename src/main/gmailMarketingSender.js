const crypto = require("crypto");
const { authorizeGoogle, GMAIL_SEND_SCOPE, hasGoogleScope } = require("./auth");
const { MARKETING_MAX_BATCH_SIZE } = require("./marketingConstants");
const { renderMarketingEmail, getBusinessProfile } = require("./emailTemplateRenderer");

let cachedGoogleApi = null;

function getGoogleApi() {
  if (!cachedGoogleApi) {
    cachedGoogleApi = require("googleapis").google;
  }
  return cachedGoogleApi;
}

function isGmailAddress(email) {
  return /@(gmail\.com|googlemail\.com)$/i.test(String(email || "").trim());
}

function cleanHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value) {
  const clean = cleanHeader(value);
  if (!clean) return "";
  if (/^[\x20-\x7E]+$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function encodeAddress(email, name) {
  const e = cleanHeader(email).toLowerCase();
  const n = cleanHeader(name);
  return n ? `${encodeHeader(n)} <${e}>` : e;
}

function base64(value) {
  return Buffer.from(String(value || ""), "utf8").toString("base64");
}

function base64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function customerFromRecipient(recipient) {
  const vars = recipient.variables || {};
  return {
    firstName: recipient.firstName || vars.firstName || "",
    lastName: recipient.lastName || vars.lastName || "",
    fullName: [recipient.firstName, recipient.lastName].filter(Boolean).join(" "),
    email: recipient.email,
    points: vars.points != null ? vars.points : undefined,
    fidelityCardNumber: vars.fidelityCardNumber || "",
    birthDateRaw: vars.birthday || "",
  };
}

function buildMarketingConfig(businessProfile) {
  return {
    businessName: businessProfile.businessName || "",
    senderName: businessProfile.senderName || "",
    senderEmail: businessProfile.senderEmail || "",
    replyToEmail: businessProfile.replyToEmail || businessProfile.senderEmail || "",
    businessProfile,
  };
}

function buildMimeMessage({ from, to, replyTo, subject, html, text }) {
  const boundary = `easyfatt_sync_${crypto.randomBytes(10).toString("hex")}`;
  const headers = [
    "MIME-Version: 1.0",
    `To: ${cleanHeader(to)}`,
    `From: ${from}`,
    replyTo ? `Reply-To: ${cleanHeader(replyTo)}` : "",
    `Subject: ${encodeHeader(subject || "(senza oggetto)")}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  return [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64(text || ""),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64(html || ""),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function mapGmailError(error) {
  const message = String(error?.message || error || "").trim();
  if (/insufficient|forbidden|permission|scope/i.test(message) || error?.code === 403) {
    return "Permesso Gmail mancante. Ricollega Google e accetta il permesso di invio email.";
  }
  if (/invalid.*from|from.*address|sendAs/i.test(message)) {
    return "Gmail non consente questo mittente. Usa l'email dell'account Google collegato.";
  }
  return message || "Invio Gmail non riuscito.";
}

async function sendGmailMarketingBatch(options = {}) {
  const { payload, dryRun = false, realSendEnabled = false } = options;

  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Payload invio Gmail non valido." };
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

  const businessProfile = payload.businessProfile || {};
  const senderEmail = String(businessProfile.senderEmail || "").trim().toLowerCase();
  if (!isGmailAddress(senderEmail)) {
    return { ok: false, message: "Il mittente non è un indirizzo Gmail." };
  }

  if (!dryRun && !realSendEnabled) {
    return {
      ok: false,
      simulated: true,
      message: "Invio reale disabilitato. Abilita l'invio reale nelle impostazioni marketing.",
    };
  }

  const marketingConfig = buildMarketingConfig(businessProfile);
  const bp = getBusinessProfile(marketingConfig);
  const from = encodeAddress(senderEmail, bp.senderName || bp.businessName || senderEmail);
  const replyTo = businessProfile.replyToEmail || senderEmail;
  const results = [];

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      simulated: true,
      message: `Dry-run Gmail: ${recipients.length} destinatari elaborati.`,
      results: recipients.map((recipient) => ({
        email: String(recipient.email || "").trim().toLowerCase(),
        status: "simulated",
        reason: "Dry-run Gmail: nessun invio effettuato",
      })),
    };
  }

  if (!hasGoogleScope(GMAIL_SEND_SCOPE)) {
    return {
      ok: false,
      status: "missing_gmail_scope",
      message: "Permesso Gmail mancante. Ricollega Google e accetta il permesso di invio email.",
      results: [],
    };
  }

  let gmail;
  try {
    const auth = await authorizeGoogle();
    gmail = getGoogleApi().gmail({ version: "v1", auth });
  } catch (error) {
    return {
      ok: false,
      message: mapGmailError(error),
      results: [],
    };
  }

  for (const recipient of recipients.slice(0, MARKETING_MAX_BATCH_SIZE)) {
    const email = String(recipient.email || "").trim().toLowerCase();
    try {
      const rendered = renderMarketingEmail(payload.template, marketingConfig, customerFromRecipient(recipient), {
        reward: recipient.variables?.reward,
        businessName: bp.businessName,
      });
      const raw = buildMimeMessage({
        from,
        to: email,
        replyTo,
        subject: rendered.subject,
        html: rendered.bodyHtml,
        text: rendered.bodyText,
      });

      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: base64Url(raw) },
      });
      results.push({ email, status: "sent" });
    } catch (error) {
      results.push({ email, status: "failed", reason: mapGmailError(error) });
    }
  }

  return {
    ok: true,
    dryRun: false,
    simulated: false,
    provider: "gmail",
    message: `Invio Gmail completato: ${results.length} destinatari elaborati.`,
    results,
  };
}

module.exports = {
  sendGmailMarketingBatch,
  isGmailAddress,
};
