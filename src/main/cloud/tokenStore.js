/**
 * Token del PC collegato all'account Aven. Cifrato con il portachiavi del
 * sistema (Electron safeStorage); senza cifratura disponibile non si salva.
 */
const STORE_KEY = "cloud.device";

function getSafeStorage() {
  try {
    return require("electron").safeStorage;
  } catch {
    return null;
  }
}

function saveSession(store, session) {
  const safe = getSafeStorage();
  if (!safe || !safe.isEncryptionAvailable()) {
    throw new Error("Cifratura del sistema non disponibile: impossibile salvare l'accesso in sicurezza.");
  }
  const { token, ...info } = session;
  store.set(STORE_KEY, { ...info, token_enc: safe.encryptString(token).toString("base64") });
}

function loadSession(store) {
  const raw = store.get(STORE_KEY);
  if (!raw || !raw.token_enc) return null;
  const safe = getSafeStorage();
  if (!safe || !safe.isEncryptionAvailable()) return null;
  try {
    const token = safe.decryptString(Buffer.from(raw.token_enc, "base64"));
    const { token_enc, ...info } = raw;
    return { ...info, token };
  } catch {
    return null;
  }
}

/** Informazioni mostrabili (senza token). */
function sessionInfo(store) {
  const raw = store.get(STORE_KEY);
  if (!raw || !raw.token_enc) return null;
  const { token_enc, ...info } = raw;
  return info;
}

function updateSessionInfo(store, patch) {
  const raw = store.get(STORE_KEY);
  if (!raw) return;
  store.set(STORE_KEY, { ...raw, ...patch });
}

function clearSession(store) {
  store.delete(STORE_KEY);
}

module.exports = { saveSession, loadSession, sessionInfo, updateSessionInfo, clearSession };
