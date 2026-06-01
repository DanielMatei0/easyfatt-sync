const fs = require("fs/promises");
const path = require("path");
const XLSX = require("xlsx");
const { toClientMessage } = require("./errors");

const READ_ATTEMPTS = 5;
const READ_DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function validateExcelFile(excelPath) {
  if (!excelPath || !String(excelPath).trim()) {
    return { ok: false, code: "missing", message: "Nessun file Excel selezionato." };
  }

  try {
    await fs.access(excelPath);
  } catch {
    return {
      ok: false,
      code: "not_found",
      message: `File non trovato: ${path.basename(excelPath)}`,
    };
  }

  let stat;
  try {
    stat = await fs.stat(excelPath);
  } catch {
    return { ok: false, code: "unreadable", message: "Impossibile leggere il file Excel." };
  }

  if (!stat.isFile()) {
    return { ok: false, code: "not_file", message: "Il percorso non è un file valido." };
  }

  if (stat.size === 0) {
    return { ok: false, code: "empty", message: "Il file Excel è vuoto." };
  }

  return { ok: true, stat };
}

async function readWorkbookWithRetry(excelPath) {
  const validation = await validateExcelFile(excelPath);
  if (!validation.ok) {
    const err = new Error(validation.message);
    err.code = validation.code;
    throw err;
  }

  let lastError;
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    try {
      const buffer = await fs.readFile(excelPath);
      return XLSX.read(buffer, { type: "buffer", cellDates: false });
    } catch (error) {
      lastError = error;
      const retryable =
        error.code === "EBUSY" ||
        error.code === "EPERM" ||
        error.code === "EACCES" ||
        /EBUSY|EPERM|EACCES|locked|in use/i.test(error.message || "");

      if (!retryable || attempt === READ_ATTEMPTS - 1) break;
      await sleep(READ_DELAY_MS * (attempt + 1));
    }
  }

  const err = new Error(toClientMessage(lastError, "sync"));
  err.code = lastError?.code;
  throw err;
}

async function previewExcelFile(excelPath, maxRows = 5) {
  const validation = await validateExcelFile(excelPath);
  const fileSize = validation.ok ? validation.stat?.size || 0 : 0;

  const workbook = await readWorkbookWithRetry(excelPath);
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) {
    return { ok: true, headers: [], rows: [], sheetName: null, fileSize, totalRows: 0 };
  }

  const sheet = workbook.Sheets[sheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });
  const headers = (json[0] || []).map((h) => String(h ?? "").trim());
  const dataRows = json.slice(1, 1 + maxRows).map((row) =>
    headers.map((_, i) => String(row[i] ?? "").trim())
  );

  return {
    ok: true,
    headers,
    rows: dataRows,
    sheetName: sheetNames[0],
    totalRows: Math.max(0, json.length - 1),
    fileSize,
  };
}

function sheetToRows(workbook) {
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) return { headers: [], rows: [] };

  const headers = Object.keys(rows[0]);
  return { headers, rows };
}

module.exports = {
  validateExcelFile,
  readWorkbookWithRetry,
  previewExcelFile,
  sheetToRows,
};
