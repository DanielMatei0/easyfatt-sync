/**
 * AvenGest — reporter di monitoraggio (errori · sicurezza · ticket)
 *
 * Invia al gestionale AvenGest (https://admin.aven-labs.com) gli errori runtime,
 * eventuali eventi di sicurezza e i ticket di supporto aperti dall'utente.
 *
 * Regole (vedi AVENGEST_MONITORING.md):
 *  - La chiave API di progetto (`avn_...`) è un SEGRETO: vive solo nel processo main.
 *    Il renderer non la conosce mai: comunica col main via IPC.
 *  - Errori: batch + throttle, coda offline persistita su disco, retry/backoff su 429/5xx.
 *  - Nessun PII o contenuto documenti utente: solo messaggi/stack/metadati tecnici.
 */

const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const BASE_URL = "https://admin.aven-labs.com";
const FLUSH_INTERVAL_MS = 6000;
const MAX_BATCH = 50; // limite server per richiesta
const MAX_QUEUE = 500; // cap coda offline su disco
const REQUEST_TIMEOUT_MS = 15000;

let apiKey = "";
let analyticsKey = "";
let visitorId = "";
let sessionId = "";
let product = "desktop";
let environment = "production";
let enabled = false;
let initialized = false;
let logger = console;

const errorQueue = [];
let flushTimer = null;
let backoffMs = 0; // backoff corrente (429/5xx)
let backoffUntil = 0;
let getScreenFn = null; // opzionale: ritorna la schermata attiva per il context

function setLogger(l) {
  if (l && typeof l.info === "function") logger = l;
}

function queueFilePath() {
  return path.join(app.getPath("userData"), "avengest-queue.json");
}

/**
 * Risolve la chiave API:
 *  1) env `AVENGEST_API_KEY` (dev, o runtime se impostata)
 *  2) file `avengest.config.json` in root (gitignored, bundlato nell'asar per i build)
 */
function resolveApiKey() {
  const fromEnv = String(process.env.AVENGEST_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    // eslint-disable-next-line global-require
    const cfg = require("../../avengest.config.json");
    return String(cfg.apiKey || cfg.AVENGEST_API_KEY || "").trim();
  } catch {
    return "";
  }
}

/**
 * Chiave ANALYTICS (`avnp_...`), diversa dalla chiave API errori/ticket.
 * Da env `AVENGEST_ANALYTICS_KEY` o `avengest.config.json` (campo analyticsKey).
 */
function resolveAnalyticsKey() {
  const fromEnv = String(process.env.AVENGEST_ANALYTICS_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    // eslint-disable-next-line global-require
    const cfg = require("../../avengest.config.json");
    return String(cfg.analyticsKey || cfg.AVENGEST_ANALYTICS_KEY || "").trim();
  } catch {
    return "";
  }
}

function baseContext() {
  let appVersion = "unknown";
  try {
    appVersion = app.getVersion();
  } catch {
    /* app non pronta */
  }
  return {
    appVersion,
    os: `${process.platform} ${os.release()}`,
    arch: process.arch,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  };
}

