const { Resend } = require("resend");
const { validatePayload } = require("../../../../../lib/validate");
const { renderMarketingEmail, getBusinessProfile } = require("../../../../../lib/emailRenderer");

const MAX_RECIPIENTS = 50;

function cleanHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function formatAddress(email, name) {
  const e = cleanHeader(email).toLowerCase();
  if (!e) return "";
  const n = cleanHeader(name);
  return n ? `${n} <${e}>` : e;
}

// Mittente brandizzato sul cliente: usa SEMPRE il senderEmail configurato
// dall'utente (dominio verificato via DNS su Resend). Il fallback Aven Labs
// vale solo se il cliente non ha ancora impostato un mittente proprio.
function getFromAddress(businessProfile) {
  const own = formatAddress(
    businessProfile?.senderEmail,
    businessProfile?.senderName || businessProfile?.businessName
  );
  if (own) return own;
  return (
    process.env.MARKETING_FROM_EMAIL ||
    "Aven Labs Marketing <marketing@aven-labs.com>"
  );
}

function getReplyTo(businessProfile) {
  const reply =
    String(businessProfile?.replyToEmail || "").trim() ||
    String(businessProfile?.senderEmail || "").trim() ||
    process.env.MARKETING_REPLY_FALLBACK ||
    "support@aven-labs.com";
  return reply;
}

function customerFromRecipient(recipient, businessProfile) {
  const vars = recipient.variables || {};
  return {
    firstName: recipient.firstName || vars.firstName || "",
    lastName: recipient.lastName || vars.lastName || "",
    fullName: [recipient.firstName, recipient.lastName].filter(Boolean).join(" "),
    email: recipient.email,
    points: vars.points != null ? Number(vars.points) || vars.points : undefined,
    fidelityCardNumber: vars.fidelityCardNumber || "",
    birthDateRaw: vars.birthday || "",
  };
}

function buildMarketingConfig(businessProfile) {
  return {
    businessName: businessProfile.businessName || "",
    senderName: businessProfile.senderName || "",
    senderEmail: businessProfile.senderEmail || "",
    replyToEmail: businessProfile.replyToEmail || "",
    businessProfile,
  };
}

async function sendWithResend({ to, subject, html, replyTo, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY non configurata sul server.");
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    replyTo,
  });

  if (result.error) {
    throw new Error(result.error.message || "Errore Resend");
  }

  return result.data;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const validated = validatePayload(body);

    if (!validated.ok) {
      return Response.json({ ok: false, message: validated.message }, { status: 400 });
    }

    const { dryRun, businessProfile, template, recipients, automation } = validated;
    const marketingConfig = buildMarketingConfig(businessProfile);
    const bp = getBusinessProfile(marketingConfig);

    if (businessProfile.logoUrl) {
      bp.logoDataUrl = businessProfile.logoUrl;
    }

    const from = getFromAddress(businessProfile);
    const replyTo = getReplyTo(businessProfile);
    const results = [];

    for (const recipient of recipients.slice(0, MAX_RECIPIENTS)) {
      const email = String(recipient.email).trim().toLowerCase();

      try {
        const customer = customerFromRecipient(recipient, bp);
        const rendered = renderMarketingEmail(template, marketingConfig, customer, {
          reward: recipient.variables?.premio || recipient.variables?.reward,
          threshold: recipient.variables?.soglia,
          businessName: bp.businessName,
        });

        if (dryRun) {
          results.push({
            email,
            status: "simulated",
            reason: "Dry-run: nessun invio effettuato",
          });
          continue;
        }

        await sendWithResend({
          to: email,
          subject: rendered.subject,
          html: rendered.bodyHtml,
          replyTo,
          from,
        });

        results.push({ email, status: "sent" });
      } catch (err) {
        results.push({
          email,
          status: "failed",
          reason: err.message || "Invio fallito",
        });
      }
    }

    return Response.json({
      ok: true,
      simulated: dryRun,
      dryRun,
      automationId: automation.id,
      message: dryRun
        ? `Dry-run: ${results.length} destinatari elaborati.`
        : `Elaborati ${results.length} destinatari.`,
      results,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error.message || "Errore interno del server.",
      },
      { status: 500 }
    );
  }
}
