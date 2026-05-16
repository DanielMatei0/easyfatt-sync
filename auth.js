/**
 * Google OAuth — client centralizzato Aven Labs
 *
 * SVILUPPO:
 *   oauth_credentials.json nella root dell'app (client OAuth Aven Labs di test).
 *
 * PRODUZIONE:
 *   Stesso file incluso nel pacchetto Electron. Il cliente finale NON crea mai
 *   un progetto Google Cloud né scarica credenziali.
 *
 * GOOGLE CLOUD (progetto Aven Labs):
 *   - Creare un OAuth Client di tipo "Desktop app" (consigliato per app Electron).
 *     Con Desktop app i redirect su localhost/127.0.0.1 sono gestiti senza
 *     registrare manualmente ogni URI come per un Web Client.
 *   - Se si usa un OAuth Client di tipo "Web application", registrare i redirect:
 *     http://127.0.0.1:<porta>/callback e http://localhost:<porta>/callback
 *   - Scope richiesto: https://www.googleapis.com/auth/spreadsheets
 *
 * TOKEN:
 *   Salvato solo in locale (token.json in AppData per utente).
 *
 * FLUSSO:
 *   Collega Google → server locale temporaneo → browser → callback → token salvato.
 */

const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { google } = require("googleapis");
const { shell } = require("electron");

const CREDENTIALS_PATH = path.join(__dirname, "oauth_credentials.json");
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const OAUTH_TIMEOUT_MS = 2 * 60 * 1000;

let activeOAuthServer = null;
let activeOAuthTimeout = null;
let cachedAuthClient = null;
let cachedTokenMtime = null;

function appDataPath() {
  const base = process.env.APPDATA || process.env.HOME || __dirname;
  return path.join(base, "EasyfattSync");
}

function ensureAppData() {
  const dir = appDataPath();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tokenPath() {
  return path.join(ensureAppData(), "token.json");
}

function loadOAuthCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      "File oauth_credentials.json mancante. Contatta Aven Labs: non serve creare credenziali Google Cloud."
    );
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const block = raw.installed || raw.web;

  if (!block?.client_id || !block?.client_secret) {
    throw new Error("oauth_credentials.json non valido (client OAuth Aven Labs).");
  }

  return block;
}

function createOAuthClient(redirectUri) {
  const { client_secret, client_id } = loadOAuthCredentials();
  return new google.auth.OAuth2(client_id, client_secret, redirectUri);
}

function getFreeLocalPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

function stopOAuthServer() {
  if (activeOAuthTimeout) {
    clearTimeout(activeOAuthTimeout);
    activeOAuthTimeout = null;
  }
  if (activeOAuthServer) {
    try {
      activeOAuthServer.close();
    } catch {
      /* ignore */
    }
    activeOAuthServer = null;
  }
}

function callbackHtml(success, message = "") {
  const title = success ? "Collegamento riuscito" : "Collegamento non riuscito";
  const body = success
    ? "Google è collegato. Puoi chiudere questa scheda e tornare a Easyfatt Sync."
    : `Errore: ${message}. Chiudi questa scheda e riprova dall'app.`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f1115; color: #f7f7f8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { max-width: 420px; padding: 32px; text-align: center; border: 1px solid #333; border-radius: 16px; background: #171a21; }
    h1 { font-size: 20px; margin: 0 0 12px; color: ${success ? "#4ade80" : "#f87171"}; }
    p { margin: 0; color: #a4a7ae; line-height: 1.5; font-size: 14px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}

function invalidateAuthCache() {
  cachedAuthClient = null;
  cachedTokenMtime = null;
}

function persistRefreshedTokens(tokens) {
  const existing = readGoogleToken() || {};
  const merged = { ...existing, ...tokens };
  writeGoogleToken(merged);
  try {
    cachedTokenMtime = fs.statSync(tokenPath()).mtimeMs;
  } catch {
    cachedTokenMtime = null;
  }
}

async function authorizeGoogle(log = () => {}) {
  const TOKEN_PATH = tokenPath();

  if (!fs.existsSync(TOKEN_PATH)) {
    invalidateAuthCache();
    throw new Error('Google non collegato. Clicca "Collega Google" nell\'app.');
  }

  const stat = fs.statSync(TOKEN_PATH);
  if (cachedAuthClient && cachedTokenMtime === stat.mtimeMs) {
    return cachedAuthClient;
  }

  const oAuth2Client = createOAuthClient("http://127.0.0.1");
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  oAuth2Client.setCredentials(token);

  oAuth2Client.on("tokens", (tokens) => {
    if (tokens) {
      persistRefreshedTokens(tokens);
    }
  });

  try {
    await oAuth2Client.getAccessToken();
  } catch {
    invalidateAuthCache();
    throw new Error(
      'Collegamento Google scaduto o non valido. Clicca "Collega Google" per ricollegare l\'account.'
    );
  }

  cachedAuthClient = oAuth2Client;
  cachedTokenMtime = stat.mtimeMs;
  return oAuth2Client;
}

async function startGoogleOAuthFlow(log = console.log) {
  if (activeOAuthServer) {
    throw new Error("Collegamento Google già in corso. Attendi il completamento.");
  }

  const port = await getFreeLocalPort();
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const oAuth2Client = createOAuthClient(redirectUri);

  return new Promise((resolve, reject) => {
    const fail = (error) => {
      stopOAuthServer();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const succeed = (tokens) => {
      stopOAuthServer();
      writeGoogleToken(tokens);
      invalidateAuthCache();
      log("Account Google collegato correttamente.");
      resolve({ ok: true });
    };

    activeOAuthTimeout = setTimeout(() => {
      fail(
        new Error(
          "Timeout collegamento Google (2 minuti). Riprova cliccando Collega Google."
        )
      );
    }, OAUTH_TIMEOUT_MS);

    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(400);
          res.end("Bad request");
          return;
        }

        const url = new URL(req.url, redirectUri);

        if (url.pathname !== "/callback") {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        const oauthError = url.searchParams.get("error");
        if (oauthError) {
          const desc = url.searchParams.get("error_description") || oauthError;
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(callbackHtml(false, desc));
          fail(new Error(`Accesso Google negato: ${desc}`));
          return;
        }

        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(callbackHtml(false, "Codice di autorizzazione mancante."));
          fail(new Error("Codice di autorizzazione mancante."));
          return;
        }

        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHtml(true));

        succeed(tokens);
      } catch (error) {
        try {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          res.end(callbackHtml(false, error.message));
        } catch {
          /* response already sent */
        }
        fail(error);
      }
    });

    server.on("error", (err) => fail(err));

    server.listen(port, "127.0.0.1", async () => {
      activeOAuthServer = server;

      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: SCOPES,
      });

      log("Apro browser per collegamento Google...");
      log(`In attesa autorizzazione su ${redirectUri}`);

      await shell.openExternal(authUrl);
    });
  });
}

function isGoogleAuthorized() {
  return fs.existsSync(tokenPath());
}

function logoutGoogle() {
  stopOAuthServer();
  invalidateAuthCache();
  const TOKEN_PATH = tokenPath();
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  return { ok: true };
}

function readGoogleToken() {
  const TOKEN_PATH = tokenPath();
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
}

function writeGoogleToken(token) {
  ensureAppData();
  fs.writeFileSync(tokenPath(), JSON.stringify(token, null, 2));
}

module.exports = {
  authorizeGoogle,
  startGoogleOAuthFlow,
  isGoogleAuthorized,
  logoutGoogle,
  tokenPath,
  readGoogleToken,
  writeGoogleToken,
};