function activeScreen() {
  if (typeof getScreenFn === "function") {
    try {
      return getScreenFn() || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * POST verso l'API. Ritorna:
 *  - "ok"    → accettato (rimuovi dalla coda)
 *  - "retry" → 429 / 5xx / rete → rimetti in coda e riprova con backoff
 *  - "drop"  → 4xx payload non valido → scarta (evita loop infiniti)
 */
async function post(pathname, body) {
  if (!apiKey) return "drop";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${pathname}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 429 || res.status >= 500) return "retry";
    if (res.status >= 200 && res.status < 300) return "ok";
    return "drop"; // 401/4xx: chiave errata o payload invalido → non ritentare a raffica
  } catch {
    return "retry"; // offline / timeout
  } finally {
    clearTimeout(timeout);
  }
}

async function loadQueue() {
  try {
    const raw = await fs.promises.readFile(queueFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) errorQueue.push(...parsed);
  } catch {
    /* coda vuota o assente */
  }
}

async function saveQueue() {
  try {
    // tieni solo gli ultimi MAX_QUEUE elementi
    if (errorQueue.length > MAX_QUEUE) errorQueue.splice(0, errorQueue.length - MAX_QUEUE);
    await fs.promises.writeFile(queueFilePath(), JSON.stringify(errorQueue), "utf8");
  } catch {
    /* best-effort */
  }
}

function scheduleFlush(delay = FLUSH_INTERVAL_MS) {
  if (!enabled || flushTimer) return;
  flushTimer = setTimeout(runFlush, Math.max(0, delay));
  if (flushTimer.unref) flushTimer.unref();
}

async function runFlush() {
  flushTimer = null;
  if (!enabled || !errorQueue.length) return;

  const now = Date.now();
  if (now < backoffUntil) {
    scheduleFlush(backoffUntil - now);
    return;
  }

  const batch = errorQueue.splice(0, MAX_BATCH);
  const outcome = await post("/api/ingest/errors", { errors: batch });

  if (outcome === "retry") {
    errorQueue.unshift(...batch); // rimetti in testa e riprova con backoff crescente
    backoffMs = Math.min(backoffMs ? backoffMs * 2 : 10000, 5 * 60 * 1000);
    backoffUntil = Date.now() + backoffMs;
    logger.warn?.(`[AvenGest] invio errori rimandato (backoff ${Math.round(backoffMs / 1000)}s)`);
  } else {
    // "ok" o "drop": in entrambi i casi rimuovi dalla coda (drop = payload non valido)
    backoffMs = 0;
    backoffUntil = 0;
  }

  await saveQueue();
  if (errorQueue.length) scheduleFlush();
}

/**
 * Inizializza il reporter. Idempotente. Registra i gestori di errore a livello di
 * processo (uncaughtException / unhandledRejection). I gestori a livello di app
 * (render-process-gone) vanno registrati in main.js dove è disponibile `app`.
 */
function initAvengest(opts = {}) {
  if (initialized) return { enabled };
  initialized = true;

  if (opts.logger) setLogger(opts.logger);
  if (typeof opts.getScreen === "function") getScreenFn = opts.getScreen;

  apiKey = String(opts.apiKey || resolveApiKey() || "").trim();
  analyticsKey = String(opts.analyticsKey || resolveAnalyticsKey() || "").trim();
  visitorId = String(opts.visitorId || "").trim();
  try {
    sessionId = require("crypto").randomUUID();
  } catch {
    sessionId = `s_${Date.now()}`;
  }
  product =
    opts.product ||
    (process.platform === "darwin" ? "desktop-mac" : process.platform === "win32" ? "desktop-win" : "desktop");
  let packaged = false;
  try {
    packaged = app.isPackaged;
  } catch {
    /* non pronta */
  }
  environment = opts.environment || (packaged ? "production" : "dev");
  enabled = !!apiKey;

  if (!enabled && !analyticsKey) {
    logger.info?.("[AvenGest] disabilitato: nessuna chiave (AVENGEST_API_KEY / analyticsKey).");
    return { enabled, analytics: false };
  }

  logger.info?.(
    `[AvenGest] attivo (product=${product}, env=${environment}, errori/ticket=${enabled ? "on" : "off"}, analytics=${analyticsKey ? "on" : "off"}).`
  );

  // Coda offline persistente (solo per errori)
  if (enabled) {
    loadQueue().then(() => {
      if (errorQueue.length) scheduleFlush();
    });
  }

  // Cattura globale a livello di processo
  process.on("uncaughtException", (err) => {
    reportError(err, { fatal: true, kind: "uncaughtException" });
  });
  process.on("unhandledRejection", (reason) => {
    reportError(reason, { fatal: true, kind: "unhandledRejection" });
  });

  return { enabled };
}

/**
 * Accoda un errore. `context` è libero (metadati tecnici); `fatal:true` ⇒ level FATAL.
 */
function reportError(err, context = {}) {
  if (!enabled) return;
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : safeStringify(err));
  const { fatal, url, method, status, ...rest } = context || {};

  errorQueue.push({
    message: String(e.message || "Errore").slice(0, 2000),
    name: String(e.name || "Error").slice(0, 200),
    stack: e.stack ? String(e.stack).slice(0, 20000) : undefined,
    level: fatal ? "FATAL" : context.level || "ERROR",
    product,
    environment,
    url: url ? String(url).slice(0, 1000) : activeScreen(),
    method: method ? String(method).slice(0, 10) : undefined,
    status: typeof status === "number" ? status : undefined,
    context: { ...baseContext(), screen: activeScreen(), ...rest },
  });

  void saveQueue();
  scheduleFlush();
}

