#!/usr/bin/env node
/**
 * Controllo non bloccante prima del push: avvisa se file sensibili esistono in locale.
 * Non verifica la history Git; usare anche `git status` e .gitignore.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const SENSITIVE_PATHS = [
  "oauth_credentials.json",
  "token.json",
  ".env",
  ".env.local",
  ".env.production",
];

const SENSITIVE_DIRS = ["dist", "release", "out", "logs", "backups"];

const SENSITIVE_GLOBS = [".dmg", ".exe", ".blockmap", ".easyfatt-sync-backup.json"];

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function scanDir(dir, warnings, depth = 0) {
  if (depth > 4) return;
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return;

  let entries;
  try {
    entries = fs.readdirSync(full, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const rel = path.join(dir, entry.name);
    const lower = entry.name.toLowerCase();

    if (SENSITIVE_GLOBS.some((ext) => lower.endsWith(ext))) {
      warnings.push(`Trovato artefatto sensibile: ${rel}`);
    }

    if (entry.isDirectory()) {
      scanDir(rel, warnings, depth + 1);
    }
  }
}

function main() {
  const warnings = [];

  for (const rel of SENSITIVE_PATHS) {
    if (exists(rel)) {
      warnings.push(
        `Presente in locale (deve restare fuori da Git): ${rel}`
      );
    }
  }

  for (const dir of SENSITIVE_DIRS) {
    if (exists(dir)) {
      warnings.push(`Cartella build/log presente (deve essere in .gitignore): ${dir}/`);
      scanDir(dir, warnings);
    }
  }

  if (!exists("oauth_credentials.example.json")) {
    warnings.push("Manca oauth_credentials.example.json (template per sviluppatori).");
  }

  if (exists("oauth_credentials.json")) {
    const raw = fs.readFileSync(path.join(ROOT, "oauth_credentials.json"), "utf8");
    if (/YOUR_GOOGLE_OAUTH|placeholder/i.test(raw)) {
      warnings.push(
        "oauth_credentials.json sembra ancora un placeholder: sostituire con credenziali reali solo in locale."
      );
    }
  }

  console.log("Easyfatt Sync — security check\n");

  if (warnings.length === 0) {
    console.log("Nessun avviso. Ricorda comunque: git status prima del push.\n");
    process.exit(0);
  }

  console.log("Avvisi (non bloccanti):\n");
  warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  console.log("\nVerifica .gitignore e che i file sopra non siano tracciati da Git.");
  console.log("  git status");
  console.log("  git check-ignore -v oauth_credentials.json token.json dist/\n");
  process.exit(0);
}

main();
