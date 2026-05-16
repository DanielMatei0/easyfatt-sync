#!/usr/bin/env node
/**
 * Controllo salute progetto — npm run check
 * Verifica config, asset, moduli e sicurezza base (non esegue build complete).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const REQUIRED_FILES = [
  "main.js",
  "preload.js",
  "package.json",
  "oauth_credentials.example.json",
  "renderer/index.html",
  "renderer/renderer.js",
  "renderer/style.css",
  "assets/icon.png",
  "assets/icon.ico",
  "assets/icon.icns",
];

const REQUIRED_SCRIPTS = [
  "dev",
  "dist:win",
  "dist:mac",
  "dist:mac:intel",
  "icons:win",
  "icons:mac",
  "security:check",
  "check",
];

const MODULES_TO_LOAD = [
  "auth.js",
  "sync.js",
  "syncRunner.js",
  "scheduler.js",
  "backup.js",
  "updater.js",
  "errors.js",
];

const errors = [];
const warnings = [];
const ok = [];

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function pass(msg) {
  ok.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function fail(msg) {
  errors.push(msg);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function loadPackageJson() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
    return JSON.parse(raw);
  } catch (e) {
    fail(`package.json non valido: ${e.message}`);
    return null;
  }
}

function checkPackageJson(pkg) {
  if (!pkg) return;

  pass("package.json JSON valido");

  for (const name of REQUIRED_SCRIPTS) {
    if (!pkg.scripts?.[name]) {
      fail(`Script mancante in package.json: "${name}"`);
    }
  }
  if (pkg.scripts?.check) pass("script check definito");

  const build = pkg.build;
  if (!build) {
    fail("Manca sezione build in package.json");
    return;
  }

  if (build.appId !== "com.avenlabs.easyfattsync") {
    warn(`build.appId inatteso: ${build.appId}`);
  } else {
    pass("build.appId OK");
  }

  if (build.win?.icon !== "assets/icon.ico") {
    fail(`build.win.icon atteso assets/icon.ico, trovato: ${build.win?.icon}`);
  } else {
    pass("build.win.icon OK");
  }

  const nsis = build.nsis;
  if (!nsis || nsis.oneClick !== false) {
    fail("build.nsis.oneClick deve essere false");
  } else {
    pass("build.nsis (wizard) OK");
  }

  if (build.mac?.icon !== "assets/icon.icns") {
    fail(`build.mac.icon atteso assets/icon.icns, trovato: ${build.mac?.icon}`);
  } else {
    pass("build.mac.icon OK");
  }

  if (build.mac?.hardenedRuntime !== false) {
    warn("build.mac.hardenedRuntime non è false (ok solo dopo notarizzazione)");
  }

  if (!Object.prototype.hasOwnProperty.call(build.mac || {}, "identity")) {
    warn("build.mac.identity non impostato");
  } else if (build.mac.identity !== null) {
    warn("build.mac.identity non è null — verifica certificato Apple");
  } else {
    pass("build.mac.identity null (build test senza firma)");
  }

  const pub = build.publish?.[0];
  if (pub?.provider === "github" && pub.owner && pub.repo) {
    pass(`build.publish → ${pub.owner}/${pub.repo}`);
  } else {
    fail("build.publish GitHub incompleto");
  }

  if (!String(pkg.scripts["dist:mac"] || "").includes("CSC_IDENTITY_AUTO_DISCOVERY=false")) {
    warn("dist:mac senza CSC_IDENTITY_AUTO_DISCOVERY=false");
  }

  if (pkg.scripts["dist:win"] !== "electron-builder --win nsis --x64") {
    warn(`dist:win: ${pkg.scripts["dist:win"]}`);
  } else {
    pass("dist:win invariato");
  }
}

function checkFiles() {
  for (const rel of REQUIRED_FILES) {
    if (fileExists(rel)) {
      pass(rel);
    } else {
      fail(`File mancante: ${rel}`);
    }
  }
}

function checkRenderer() {
  const html = fs.readFileSync(path.join(ROOT, "renderer/index.html"), "utf8");
  const refs = [...html.matchAll(/src=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (ref.startsWith("http")) continue;
    const full = path.join(ROOT, "renderer", ref);
    if (!fs.existsSync(full)) {
      fail(`Asset renderer mancante: renderer/${ref}`);
    }
  }
  if (refs.length) pass("renderer/index.html — asset referenziati OK");
}

function checkModules() {
  const prev = process.cwd();
  process.chdir(ROOT);
  for (const mod of MODULES_TO_LOAD) {
    try {
      const resolved = require.resolve(path.join(ROOT, mod));
      delete require.cache[resolved];
      require(resolved);
      pass(`require ${mod}`);
    } catch (e) {
      fail(`require ${mod}: ${e.message}`);
    }
  }
  process.chdir(prev);
}

function checkOAuthForBuild() {
  if (fileExists("oauth_credentials.json")) {
    try {
      const raw = fs.readFileSync(path.join(ROOT, "oauth_credentials.json"), "utf8");
      JSON.parse(raw);
      pass("oauth_credentials.json presente e JSON valido (incluso in build se presente)");
      if (/YOUR_GOOGLE_OAUTH|placeholder/i.test(raw)) {
        warn("oauth_credentials.json sembra un placeholder");
      }
    } catch {
      fail("oauth_credentials.json non è JSON valido");
    }
  } else {
    warn(
      "oauth_credentials.json assente — ok per npm run dev se configuri dopo; obbligatorio prima di dist:win / dist:mac"
    );
  }

  if (fileExists("oauth_credentials.example.json")) {
    pass("oauth_credentials.example.json (template repo)");
  }
}

function checkDistArtifacts(pkg) {
  if (!fileExists("dist")) return;

  const version = pkg?.version || "0.0.0";
  const macDmg = `dist/Easyfatt Sync-${version}-arm64.dmg`;
  const macYml = "dist/latest-mac.yml";

  if (fileExists(macDmg)) pass(`Artefatto Mac trovato: ${path.basename(macDmg)}`);
  else warn(`Nessun DMG arm64 per v${version} — esegui npm run dist:mac`);

  if (fileExists(macYml)) pass("latest-mac.yml presente");
}

function checkPlatformNotes() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin" && arch === "arm64") {
    warn(
      "Su Mac Apple Silicon, npm run dist:win fallisce (Wine). Usa Windows o CI windows-latest."
    );
  }

  if (process.env.ELECTRON_RUN_AS_NODE === "1") {
    warn(
      "ELECTRON_RUN_AS_NODE=1 attivo: npm run dev può fallire. Esegui unset ELECTRON_RUN_AS_NODE"
    );
  }
}

function checkGitIgnore() {
  try {
    const out = execSync(
      'git check-ignore -v oauth_credentials.json token.json dist/ 2>/dev/null || true',
      { cwd: ROOT, encoding: "utf8" }
    ).trim();
    if (out.includes("oauth_credentials.json") && out.includes("dist/")) {
      pass(".gitignore — oauth_credentials.json e dist/ ignorati");
    } else if (fs.existsSync(path.join(ROOT, ".git"))) {
      warn("git check-ignore: verifica manualmente .gitignore");
    }
  } catch {
    /* no git */
  }
}

