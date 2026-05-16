#!/usr/bin/env node
/**
 * Genera assets/icon.ico da assets/icon.png (richiesto per installer NSIS Windows).
 * Uso: node scripts/generate-icon-ico.js
 * Richiede: npx png-to-ico (scaricato al volo) oppure Pillow (pip install pillow).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PNG = path.join(ROOT, "assets", "icon.png");
const ICO = path.join(ROOT, "assets", "icon.ico");

if (!fs.existsSync(PNG)) {
  console.error("Manca assets/icon.png");
  process.exit(1);
}

try {
  execSync(`npx --yes png-to-ico "${PNG}" > "${ICO}"`, {
    stdio: "inherit",
    cwd: ROOT,
  });
  console.log("Creato:", ICO);
  process.exit(0);
} catch {
  console.error(
    "Impossibile generare icon.ico automaticamente.\n" +
      "Su Windows/macOS installa ImageMagick o esegui:\n" +
      "  npx png-to-ico assets/icon.png > assets/icon.ico\n" +
      "Oppure usa un convertitore online da PNG 1024×1024 a ICO multi-size."
  );
  process.exit(1);
}
