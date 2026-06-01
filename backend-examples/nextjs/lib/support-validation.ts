import type { SupportRequestPayload } from "./support-email-templates";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;
const MAX_PATH_LENGTH = 500;

const ISSUE_TYPE_LABELS: Record<string, string> = {
  google: "Collegamento Google",
  excel: "File Excel / Easyfatt",
  sync: "Sincronizzazione",
  updates: "Aggiornamenti",
  other: "Altro",
};

function resolveIssueType(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return ISSUE_TYPE_LABELS[raw] || raw;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseSupportRequestBody(body: unknown):
  | { ok: true; data: SupportRequestPayload }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Payload non valido." };
  }

  const input = body as Record<string, unknown>;

  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim();
  const phone = String(input.phone ?? "").trim();
  const message = String(input.message ?? "").trim();
  const issueType = resolveIssueType(input.issueType);

  if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
    return { ok: false, message: "Nome non valido." };
  }

  if (!isValidEmail(email)) {
    return { ok: false, message: "Email non valida." };
  }

  if (phone.length > MAX_PHONE_LENGTH) {
    return { ok: false, message: "Telefono non valido." };
  }

  if (!issueType) {
    return { ok: false, message: "Tipo problema obbligatorio." };
  }

  if (message.length < 10 || message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, message: "Descrizione problema non valida." };
  }

  const data: SupportRequestPayload = {
    name,
    email,
    phone: phone || undefined,
    issueType,
    message,
    appVersion: String(input.appVersion ?? "—").slice(0, 40),
    platform: String(input.platform ?? "unknown").slice(0, 40),
    platformLabel: input.platformLabel
      ? String(input.platformLabel).slice(0, 80)
      : undefined,
    lastSyncAt: input.lastSyncAt ? String(input.lastSyncAt) : null,
    lastSyncRows:
      typeof input.lastSyncRows === "number" && Number.isFinite(input.lastSyncRows)
        ? input.lastSyncRows
        : null,
    googleAuthorized: Boolean(input.googleAuthorized),
    excelPath: String(input.excelPath ?? "").slice(0, MAX_PATH_LENGTH),
    sheetName: String(input.sheetName ?? "").slice(0, 120),
    createdAt: input.createdAt ? String(input.createdAt) : new Date().toISOString(),
  };

  return { ok: true, data };
}
