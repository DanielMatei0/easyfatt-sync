/**
 * Client HTTP del server Easyfatt Sync. Ogni errore diventa un CloudError con
 * un `kind` che il chiamante sa gestire: il marketing si ferma, non indovina.
 */
const { apiBase, REQUEST_TIMEOUT_MS } = require("./cloudConstants");
const { loadSession } = require("./tokenStore");

class CloudError extends Error {
  constructor(kind, message, { status = 0, code = "", data = null } = {}) {
    super(message);
    this.kind = kind; // offline | unauthorized | paused | busy | conflict | upgrade | unavailable | invalid | server
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function appVersion() {
  try {
    return require("../../../package.json").version || "";
  } catch {
    return "";
  }
}

function kindFor(status) {
  if (status === 401) return "unauthorized";
  if (status === 423) return "paused";
  if (status === 426) return "upgrade";
  if (status === 409 || status === 410) return "conflict";
  if (status === 429 || status === 503) return "unavailable";
  if (status >= 500) return "server";
  return "invalid";
}

async function request(method, path, { body, token, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "X-App-Version": appVersion(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new CloudError("offline", "Server Aven non raggiungibile. Controlla la connessione internet.");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error || "";
    let kind = kindFor(res.status);
    if (res.status === 409 && code === "busy") kind = "busy";
    throw new CloudError(kind, data?.message || `Errore del server (${res.status})`, { status: res.status, code, data });
  }
  return data;
}

/** Client legato alla sessione salvata. `onUnauthorized` scollega il PC se il token non vale più. */
function createClient(store, { onUnauthorized } = {}) {
  const call = async (method, path, body, opts = {}) => {
    const session = loadSession(store);
    if (!session) throw new CloudError("unauthorized", "Accedi con l'account Aven per usare il marketing.");
    try {
      return await request(method, path, { body, token: session.token, ...opts });
    } catch (err) {
      if (err instanceof CloudError && err.kind === "unauthorized" && typeof onUnauthorized === "function") {
        onUnauthorized(err);
      }
      throw err;
    }
  };
  return {
    me: () => call("GET", "/me"),
    logout: () => call("POST", "/device/logout", {}),
    getConfig: () => call("GET", "/config"),
    putConfig: (base_version, config) => call("PUT", "/config", { base_version, config }),
    migrationStart: (migration_id, config) => call("POST", "/migration/start", { migration_id, config }),
    migrationCustomers: (migration_id, customers) => call("POST", "/migration/customers", { migration_id, customers }),
    migrationLedger: (migration_id, events) => call("POST", "/migration/ledger", { migration_id, events }),
    migrationComplete: (migration_id, config, expected) => call("POST", "/migration/complete", { migration_id, config, expected }),
    startRun: (trigger) => call("POST", "/runs", { trigger }),
    heartbeat: (runId) => call("POST", `/runs/${runId}/heartbeat`, {}),
    finishRun: (runId, status, summary) => call("POST", `/runs/${runId}/finish`, { status, summary }),
    customerState: (customer_keys, card_keys) => call("POST", "/customers/state", { customer_keys, card_keys }),
    lookup: (body) => call("POST", "/sends/lookup", body),
    commit: (runId, customers, events) => call("POST", `/runs/${runId}/commit`, { customers, events }),
    lease: (runId, limit, automation_ids) => call("POST", `/runs/${runId}/lease`, { limit, automation_ids }),
    confirm: (results) => call("POST", "/sends/confirm", { results }),
    deliver: (body) => call("POST", "/sends/deliver", body, { timeoutMs: 60000 }),
    listSends: (params = {}) => call("GET", `/sends?${new URLSearchParams(params)}`),
    sender: (body) => call("POST", "/sender", body, { timeoutMs: 60000 }),
    telemetry: (body) => call("POST", "/telemetry", body),
    requestPasswordCode: () => call("POST", "/account/password/code", {}),
    setPassword: (code, new_password) => call("POST", "/account/password", { code, new_password }),
  };
}

module.exports = { CloudError, request, createClient, appVersion };
