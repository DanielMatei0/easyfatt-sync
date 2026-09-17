const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const { parseDate, mapRowToCustomer } = require("../src/main/marketingEngine");
const { readWorkbookWithRetry, sheetToRows } = require("../src/main/excelUtils");
const rules = require("../src/main/cloud/marketingRules");
const { renderMarketingEmail, createStarterBlocks } = require("../src/main/emailTemplateRenderer");

/** File con la stessa struttura dell'export clienti di Danea usato dalla cliente (dati finti). */
function writeDaneaLike(file) {
  const ws = XLSX.utils.aoa_to_sheet([
    ["", "Denominazione", "Cod. tessera", "Punti fedeltà", "e-mail", "Cell.", "Sesso", "Compleanno", "Referente"],
    ["xx", "Rossi Anna", "", 101, "anna.rossi@esempio.it", 3330000000, "F", 46199, "Anna"],
    ["", "Bianchi", "", 110, "bianchi@esempio.it", "", "M", 46192, ""],
    ["", "Verdi Studio", "", 150, "verdi@esempio.it", "", "", "", ""],
    ["", "Nato Anni Quaranta", "T9", 0, "nonno@esempio.it", "", "M", 16250, ""],
  ]);
  // Date formattate gg/mm come nel file della cliente.
  ["H2", "H3", "H5"].forEach((ref) => (ws[ref].z = "dd/mm"));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clienti");
  XLSX.writeFile(wb, file);
}

const MAPPING = { firstName: "Referente", lastName: "Denominazione", email: "e-mail", points: "Punti fedeltà", fidelityCardNumber: "Cod. tessera", birthDate: "Compleanno", phone: "Cell." };

test("export Danea: date gg/mm lette come compleanni, anche nati prima del 1954", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "danea-")), "Clienti.xlsx");
  writeDaneaLike(file);
  const { rows } = sheetToRows(await readWorkbookWithRetry(file));
  const customers = rows.map((r) => mapRowToCustomer(r, MAPPING));
  assert.equal(customers.length, 4);
  const anna = customers[0];
  assert.equal(anna.email, "anna.rossi@esempio.it");
  assert.equal(anna.points, 101);
  assert.equal(anna.birthDate.getDate(), 26);
  assert.equal(anna.birthDate.getMonth(), 5);
  assert.ok(rules.isBirthdayToday(anna.birthDate, new Date(2027, 5, 26, 9)), "compleanno ogni anno, non solo quello salvato");
  assert.equal(customers[1].birthDate.getDate(), 19);
  assert.equal(customers[2].birthDate, null);
  assert.equal(customers[3].birthDate.getFullYear(), 1944);
});

test("date in testo: gg/mm senza anno e formati comuni", () => {
  const d = parseDate("26/06");
  assert.equal(d.getDate(), 26);
  assert.equal(d.getMonth(), 5);
  assert.equal(parseDate("29/02").getDate(), 29);
  assert.equal(parseDate("31/02"), null);
  assert.equal(parseDate("26/06/1990").getFullYear(), 1990);
  assert.equal(parseDate("12345"), null, "un codice testuale non diventa una data");
});

test("email vere senza dati d'esempio: nome, tessera e punti mancanti restano vuoti", () => {
  const cfg = { businessName: "Negozio" };
  const customer = { firstName: "", lastName: "Bianchi", email: "bianchi@esempio.it", points: null, fidelityCardNumber: "", birthDate: null };
  for (const type of ["birthday", "points_threshold", "new_fidelity", "inactive_customer"]) {
    const tpl = { subject: "Ciao {{firstName}}, auguri", blocks: createStarterBlocks(type, () => Math.random().toString(36).slice(2)) };
    const out = renderMarketingEmail(tpl, cfg, customer, { threshold: "60", reward: "Caffè" });
    for (const sample of ["Mario", "Rossi", "FID-12345", "15 maggio", "{{"]) {
      assert.ok(!out.subject.includes(sample) && !out.bodyHtml.includes(sample), `${type}: "${sample}" nell'email`);
    }
    assert.equal(out.subject, "Ciao, auguri");
  }
  const preview = renderMarketingEmail({ subject: "Ciao {{firstName}}", blocks: [] }, cfg, null, {});
  assert.equal(preview.subject, "Ciao Mario", "le anteprime senza cliente usano ancora i dati d'esempio");
});
