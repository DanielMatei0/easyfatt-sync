const fs = require("fs/promises");
const XLSX = require("xlsx");
const { google } = require("googleapis");
const { authorizeGoogle } = require("./auth");
const { toClientMessage } = require("./errors");
const { buildClearRange, buildUpdateRange } = require("./sheetRange");

const EXCEL_READ_ATTEMPTS = 5;
const EXCEL_READ_DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportProgress(log, percent, message) {
  if (typeof log === "function") {
    log(`__SYNC_PROGRESS__:${percent}:${message}`);
  }
}

async function readExcelWorkbook(excelPath) {
  let lastError;

  for (let attempt = 0; attempt < EXCEL_READ_ATTEMPTS; attempt += 1) {
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

      if (!retryable || attempt === EXCEL_READ_ATTEMPTS - 1) {
        break;
      }

      await sleep(EXCEL_READ_DELAY_MS * (attempt + 1));
    }
  }

  throw new Error(toClientMessage(lastError, "sync"));
}

async function syncExcelToSheets(config, log = () => {}) {
  const { excelPath, spreadsheetId, sheetName } = config;

  if (!excelPath || !spreadsheetId || !sheetName) {
    throw new Error(
      "Config incompleta: seleziona file Excel, Sheet ID e nome foglio."
    );
  }

  reportProgress(log, 10, "Sto leggendo il file clienti");
  log("Sto leggendo il file clienti...");

  const workbook = await readExcelWorkbook(excelPath);
  const sheetNames = workbook.SheetNames || [];

  if (!sheetNames.length) {
    reportProgress(log, 100, "Completato");
    log("Nessun foglio trovato nel file Excel.");
    return { ok: true, rows: 0 };
  }

  const excelSheet = workbook.Sheets[sheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(excelSheet, { defval: "" });

  if (!rows.length) {
    reportProgress(log, 100, "Completato");
    log("Nessun cliente trovato nel file Excel.");
    return { ok: true, rows: 0 };
  }

  reportProgress(log, 35, "Sto preparando i dati");

  const headers = Object.keys(rows[0]);
  const columnCount = headers.length;
  const values = [
    headers,
    ...rows.map((row) => headers.map((header) => row[header] ?? "")),
  ];

  reportProgress(log, 60, "Mi collego a Google Sheets");

  let auth;
  try {
    auth = await authorizeGoogle(log);
  } catch (error) {
    throw new Error(toClientMessage(error, "google"));
  }

  const sheets = google.sheets({ version: "v4", auth });
  const clearRange = buildClearRange(sheetName, columnCount);
  const updateRange = buildUpdateRange(sheetName);

  reportProgress(log, 80, "Sto aggiornando il foglio Google");

  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: clearRange,
    });

    reportProgress(log, 80, "Sto caricando i dati aggiornati");

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  } catch (error) {
    throw new Error(toClientMessage(error, "google"));
  }

  reportProgress(log, 100, "Completato");
  log(`Sincronizzazione completata: ${rows.length} righe.`);

  return {
    ok: true,
    rows: rows.length,
    date: new Date().toISOString(),
  };
}

module.exports = {
  syncExcelToSheets,
};
