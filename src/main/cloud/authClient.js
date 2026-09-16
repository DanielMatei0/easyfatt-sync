/**
 * "Accedi con account Aven": apre la pagina di collegamento nel browser di
 * sistema e riceve il codice monouso su un server locale (127.0.0.1), poi lo
 * scambia con il token del PC. PKCE: il codice da solo non basta.
 */
const crypto = require("crypto");
const http = require("http");
const os = require("os");
const { shell } = require("electron");
const { connectPageUrl, LOGIN_TIMEOUT_MS } = require("./cloudConstants");
const { request, appVersion } = require("./cloudApi");
const { saveSession } = require("./tokenStore");

let active = null;

function b64url(buf) {
  return buf.toString("base64url");
}

function page(ok, message) {
  const title = ok ? "PC collegato" : "Collegamento non riuscito";
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#fafafa;display:grid;place-items:center;height:100vh;margin:0}
div{background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:32px;max-width:420px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#555;margin:0}</style></head>
<body><div><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function cancelLogin() {
  if (active) active.fail(new Error("Accesso annullato."));
}

/**
 * @returns {Promise<{shop, user, device}>}
 */
function startLogin(store, installId) {
  if (active) return Promise.reject(new Error("Accesso già in corso: completa la pagina aperta nel browser."));

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = http.createServer();
    const timer = setTimeout(() => finish(new Error("Tempo scaduto: riprova ad accedere.")), LOGIN_TIMEOUT_MS);

    function finish(err, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active = null;
      setTimeout(() => server.close(), 500);
      if (err) reject(err);
      else resolve(value);
    }
    active = { fail: (err) => finish(err) };

    server.on("request", async (req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname !== "/easyfatt/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code") || "";
      if (url.searchParams.get("state") !== state || !code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page(false, "Richiesta non valida. Torna nell'app e riprova."));
        return;
      }
      try {
        const data = await request("POST", "/device/token", {
          body: { code, code_verifier: verifier, install_id: installId },
        });
        saveSession(store, {
          token: data.token,
          device: data.device,
          shop: data.shop,
          user: data.user,
          connectedAt: new Date().toISOString(),
        });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page(true, `Accesso eseguito per <strong>${escapeHtml(data.shop.name)}</strong>. Puoi chiudere questa pagina e tornare in Easyfatt Sync.`));
        finish(null, { shop: data.shop, user: data.user, device: data.device });
      } catch (err) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page(false, escapeHtml(err.message || "Riprova dall'app.")));
        finish(err);
      }
    });

    server.on("error", (err) => finish(err));
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const params = new URLSearchParams({
        port: String(port),
        state,
        challenge,
        install: installId,
        device: (os.hostname() || "PC").slice(0, 80),
        platform: process.platform,
        v: appVersion() || "0.0.0",
      });
      shell.openExternal(`${connectPageUrl()}?${params}`).catch((err) => finish(err));
    });
  });
}

module.exports = { startLogin, cancelLogin };