/**
 * Evento di sicurezza (fire-and-forget). Usare SOLO se l'app ha login/account,
 * oppure per `SUSPICIOUS` (tampering/licenza non valida).
 */
function reportSecurity(ev = {}) {
  if (!enabled || !ev.type) return;
  let name = "App";
  try {
    name = app.getName();
  } catch {
    /* ignore */
  }
  let version = "";
  try {
    version = app.getVersion();
  } catch {
    /* ignore */
  }
  void post("/api/ingest/security", {
    type: ev.type,
    product,
    email: ev.email,
    ip: ev.ip,
    path: ev.path,
    detail: ev.detail,
    user_agent: `Electron/${name} ${version} (${process.platform})`,
  });
}

/**
 * Apre un ticket di supporto. Ritorna { ok, ticketId, status, message }.
 */
async function openTicket(input = {}) {
  if (!enabled) {
    return { ok: false, message: "Monitoraggio non configurato (chiave API mancante)." };
  }
  const subject = String(input.subject || "").trim();
  const description = String(input.description || "").trim();
  if (!subject || !description) {
    return { ok: false, message: "Oggetto e descrizione sono obbligatori." };
  }

  const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
  const priority = priorities.includes(input.priority) ? input.priority : "NORMAL";

  const body = {
    subject: subject.slice(0, 300),
    description: description.slice(0, 10000),
    priority,
    external_ref: input.external_ref ? String(input.external_ref).slice(0, 200) : undefined,
  };
  if (input.external_user && (input.external_user.name || input.external_user.email)) {
    body.external_user = {
      name: input.external_user.name ? String(input.external_user.name).slice(0, 200) : undefined,
      email: input.external_user.email ? String(input.external_user.email).slice(0, 200) : undefined,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/ingest/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        message: data?.message || `Invio ticket non riuscito (${res.status}).`,
      };
    }
    return { ok: true, ticketId: data.ticket_id, status: data.status || "OPEN" };
  } catch (error) {
    return {
      ok: false,
      message: error?.name === "AbortError" ? "Timeout invio ticket." : "Errore di rete durante l'invio del ticket.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Elenca i ticket (per mostrarne lo stato nell'app). Filtri opzionali.
 */
async function listTickets({ externalRef, externalUserEmail } = {}) {
  if (!enabled) return { ok: false, tickets: [] };
  const params = new URLSearchParams();
  if (externalRef) params.set("external_ref", externalRef);
  if (externalUserEmail) params.set("external_user_email", externalUserEmail);
  const qs = params.toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/ingest/tickets${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, tickets: [] };
    return { ok: true, tickets: Array.isArray(data.tickets) ? data.tickets : [] };
  } catch {
    return { ok: false, tickets: [] };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Invia un evento analytics (pageview/event/click). Canale separato dagli errori:
 * usa la chiave `avnp_...` via header `x-analytics-key`. Best-effort, fire-and-forget.
 */
async function trackAnalytics(ev = {}) {
  if (!analyticsKey) return;
  const type = ["pageview", "event", "click"].includes(ev.type) ? ev.type : "pageview";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    await fetch(`${BASE_URL}/api/ingest/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-analytics-key": analyticsKey },
      body: JSON.stringify({
        product,
        type,
        name: ev.name ? String(ev.name).slice(0, 120) : undefined,
        path: ev.path ? String(ev.path).slice(0, 400) : undefined,
        session_id: sessionId || undefined,
        visitor_id: visitorId || undefined,
        duration_ms:
          typeof ev.durationMs === "number" && ev.durationMs >= 0 ? Math.round(ev.durationMs) : undefined,
      }),
      signal: controller.signal,
    });
  } catch {
    /* best-effort: le analitiche non devono mai disturbare l'app */
  } finally {
    clearTimeout(timeout);
  }
}

function isEnabled() {
  return enabled;
}

function isAnalyticsEnabled() {
  return !!analyticsKey;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

module.exports = {
  initAvengest,
  reportError,
  reportSecurity,
  openTicket,
  listTickets,
  trackAnalytics,
  isEnabled,
  isAnalyticsEnabled,
  resolveApiKey,
  resolveAnalyticsKey,
};
