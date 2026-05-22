const { authorizeGoogle } = require("./auth");
const { toClientMessage } = require("./errors");
const { buildClearRange, buildUpdateRange } = require("./sheetRange");
const { validateExcelFile, readWorkbookWithRetry, sheetToRows } = require("./excelUtils");
const { applyColumnMapping, hasActiveMapping } = require("./columnMapping");
const { normalizeRows } = require("./diffEngine");

let cachedGoogleApi = null;

function getGoogleApi() {
  if (!cachedGoogleApi) {
    cachedGoogleApi = require("googleapis").google;
  }
  return cachedGoogleApi;
}

function reportProgress(log, percent, message) {
  if (typeof log === "function") {
    log(`__SYNC_PROGRESS__:${percent}:${message}`);
  }
}

async function syncExcelToSheets(config, log = () => {}) {
  const {
    excelPath,
    spreadsheetId,
    sheetName,
    profileId,
    profileName,
    columnMapping,
  } = config;
  const label = profileName ? String(profileName) : "dati";

  if (!excelPath || !spreadsheetId || !sheetName) {
    throw new Error(
      "Config incompleta: seleziona file Excel, Sheet ID e nome foglio."
    );
  }

  const fileCheck = await validateExcelFile(excelPath);
  if (!fileCheck.ok) {
    throw new Error(fileCheck.message);
  }

  reportProgress(log, 10, `Sto leggendo ${label}`);
  log(`Sto leggendo il file Excel (${label})...`);

  const workbook = await readWorkbookWithRetry(excelPath);
  const { headers, rows } = sheetToRows(workbook);

  if (!headers.length || !rows.length) {
    reportProgress(log, 100, "Completato");
    log("Nessun dato trovato nel file Excel.");
    return { ok: true, rows: 0 };
  }

  reportProgress(log, 35, "Sto preparando i dati");

  const mapped = hasActiveMapping(columnMapping)
    ? applyColumnMapping(headers, rows, columnMapping)
    : applyColumnMapping(headers, rows, []);

  const values = mapped.values;
  const columnCount = values[0]?.length || headers.length;

  reportProgress(log, 60, "Mi collego a Google Sheets");

  let auth;
  try {
    auth = await authorizeGoogle(log);
  } catch (error) {
    throw new Error(toClientMessage(error, "google"));
  }

  const google = getGoogleApi();
  const sheets = google.sheets({ version: "v4", auth });
  const clearRange = buildClearRange(sheetName, columnCount);
  const updateRange = buildUpdateRange(sheetName, columnCount);

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

  const rowCount = Math.max(0, values.length - 1);
  reportProgress(log, 100, "Completato");
  log(`Sincronizzazione completata: ${rowCount} righe.`);

  // Normalizziamo le righe ORIGINALI (pre-mapping) per il diff:
  // l'utente vuole vedere i dati così come sono in Excel.
  let normalizedRows = [];
  try {
    normalizedRows = normalizeRows(headers, rows);
  } catch (_) {
    normalizedRows = [];
  }

  return {
    ok: true,
    rows: rowCount,
    date: new Date().toISOString(),
    profileId: profileId || null,
    headers,
    normalizedRows,
  };
}

module.exports = {
  syncExcelToSheets,
};
