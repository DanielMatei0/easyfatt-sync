/**
 * Server di Easyfatt Sync (aven-labs.com). In sviluppo, e SOLO fuori dall'app
 * installata, si può puntare a un server locale con EASYFATT_CLOUD_ORIGIN.
 */
const PRODUCTION_ORIGIN = "https://aven-labs.com";

function isPackaged() {
  try {
    return require("electron").app.isPackaged;
  } catch {
    return false;
  }
}

function cloudOrigin() {
  const override = String(process.env.EASYFATT_CLOUD_ORIGIN || "").trim().replace(/\/$/, "");
  if (override && !isPackaged()) return override;
  return PRODUCTION_ORIGIN;
}

module.exports = {
  cloudOrigin,
  apiBase: () => `${cloudOrigin()}/api/easyfatt`,
  connectPageUrl: () => `${cloudOrigin()}/easyfatt/collega`,
  REQUEST_TIMEOUT_MS: 30000,
  LOGIN_TIMEOUT_MS: 5 * 60 * 1000,
  /** Tetti Gmail prudenziali (account Google personali: ~500 invii/giorno). */
  MAX_SENDS_PER_RUN: 150,
  MAX_SENDS_PER_DAY: 400,
  LEASE_BATCH: 20,
  COMMIT_CHUNK: 400,
};
