#!/usr/bin/env node
/**
 * Selftest integrazione AvenGest — invia un ERRORE di prova e un TICKET di prova.
 *
 * Uso:
 *   AVENGEST_API_KEY=avn_xxx node scripts/avengest-selftest.js
 *   # oppure con avengest.config.json presente in root:
 *   node scripts/avengest-selftest.js
 *
 * Non stampa la chiave. Richiede Node 18+ (fetch globale).
 */
const os = require("os");

const BASE_URL = process.env.AVENGEST_BASE_URL || "https://admin.aven-labs.com";

function resolveKey() {
  const env = String(process.env.AVENGEST_API_KEY || "").trim();
  if (env) return env;
  try {
    const cfg = require("../avengest.config.json");
    return String(cfg.apiKey || cfg.AVENGEST_API_KEY || "").trim();
  } catch {
    return "";
  }
}

async function main() {
  const apiKey = resolveKey();
  if (!apiKey) {
    console.error("❌ Nessuna chiave: imposta AVENGEST_API_KEY o crea avengest.config.json");
    process.exit(1);
  }
  const product = process.platform === "darwin" ? "desktop-mac" : process.platform === "win32" ? "desktop-win" : "desktop";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  const stamp = new Date().toISOString();

  console.log(`▶ AvenGest selftest — base=${BASE_URL} product=${product}`);
  console.log(`  chiave: avn_…${apiKey.slice(-4)} (mascherata)\n`);

  // 1) Errore di prova
  const errorBody = {
    errors: [
      {
        message: `Errore di prova selftest ${stamp}`,
        name: "SelftestError",
        level: "WARN",
        product,
        environment: "dev",
        stack: `SelftestError: prova\n    at avengest-selftest.js\n    at ${stamp}`,
        context: { appVersion: "selftest", os: `${process.platform} ${os.release()}`, screen: "selftest" },
      },
    ],
  };
  const errRes = await fetch(`${BASE_URL}/api/ingest/errors`, {
    method: "POST",
    headers,
    body: JSON.stringify(errorBody),
  });
  const errData = await errRes.json().catch(() => ({}));
  console.log(`1) POST /api/ingest/errors → ${errRes.status}`, JSON.stringify(errData));

  // 2) Ticket di prova
  const ticketBody = {
    subject: `Ticket di prova selftest ${stamp}`,
    description:
      "Questo è un ticket di prova generato dallo script di selftest dell'app desktop Easyfatt Sync. Puoi chiuderlo.",
    priority: "LOW",
    external_user: { name: "Selftest Desktop", email: "selftest@aven-labs.com" },
    external_ref: "selftest-desktop",
  };
  const tkRes = await fetch(`${BASE_URL}/api/ingest/tickets`, {
    method: "POST",
    headers,
    body: JSON.stringify(ticketBody),
  });
  const tkData = await tkRes.json().catch(() => ({}));
  console.log(`2) POST /api/ingest/tickets → ${tkRes.status}`, JSON.stringify(tkData));

  // 3) Analytics di prova (chiave separata avnp_ via header x-analytics-key)
  const analyticsKey =
    String(process.env.AVENGEST_ANALYTICS_KEY || "").trim() ||
    (() => {
      try {
        return String(require("../avengest.config.json").analyticsKey || "").trim();
      } catch {
        return "";
      }
    })();
  let anStatus = "skip";
  if (analyticsKey) {
    const anRes = await fetch(`${BASE_URL}/api/ingest/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-analytics-key": analyticsKey },
      body: JSON.stringify({ product, type: "event", name: "selftest", path: "selftest", visitor_id: "selftest", session_id: `selftest-${stamp}` }),
    });
    anStatus = String(anRes.status);
    console.log(`3) POST /api/ingest/analytics → ${anRes.status} (atteso 204)`);
  } else {
    console.log("3) analytics: nessuna chiave avnp_ (AVENGEST_ANALYTICS_KEY o config.analyticsKey) — saltato");
  }

  const ok =
    (errRes.status === 202 || errRes.ok) &&
    (tkRes.status === 201 || tkRes.ok) &&
    (anStatus === "skip" || anStatus === "204");
  console.log(`\n${ok ? "✅ Selftest completato" : "⚠️ Selftest con errori — controlla gli status sopra"}`);
  if (!ok) process.exit(2);
}

main().catch((e) => {
  console.error("❌ Selftest fallito:", e?.message || e);
  process.exit(1);
});