function runSecuritySubset() {
  const sensitive = ["oauth_credentials.json", "token.json"];
  for (const rel of sensitive) {
    if (fileExists(rel)) {
      warn(`Presente in locale (non committare): ${rel}`);
    }
  }
  if (fileExists("dist")) {
    warn("Cartella dist/ presente (deve restare fuori da Git)");
  }
}

function printList(items, symbol) {
  for (const item of items) {
    console.log(`  ${symbol} ${item}`);
  }
}

function main() {
  console.log("Easyfatt Sync — health check (npm run check)\n");

  const pkg = loadPackageJson();

  section("Configurazione");
  checkPackageJson(pkg);

  section("File essenziali");
  checkFiles();

  section("Renderer");
  try {
    checkRenderer();
  } catch (e) {
    fail(`renderer: ${e.message}`);
  }

  section("Moduli Node");
  checkModules();

  section("OAuth e build");
  checkOAuthForBuild();
  checkDistArtifacts(pkg);

  section("Piattaforma e Git");
  checkPlatformNotes();
  checkGitIgnore();
  runSecuritySubset();

  section("Riepilogo");
  if (ok.length) printList(ok.slice(0, 8), "✓");
  if (ok.length > 8) console.log(`  ✓ … e altri ${ok.length - 8} check superati`);

  if (warnings.length) {
    console.log("");
    printList(warnings, "⚠");
  }

  if (errors.length) {
    console.log("");
    printList(errors, "✗");
    console.log(`\n${errors.length} errore/i — correggi prima di release.\n`);
    process.exit(1);
  }

  console.log(
    `\n${ok.length} check OK` +
      (warnings.length ? `, ${warnings.length} avviso/i` : "") +
      ".\n"
  );
  console.log("Prossimi passi:");
  console.log("  npm run dev          — sviluppo");
  console.log("  npm run dist:mac     — DMG macOS (su Mac)");
  console.log("  npm run dist:win     — installer Windows (su PC Windows)");
  console.log("  npm run security:check — avvisi pre-push\n");
  process.exit(0);
}

main();
