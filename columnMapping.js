/**
 * Mapping colonne Excel → Google Sheets per profilo.
 */

function normalizeMapping(mapping) {
  if (!Array.isArray(mapping)) return [];
  return mapping
    .map((m) => ({
      excelColumn: String(m.excelColumn || "").trim(),
      sheetColumn: String(m.sheetColumn || "").trim(),
    }))
    .filter((m) => m.excelColumn && m.sheetColumn);
}

function hasActiveMapping(mapping) {
  return normalizeMapping(mapping).length > 0;
}

function applyColumnMapping(headers, rows, mapping) {
  const rules = normalizeMapping(mapping);
  if (!rules.length) {
    return {
      headers,
      rows,
      values: [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ""))],
    };
  }

  const sheetHeaders = rules.map((r) => r.sheetColumn);
  const mappedRows = rows.map((row) =>
    rules.map((rule) => {
      const val = row[rule.excelColumn];
      return val != null ? val : "";
    })
  );

  return {
    headers: sheetHeaders,
    rows: mappedRows.map((cells) => {
      const obj = {};
      sheetHeaders.forEach((h, i) => {
        obj[h] = cells[i];
      });
      return obj;
    }),
    values: [sheetHeaders, ...mappedRows],
  };
}

function buildDefaultMapping(headers, sheetHeaders = []) {
  return headers.map((excelColumn) => {
    const match = sheetHeaders.find(
      (s) => s.toLowerCase() === excelColumn.toLowerCase()
    );
    return {
      excelColumn,
      sheetColumn: match || excelColumn,
    };
  });
}

module.exports = {
  normalizeMapping,
  hasActiveMapping,
  applyColumnMapping,
  buildDefaultMapping,
};
