/**
 * Helper per range dinamici Google Sheets (colonna A → ultima colonna usata).
 */

function columnIndexToLetter(index) {
  let n = index;
  let letters = "";

  while (n >= 0) {
    letters = String.fromCharCode((n % 26) + 65) + letters;
    n = Math.floor(n / 26) - 1;
  }

  return letters;
}

function escapeSheetName(sheetName) {
  return String(sheetName || "Clienti").replace(/'/g, "''");
}

function buildSheetRange(sheetName, columnCount, startRow = 1) {
  const safeName = escapeSheetName(sheetName);
  const cols = Math.max(1, Number(columnCount) || 1);
  const endCol = columnIndexToLetter(cols - 1);
  const start = startRow > 1 ? startRow : 1;
  return `'${safeName}'!A${start}:${endCol}`;
}

function buildClearRange(sheetName, columnCount) {
  return buildSheetRange(sheetName, columnCount, 1);
}

function buildUpdateRange(sheetName) {
  const safeName = escapeSheetName(sheetName);
  return `'${safeName}'!A1`;
}

module.exports = {
  buildSheetRange,
  buildClearRange,
  buildUpdateRange,
  columnIndexToLetter,
};
