const ISSUE_TYPE_LABELS = {
  google: "Collegamento Google",
  excel: "File Excel / Easyfatt",
  sync: "Sincronizzazione",
  updates: "Aggiornamenti",
  other: "Altro",
};

function resolveIssueTypeLabel(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  return ISSUE_TYPE_LABELS[key] || key;
}

module.exports = {
  ISSUE_TYPE_LABELS,
  resolveIssueTypeLabel,
};
