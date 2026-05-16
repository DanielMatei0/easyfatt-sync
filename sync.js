const XLSX = require("xlsx");
const { google } = require("googleapis");
const { authorizeGoogle } = require("./auth");

function reportProgress(log, percent, message) {
  if (typeof log === "function") {
    log(`__SYNC_PROGRESS__:${percent}:${message}`);
  }
}

async function syncExcelToSheets(config, log = console.log) {
  const { excelPath, spreadsheetId, sheetName } = config;

  reportProgress(log, 10, "Sto leggendo il file clienti");
  log("Sto leggendo il file clienti...");

  const workbook = XLSX.readFile(excelPath);
  const excelSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(excelSheet, { defval: "" });

  if (!rows.length) {
    reportProgress(log, 100, "Completato");
    log("Nessun cliente trovato nel file Excel.");
    return { ok: true, rows: 0 };
  }

  reportProgress(log, 35, "Sto preparando i dati");

  const headers = Object.keys(rows[0]);
  const values = [
    headers,
    ...rows.map((row) => headers.map((header) => row[header] ?? "")),
  ];

  reportProgress(log, 60, "Mi collego a Google Sheets");
  const auth = await authorizeGoogle(log);
  const sheets = google.sheets({ version: "v4", auth });

  reportProgress(log, 80, "Sto aggiornando il foglio Google");

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheetName}'!A:Z`,
  });

  reportProgress(log, 80, "Sto caricando i dati aggiornati");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

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