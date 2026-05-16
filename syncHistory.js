/**
 * Cronologia sincronizzazioni (electron-store, max 500 eventi).
 *
 * Per ogni evento di successo viene salvato anche un piccolo `diffSummary`
 * inline. I `diffDetails` (righe aggiunte/modificate/rimosse complete) sono
 * persistiti in una mappa separata `syncHistoryDiffs` limitata agli ultimi
 * MAX_DIFF_EVENTS per non far crescere l'app oltremisura.
 */

const crypto = require("crypto");

const HISTORY_KEY = "syncHistory";
const DIFF_KEY = "syncHistoryDiffs";
const MAX_EVENTS = 500;
const MAX_DIFF_EVENTS = 50;
const MAX_DIFF_ROWS_DETAIL = 500;
const MAX_FIELD_VALUE_LEN = 500;

function createEventId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getHistory(store) {
  const raw = store.get(HISTORY_KEY);
  return Array.isArray(raw) ? raw : [];
}

function setHistory(store, events) {
  store.set(HISTORY_KEY, events.slice(0, MAX_EVENTS));
}

function getDiffs(store) {
  const raw = store.get(DIFF_KEY);
  return raw && typeof raw === "object" ? raw : {};
}

function truncateValue(v) {
  if (v == null) return "";
  const s = String(v);
  return s.length > MAX_FIELD_VALUE_LEN
    ? s.slice(0, MAX_FIELD_VALUE_LEN) + "…"
    : s;
}

function truncateRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = truncateValue(v);
  }
  return out;
}

function sanitizeDiffDetails(diff) {
  if (!diff || typeof diff !== "object") return null;

  const truncatedAdded =
    Array.isArray(diff.added) && diff.added.length > MAX_DIFF_ROWS_DETAIL;
  const truncatedRemoved =
    Array.isArray(diff.removed) && diff.removed.length > MAX_DIFF_ROWS_DETAIL;
  const truncatedModified =
    Array.isArray(diff.modified) &&
    diff.modified.length > MAX_DIFF_ROWS_DETAIL;

  const limit = (arr) =>
    Array.isArray(arr) ? arr.slice(0, MAX_DIFF_ROWS_DETAIL) : [];

  return {
    added: limit(diff.added).map((r) => ({
      key: r.key,
      label: r.label,
      row: truncateRow(r.row),
    })),
    removed: limit(diff.removed).map((r) => ({
      key: r.key,
      label: r.label,
      row: truncateRow(r.row),
    })),
    modified: limit(diff.modified).map((r) => ({
      key: r.key,
      label: r.label,
      changedFields: Array.isArray(r.changedFields)
        ? r.changedFields.map((f) => ({
            field: String(f.field),
            before: truncateValue(f.before),
            after: truncateValue(f.after),
          }))
        : [],
    })),
    unchangedCount: Number(diff.unchangedCount) || 0,
    totalBefore: Number(diff.totalBefore) || 0,
    totalAfter: Number(diff.totalAfter) || 0,
    truncated: Boolean(
      diff.truncated || truncatedAdded || truncatedRemoved || truncatedModified
    ),
    reason: diff.reason || null,
  };
}

function buildSummaryFromDiff(diff) {
  if (!diff || typeof diff !== "object") return null;
  return {
    addedCount: Array.isArray(diff.added) ? diff.added.length : 0,
    removedCount: Array.isArray(diff.removed) ? diff.removed.length : 0,
    modifiedCount: Array.isArray(diff.modified) ? diff.modified.length : 0,
    unchangedCount: Number(diff.unchangedCount) || 0,
    totalBefore: Number(diff.totalBefore) || 0,
    totalAfter: Number(diff.totalAfter) || 0,
    truncated: Boolean(diff.truncated),
    firstSnapshot: Boolean(diff.firstSnapshot),
  };
}

function pruneDiffs(store, history) {
  const diffs = getDiffs(store);
  const keepIds = new Set(history.slice(0, MAX_DIFF_EVENTS).map((e) => e.id));
  let changed = false;
  for (const id of Object.keys(diffs)) {
    if (!keepIds.has(id)) {
      delete diffs[id];
      changed = true;
    }
  }
  if (changed) store.set(DIFF_KEY, diffs);
}

function storeDiffDetails(store, eventId, diff) {
  if (!eventId || !diff) return;
  const sanitized = sanitizeDiffDetails(diff);
  if (!sanitized) return;
  const all = getDiffs(store);
  all[eventId] = sanitized;
  store.set(DIFF_KEY, all);
}

function getDiffDetails(store, eventId) {
  if (!eventId) return null;
  const all = getDiffs(store);
  return all[eventId] || null;
}

function recordSyncEvent(store, event) {
  const diffSummary =
    event.diffSummary || buildSummaryFromDiff(event.diffDetails);

  const entry = {
    id: createEventId(),
    at: new Date().toISOString(),
    profileId: event.profileId || null,
    profileName: event.profileName || "Sync",
    status: event.status === "error" ? "error" : "success",
    rows: Number(event.rows) || 0,
    durationMs: Number(event.durationMs) || 0,
    message: event.message || "",
    trigger: event.trigger || "manual",
    excelFile: event.excelFile || null,
    sheetName: event.sheetName || null,
    diffSummary: diffSummary || null,
    hasDiffDetails: Boolean(event.diffDetails),
  };

  const history = getHistory(store);
  history.unshift(entry);
  setHistory(store, history);

  if (event.diffDetails) {
    storeDiffDetails(store, entry.id, event.diffDetails);
    pruneDiffs(store, history);
  }

  return entry;
}

function filterHistory(history, filters = {}) {
  let list = [...history];

  if (filters.profileId) {
    list = list.filter((e) => e.profileId === filters.profileId);
  }

  if (filters.status && filters.status !== "all") {
    list = list.filter((e) => e.status === filters.status);
  }

  return list;
}

function getRowsSyncedToday(history) {
  const today = new Date();
  return history
    .filter((e) => {
      if (e.status !== "success") return false;
      const d = new Date(e.at);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    })
    .reduce((sum, e) => sum + (Number(e.rows) || 0), 0);
}

function getRecentErrors(history, limit = 5) {
  return history.filter((e) => e.status === "error").slice(0, limit);
}

function exportHistoryReport(history, filters = {}, options = {}) {
  const filtered = filterHistory(history, filters);
  // Per privacy NON includiamo i diffDetails completi: solo summary inline.
  const safe = filtered.map((e) => {
    const copy = { ...e };
    if (!options.includeDiffDetails) {
      delete copy.hasDiffDetails;
    }
    return copy;
  });
  return {
    exportedAt: new Date().toISOString(),
    total: safe.length,
    events: safe,
    note:
      "Le differenze dati di dettaglio (righe aggiunte/modificate/rimosse) restano sul tuo dispositivo e non sono incluse in questo report.",
  };
}

function clearHistory(store) {
  store.set(HISTORY_KEY, []);
  store.set(DIFF_KEY, {});
}

module.exports = {
  HISTORY_KEY,
  DIFF_KEY,
  MAX_EVENTS,
  MAX_DIFF_EVENTS,
  MAX_DIFF_ROWS_DETAIL,
  getHistory,
  recordSyncEvent,
  filterHistory,
  getRowsSyncedToday,
  getRecentErrors,
  exportHistoryReport,
  clearHistory,
  getDiffDetails,
  storeDiffDetails,
  pruneDiffs,
  sanitizeDiffDetails,
  buildSummaryFromDiff,
};
