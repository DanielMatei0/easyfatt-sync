/**
 * syncSnapshots.js
 *
 * Persistenza locale degli snapshot di dati normalizzati per ciascun profilo.
 * Usati come riferimento per il calcolo del diff alla sync successiva.
 *
 * Memorizzati in electron-store sotto la chiave "profileDataSnapshots".
 * Struttura:
 * {
 *   [profileId]: {
 *     updatedAt: string ISO,
 *     headers: string[],
 *     rows: NormalizedRow[],   // max MAX_SNAPSHOT_ROWS
 *     truncated: boolean,
 *     originalRowCount: number
 *   }
 * }
 *
 * Privacy: i dati restano sul dispositivo, non sono mai inviati al supporto.
 */

const SNAPSHOTS_KEY = "profileDataSnapshots";
const MAX_SNAPSHOT_ROWS = 5000;

function readAll(store) {
  const raw = store.get(SNAPSHOTS_KEY);
  return raw && typeof raw === "object" ? raw : {};
}

function getSnapshot(store, profileId) {
  if (!profileId) return null;
  const all = readAll(store);
  return all[profileId] || null;
}

function setSnapshot(store, profileId, headers, rows) {
  if (!profileId) return;
  const all = readAll(store);
  const safeRows = Array.isArray(rows) ? rows : [];
  const truncated = safeRows.length > MAX_SNAPSHOT_ROWS;
  all[profileId] = {
    updatedAt: new Date().toISOString(),
    headers: Array.isArray(headers) ? headers.map(String) : [],
    rows: truncated ? safeRows.slice(0, MAX_SNAPSHOT_ROWS) : safeRows,
    truncated,
    originalRowCount: safeRows.length,
  };
  store.set(SNAPSHOTS_KEY, all);
}

function clearSnapshot(store, profileId) {
  if (!profileId) return;
  const all = readAll(store);
  if (all[profileId]) {
    delete all[profileId];
    store.set(SNAPSHOTS_KEY, all);
  }
}

function clearAllSnapshots(store) {
  store.set(SNAPSHOTS_KEY, {});
}

function pruneOrphanSnapshots(store, validProfileIds) {
  const all = readAll(store);
  const valid = new Set(validProfileIds || []);
  let changed = false;
  for (const id of Object.keys(all)) {
    if (!valid.has(id)) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) store.set(SNAPSHOTS_KEY, all);
}

module.exports = {
  SNAPSHOTS_KEY,
  MAX_SNAPSHOT_ROWS,
  getSnapshot,
  setSnapshot,
  clearSnapshot,
  clearAllSnapshots,
  pruneOrphanSnapshots,
};
