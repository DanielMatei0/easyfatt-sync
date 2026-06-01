const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "renderer", "index.html");
let html = fs.readFileSync(htmlPath, "utf8");

const modal = fs.readFileSync(path.join(__dirname, "profile-modal.fragment.html"), "utf8");
const profiles = fs.readFileSync(path.join(__dirname, "profiles-section.fragment.html"), "utf8");

if (!html.includes('id="profileModal"')) {
  html = html.replace("  <div id=\"backupRestoreModal\"", modal + "  <div id=\"backupRestoreModal\"");
}

const start = html.indexOf("        <!-- Card sincronizzazione principale");
const end = html.indexOf('          <motion class="accordion-item" data-accordion-item id="accordion-google">');
const endAlt = html.indexOf('          <motion class="accordion-item" data-accordion-item id="accordion-google">'.replace("motion", "div"));
const endMarker = html.indexOf('          <div class="accordion-item" data-accordion-item id="accordion-google">');

const endIdx = endMarker !== -1 ? endMarker : endAlt;

if (start !== -1 && endIdx !== -1) {
  html = html.slice(0, start) + profiles + html.slice(endIdx);
}

const automationOld = `                <div class="checks">
                  <label class="check-item">
                    <input type="checkbox" id="watchEnabled" />`;

if (html.includes('id="watchEnabled"')) {
  const autoStart = html.indexOf(automationOld);
  const autoEnd = html.indexOf('                <div id="scheduleFields"', autoStart);
  const autoEndClose = html.indexOf("</motion>", html.indexOf("</textarea>", autoEnd)) + 6;
  const autoEndDiv = html.indexOf("</div>", html.indexOf('id="syncTimes"', autoEnd)) + 6;

  const closeIdx = html.indexOf("</div>", html.indexOf('id="syncTimes"')) + 6;

  const automationNew = `                <p class="field-hint">Le sync automatiche si configurano per ogni connessione (modifica profilo).</p>
                <label class="check-item">
                  <input type="checkbox" id="openAtLogin" />
                  <span class="check-box" aria-hidden="true"></span>
                  <span class="check-text">
                    <span class="check-title">Avvio con Windows</span>
                    <span class="check-desc">Apre l’app all’accensione del PC</span>
                  </span>
                </label>`;

  if (autoStart !== -1 && closeIdx > autoStart) {
    html = html.slice(0, autoStart) + automationNew + html.slice(closeIdx);
  }
}

html = html.replace(
  "<span class=\"accordion-desc\">Sync automatica e avvio con Windows</span>",
  "<span class=\"accordion-desc\">Avvio con Windows</span>"
);

html = html.replace(
  '<span id="badgeWatch" class="badge" data-tone="inactive">Watch</span>',
  '<span id="badgeProfiles" class="badge" data-tone="inactive">0 conn.</span>'
);

fs.writeFileSync(htmlPath, html);
console.log("Patched index.html");
