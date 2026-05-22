/**
 * diffEngine.js
 *
 * Confronto stile GitHub diff tra due snapshot di righe Excel.
 * - normalizeRows / normalizeRow: trim + string casting consistente
 * - getRowKey: chiave stabile per identificare la stessa riga tra sync
 * - calculateDiff: produce { added, removed, modified, unchangedCount, ... }
 *
 * Performance:
 * - se totale righe (prima + dopo) supera MAX_DIFF_TOTAL: ritorna solo summary, no dettagli
 * - mai blocca: chiamare in try/catch nel runner
 */

const crypto = require("crypto");

const MAX_DIFF_TOTAL = 20000;

const DEFAULT_KEY_COLUMNS = [
  "Codice",
  "Codice cliente",
  "Codice Cliente",
  "Cod. Cliente",
  "Cod Cliente",
  "ID",
  "Id",
  "id",
  "Email",
  "E-mail",
  "Email cliente",
  "Telefono",
  "Cellulare",
  "Mobile",
  "P.IVA",
  "P. IVA",
  "Partita IVA",
  "Codice Fiscale",
];

function normalizeValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (Number.isFinite(v)) return String(v);
    return "";
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  return s;
}

function normalizeRow(headers, row) {
  const obj = {};
  if (Array.isArray(row)) {
    headers.forEach((h, i) => {
      const key = String(h ?? `col_${i}`);
      obj[key] = normalizeValue(row[i]);
    });
  } else if (row && typeof row === "object") {
    headers.forEach((h, i) => {
      const key = String(h ?? `col_${i}`);
      obj[key] = normalizeValue(row[key]);
    });
  }
  return obj;
}

function normalizeRows(headers, rows) {
  if (!Array.isArray(rows)) return [];
  const safeHeaders = Array.isArray(headers) ? headers : [];
  return rows.map((r) => normalizeRow(safeHeaders, r));
}

function findKeyColumn(row, profile) {
  if (!row || typeof row !== "object") return null;
  if (profile?.primaryKeyColumn) {
    const k = String(profile.primaryKeyColumn);
    if (row[k] !== undefined && normalizeValue(row[k])) {
      return { strategy: "profile", column: k };
    }
  }
  for (const candidate of DEFAULT_KEY_COLUMNS) {
    if (row[candidate] !== undefined && normalizeValue(row[candidate])) {
      return { strategy: "auto", column: candidate };
    }
  }
  return null;
}

function hashRow(row) {
  const flat = Object.keys(row)
    .sort()
    .map((k) => `${k}=${normalizeValue(row[k])}`)
    .join("|");
  return crypto.createHash("md5").update(flat).digest("hex").slice(0, 16);
}

function getRowKey(row, profile) {
  const found = findKeyColumn(row, profile);
  if (found) {
    return `${found.strategy}:${found.column}:${normalizeValue(row[found.column]).toLowerCase()}`;
  }
  return `hash:${hashRow(row)}`;
}

function getDisplayLabel(row, profile) {
  if (!row || typeof row !== "object") return "—";
  if (profile?.displayColumn && row[profile.displayColumn]) {
    return normalizeValue(row[profile.displayColumn]);
  }
  const labelCandidates = [
    "Nome",
    "Nome cliente",
    "Ragione sociale",
    "Ragione Sociale",
    "Denominazione",
    "Cognome",
    "Descrizione",
  ];
  for (const c of labelCandidates) {
    if (row[c] && normalizeValue(row[c])) return normalizeValue(row[c]);
  }
  const found = findKeyColumn(row, profile);
  if (found) return normalizeValue(row[found.column]);
  const first = Object.values(row).find((v) => normalizeValue(v));
  return first ? normalizeValue(first) : "Riga senza titolo";
}

function calculateDiff(previousRows, currentRows, profile) {
  const prev = Array.isArray(previousRows) ? previousRows : [];
  const curr = Array.isArray(currentRows) ? currentRows : [];

  const totalBefore = prev.length;
  const totalAfter = curr.length;

  if (totalBefore + totalAfter > MAX_DIFF_TOTAL) {
    return {
      added: [],
      removed: [],
      modified: [],
      unchangedCount: 0,
      totalBefore,
      totalAfter,
      truncated: true,
      reason: "tooLarge",
    };
  }

  const prevMap = new Map();
  const currMap = new Map();

  for (const row of prev) {
    const key = getRowKey(row, profile);
    if (!prevMap.has(key)) prevMap.set(key, row);
  }
  for (const row of curr) {
    const key = getRowKey(row, profile);
    if (!currMap.has(key)) currMap.set(key, row);
  }

  const added = [];
  const removed = [];
  const modified = [];
  let unchangedCount = 0;

  for (const [key, currRow] of currMap.entries()) {
    if (!prevMap.has(key)) {
      added.push({
        key,
        label: getDisplayLabel(currRow, profile),
        row: currRow,
      });
      continue;
    }
    const prevRow = prevMap.get(key);
    const changedFields = [];
    const allFields = new Set([
      ...Object.keys(prevRow || {}),
      ...Object.keys(currRow || {}),
    ]);
    for (const field of allFields) {
      const before = normalizeValue(prevRow?.[field]);
      const after = normalizeValue(currRow?.[field]);
      if (before !== after) {
        changedFields.push({ field, before, after });
      }
    }
    if (changedFields.length > 0) {
      modified.push({
        key,
        label: getDisplayLabel(currRow, profile),
        before: prevRow,
        after: currRow,
        changedFields,
      });
    } else {
      unchangedCount++;
    }
  }

  for (const [key, prevRow] of prevMap.entries()) {
    if (!currMap.has(key)) {
      removed.push({
        key,
        label: getDisplayLabel(prevRow, profile),
        row: prevRow,
      });
    }
  }

  return {
    added,
    removed,
    modified,
    unchangedCount,
    totalBefore,
    totalAfter,
    truncated: false,
  };
}

module.exports = {
  MAX_DIFF_TOTAL,
  DEFAULT_KEY_COLUMNS,
  normalizeValue,
  normalizeRow,
  normalizeRows,
  getRowKey,
  getDisplayLabel,
  calculateDiff,
};
