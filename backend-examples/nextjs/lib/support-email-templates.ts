/**
 * Template email supporto Easyfatt Sync — Aven Labs
 * Usare con Resend dal route app/api/support/easyfatt-sync/route.ts
 */

export type SupportRequestPayload = {
  name: string;
  email: string;
  phone?: string;
  issueType: string;
  message: string;
  appVersion: string;
  platform: string;
  platformLabel?: string;
  lastSyncAt?: string | null;
  lastSyncRows?: number | null;
  googleAuthorized: boolean;
  excelPath?: string;
  sheetName?: string;
  createdAt: string;
};

const BRAND_ORANGE = "#ff7a00";
const BRAND_DARK = "#14161a";
const BRAND_MUTED = "#606674";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPlatform(payload: SupportRequestPayload): string {
  if (payload.platformLabel) return payload.platformLabel;
  if (payload.platform === "win32") return "Windows";
  if (payload.platform === "darwin") return "macOS";
  if (payload.platform === "linux") return "Linux";
  return payload.platform;
}

function emailShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND_DARK};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e8ebf2;">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND_ORANGE},#ff9a3d);padding:22px 28px;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.92);">Aven Labs</p>
              <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;color:#ffffff;">Easyfatt Sync</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">${body}</td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:${BRAND_MUTED};">Aven Labs — Soluzioni digitali per aziende · <a href="https://aven-labs.com" style="color:${BRAND_ORANGE};">aven-labs.com</a></p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function infoBox(title: string, rows: Array<[string, string]>): string {
  const items = rows
    .map(
      ([label, value]) => `<tr>
        <td style="padding:8px 0;font-size:13px;color:${BRAND_MUTED};width:38%;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:8px 0;font-size:14px;color:${BRAND_DARK};vertical-align:top;">${value}</td>
      </tr>`
    )
    .join("");

  return `<div style="margin:0 0 18px;padding:16px 18px;background:#f8f9fc;border:1px solid #e8ebf2;border-radius:10px;">
    <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND_MUTED};">${escapeHtml(title)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
  </div>`;
}

export function buildSupportInternalEmail(payload: SupportRequestPayload) {
  const subject = `[Easyfatt Sync] Nuova richiesta supporto - ${payload.issueType}`;
  const replyMailto = `mailto:${encodeURIComponent(payload.email)}?subject=${encodeURIComponent(`Re: Richiesta supporto Easyfatt Sync - ${payload.issueType}`)}`;

  const body = `
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">È arrivata una nuova richiesta di supporto dall’app desktop.</p>
    ${infoBox("Dati cliente", [
      ["Nome / attività", escapeHtml(payload.name)],
      ["Email", `<a href="mailto:${escapeHtml(payload.email)}" style="color:${BRAND_ORANGE};">${escapeHtml(payload.email)}</a>`],
      ["Telefono", escapeHtml(payload.phone || "—")],
    ])}
    ${infoBox("Problema segnalato", [
      ["Tipo", escapeHtml(payload.issueType)],
      ["Descrizione", escapeHtml(payload.message).replace(/\n/g, "<br />")],
      ["Data richiesta", escapeHtml(formatDateTime(payload.createdAt))],
    ])}
    ${infoBox("Dati tecnici app", [
      ["Versione app", escapeHtml(payload.appVersion)],
      ["Sistema operativo", escapeHtml(formatPlatform(payload))],
      ["Ultima sincronizzazione", escapeHtml(formatDateTime(payload.lastSyncAt))],
      ["Righe ultima sync", escapeHtml(payload.lastSyncRows ?? "—")],
      ["Google collegato", payload.googleAuthorized ? "Sì" : "No"],
      ["File Excel", escapeHtml(payload.excelPath || "—")],
      ["Nome scheda", escapeHtml(payload.sheetName || "—")],
    ])}
    <p style="margin:0;">
      <a href="${replyMailto}" style="display:inline-block;padding:12px 18px;background:${BRAND_ORANGE};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Rispondi al cliente</a>
    </p>
  `;

  return {
    subject,
    html: emailShell("Nuova richiesta supporto", body),
  };
}

export function buildSupportConfirmationEmail(payload: SupportRequestPayload) {
  const subject = "Abbiamo ricevuto la tua richiesta - Easyfatt Sync";

  const body = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.5;">Ciao <strong>${escapeHtml(payload.name)}</strong>,</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${BRAND_DARK};">
      Abbiamo ricevuto la tua richiesta di supporto per <strong>Easyfatt Sync</strong>.
    </p>
    ${infoBox("Riepilogo richiesta", [
      ["Tipo problema", escapeHtml(payload.issueType)],
      ["Descrizione", escapeHtml(payload.message).replace(/\n/g, "<br />")],
      ["Data richiesta", escapeHtml(formatDateTime(payload.createdAt))],
    ])}
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      Ti risponderemo il prima possibile all’indirizzo <strong>${escapeHtml(payload.email)}</strong>.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND_MUTED};">
      Se non hai inviato tu questa richiesta, puoi ignorare questa email o contattarci su
      <a href="mailto:support@aven-labs.com" style="color:${BRAND_ORANGE};">support@aven-labs.com</a>.
    </p>
  `;

  return {
    subject,
    html: emailShell("Conferma richiesta supporto", body),
  };
}
