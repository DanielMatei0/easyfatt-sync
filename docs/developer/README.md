# Easyfatt Sync — Documentazione tecnica sviluppatori

Documentazione di riferimento per sviluppo, manutenzione, build e release dell’applicazione desktop **Easyfatt Sync** (Aven Labs).

---

## Indice

1. [Introduzione progetto](#1-introduzione-progetto)
2. [Architettura applicazione](#2-architettura-applicazione)
3. [Struttura progetto](#3-struttura-progetto)
4. [Configurazione sviluppo](#4-configurazione-sviluppo)
5. [Google OAuth setup](#5-google-oauth-setup)
6. [Sistema sincronizzazione](#6-sistema-sincronizzazione)
7. [Sistema aggiornamenti automatici](#7-sistema-aggiornamenti-automatici)
8. [Sistema supporto](#8-sistema-supporto)
9. [Backup e ripristino](#9-backup-e-ripristino)
10. [Sicurezza](#10-sicurezza)
11. [Workflow release](#11-workflow-release)
12. [TODO / roadmap](#12-todo--roadmap)
13. [Troubleshooting tecnico](#13-troubleshooting-tecnico)

---

## 1. Introduzione progetto

### Cos’è Easyfatt Sync

**Easyfatt Sync** è un’applicazione desktop che automatizza l’aggiornamento di un foglio **Google Sheets** a partire dal file **Excel** esportato da **Easyfatt** (tipicamente elenco clienti).

Il cliente finale non configura Google Cloud: usa credenziali OAuth **centralizzate Aven Labs** (`oauth_credentials.json` nel pacchetto) e salva solo il **token personale** in locale.

### Obiettivo software


| Obiettivo      | Descrizione                                                                     |
| -------------- | ------------------------------------------------------------------------------- |
| Affidabilità   | Sync idempotente (clear + rewrite foglio), retry lettura Excel su file bloccato |
| Semplicità     | UI a impostazioni, senza terminale                                              |
| Automazione    | Watch file, cron, promemoria, backup automatici                                 |
| Manutenibilità | Moduli Node separati, IPC tipizzati via preload                                 |
| Distribuzione  | Installer Windows (NSIS) e DMG macOS, update via GitHub Releases                |


### Stack tecnologico


| Layer              | Tecnologia                                    |
| ------------------ | --------------------------------------------- |
| Desktop shell      | Electron 42.x                                 |
| Runtime            | Node.js (bundled con Electron)                |
| UI                 | HTML / CSS / JavaScript vanilla (`renderer/`) |
| Persistenza config | `electron-store`                              |
| Excel              | `xlsx` (lettura buffer async)                 |
| Google             | `googleapis` + OAuth 2.0                      |
| File watch         | `chokidar`                                    |
| Scheduler          | `node-cron`                                   |
| Build              | `electron-builder`                            |
| Auto-update        | `electron-updater` + `electron-log`           |
| HTTP supporto      | `fetch` nativo verso API Aven Labs            |


**Piattaforme target:** Windows 10/11 (x64), macOS (ARM64 e Intel).

---

## 2. Architettura applicazione

### Diagramma logico

```
┌─────────────────────────────────────────────────────────────┐
│                    RENDERER (BrowserWindow)                  │
│  index.html · style.css · renderer.js                        │
│  Legge/scrive form · attività · modali · legal gate          │
└───────────────────────────┬─────────────────────────────────┘
                            │ contextBridge (preload.js)
                            │ invoke + eventi IPC
┌───────────────────────────▼─────────────────────────────────┐
│                      MAIN PROCESS (main.js)                  │
│  IPC · electron-store · dialog · shell.openExternal            │
└─┬─────────┬──────────┬──────────┬──────────┬────────────────┘
  │         │          │          │          │
  ▼         ▼          ▼          ▼          ▼
scheduler  syncRunner  auth.js   backup.js  updater.js
  │         │          │          │          support.js
  │         ▼          │          │
  │      sync.js       │          │
  │    (xlsx + API)    │          │
  ▼                    ▼          ▼
chokidar            token.json   JSON backup
node-cron           oauth_credentials.json
```

### Main process

- Punto di ingresso: `main.js`.
- Crea `BrowserWindow`, registra handler `ipcMain`, orchestra moduli.
- **Non** espone Node al renderer (`nodeIntegration: false`, `contextIsolation: true`).
- All’avvio: carica config, `restartScheduler`, login item, check update (solo packaged).
- All’uscita: `stopScheduler()` su `before-quit`.

### Renderer process

- Carica `renderer/index.html` + `renderer.js`.
- Interagisce solo con `window.easyfattSync` (API preload).
- Gestisce: form impostazioni, stato sync, attività recenti (max 50), tema chiaro/scuro, legal gate, supporto, backup UI, aggiornamenti.

### Preload

File: `preload.js`.

Espone un sottoinsieme sicuro di operazioni tramite `contextBridge.exposeInMainWorld("easyfattSync", { ... })`.

**Pattern:**

- Operazioni request/response → `ipcRenderer.invoke(channel, ...args)`.
- Eventi main → renderer → `ipcRenderer.on("log" | "config-updated" | "update-state" | ...)`.

### IPC (canali principali)


| Canale                                                                    | Direzione | Funzione                          |
| ------------------------------------------------------------------------- | --------- | --------------------------------- |
| `get-config` / `save-config`                                              | R ↔ M     | Lettura/scrittura config          |
| `select-excel` / `select-backup-folder`                                   | R → M     | Dialog file/cartella              |
| `connect-google` / `logout-google` / `is-google-authorized`               | R ↔ M     | OAuth                             |
| `sync-now`                                                                | R → M     | Sync manuale                      |
| `backup-create` / `backup-preview` / `backup-restore` / `get-backup-meta` | R ↔ M     | Backup                            |
| `check-for-updates` / `download-update` / `install-update-now`            | R ↔ M     | Updater                           |
| `submit-support-request`                                                  | R → M     | Supporto                          |
| `get-legal-status` / `accept-legal`                                       | R ↔ M     | Privacy/termini                   |
| `open-external`                                                           | R → M     | Link HTTPS nel browser di sistema |
| `log`                                                                     | M → R     | Stream log attività               |
| `config-updated`                                                          | M → R     | Refresh UI dopo sync/restore      |
| `update-state` / `update-progress`                                        | M → R     | Stato aggiornamenti               |


### electron-store

- Istanza singleton in `main.js`: `const store = new Store()`.
- Chiavi principali:
  - `config` — oggetto impostazioni utente (vedi `syncState.getDefaultConfig()`).
  - `legalAccepted`, `legalAcceptedAt`, `legalVersion`.
  - `backupLastCreatedAt`, `backupLastRestoredAt`, `backupLastAutomaticAt`.

### Scheduler

Modulo: `scheduler.js`.

Responsabilità:

- **File watcher** (`chokidar`) con `awaitWriteFinish` e debounce 5s.
- **Sync programmata** (`node-cron`) su orari `syncTimes`.
- **Promemoria** sync mancante (`reminderTimes`).
- **Backup automatici** (cron giornaliero/settimanale/mensile).

Ogni `restartScheduler` esegue `stopScheduler()` (chiude watcher, ferma cron, cancella timeout) prima di riavviare.

**Mutex sync:** `syncRunner.runSync` usa flag `syncInProgress` condiviso tra manuale, watch e cron.

### Sync engine

Pipeline:

1. `sync.js` — legge Excel (async + retry), prepara matrice valori, chiama Google Sheets API.
2. `syncRunner.js` — orchestrazione, notifiche, `recordSyncSuccess` su store.
3. `sheetRange.js` — range dinamico colonne (non più `A:Z` fisso).
4. `errors.js` — messaggi client-friendly.

### Google OAuth

Modulo: `auth.js`.

- Credenziali app: `oauth_credentials.json` (root progetto, **non** in git).
- Token utente: `%APPDATA%/EasyfattSync/token.json` (Windows) o `~/EasyfattSync/token.json` (macOS/Linux).
- Flusso: server HTTP locale temporaneo su `127.0.0.1`, browser esterno, callback, salvataggio token.
- Cache client OAuth + listener `tokens` per persistere refresh.

### Updater

Modulo: `updater.js`.

- Attivo solo se `app.isPackaged`.
- `autoDownload: false`, `autoInstallOnAppQuit: false` — l’utente conferma download e install.
- Publish configurato verso GitHub (`package.json` → `build.publish`).
- Eventi verso renderer su canale `update-state`.

### Backup system

Modulo: `backup.js`.

- Export JSON impostazioni + stato legale + token Google opzionale.
- Restore con validazione `backupVersion`.
- Rotazione backup automatici per cartella e retention N.
- Lock `backupInProgress` per evitare backup concorrenti.

### Support system

Moduli: `support.js`, `supportConstants.js`, `supportIssueTypes.js`.

- POST JSON a `https://aven-labs.com/api/support/easyfatt-sync`.
- Timeout 30s, validazione lato client e server (esempio Next.js in `backend-examples/`).

---

## 3. Struttura progetto

```
easyfatt-sync-app/
├── oauth_credentials.example.json  # Template OAuth (committato, senza secret)
├── oauth_credentials.json          # Credenziali reali (gitignored, solo locale/build)
├── main.js                 # Entry Electron, IPC, lifecycle
├── preload.js              # Bridge sicuro renderer ↔ main
├── auth.js                 # OAuth Google, token file
├── sync.js                 # Excel → Google Sheets
├── syncRunner.js           # Wrapper sync + mutex + notifiche
├── syncState.js            # Default config, merge, validazione scheduler
├── scheduler.js            # Watch, cron, backup automatico
├── backup.js               # Backup/restore JSON
├── updater.js              # electron-updater
├── support.js              # Invio richiesta supporto
├── supportConstants.js     # URL API, email
├── supportIssueTypes.js    # Etichette tipo problema
├── notifications.js        # Notifiche desktop native
├── loginSettings.js        # Avvio con il sistema (openAtLogin)
├── errors.js               # Messaggi errore UI
├── sheetRange.js           # Helper range Sheets
├── legalConstants.js       # Versione legale, URL policy
├── package.json            # Scripts, electron-builder, publish
├── UPDATES.md              # Note release/updater
├── assets/
│   └── icon.png            # Icona app / build
├── renderer/
│   ├── index.html
│   ├── style.css
│   └── renderer.js
├── legal/
│   ├── privacy-easyfatt-sync.md
│   └── terms-easyfatt-sync.md
├── backend-examples/       # API supporto (Next.js + Resend)
└── docs/                   # Questa documentazione
```

### File principali (ruolo)


| File                   | Ruolo                                                |
| ---------------------- | ---------------------------------------------------- |
| `main.js`              | Window, IPC, collegamento moduli, `restartScheduler` |
| `preload.js`           | API `window.easyfattSync`                            |
| `auth.js`              | OAuth loopback, read/write token, cache client       |
| `sync.js`              | Lettura XLSX, clear/update Sheets                    |
| `syncRunner.js`        | Mutex sync, notifiche successo/errore                |
| `scheduler.js`         | Automazioni temporizzate e watch file                |
| `backup.js`            | Payload backup, restore, cleanup                     |
| `updater.js`           | Check/download/install release GitHub                |
| `support.js`           | Validazione form + fetch API                         |
| `renderer/renderer.js` | Logica UI, attività, form, modali                    |


---

## 4. Configurazione sviluppo

### Prerequisiti

- **Node.js** 18+ (consigliato LTS allineato a Electron 42).
- **npm** 9+.
- Account Google Cloud (solo per generare `oauth_credentials.json` di test).
- Per build macOS: macOS + Xcode CLI tools.
- Per build Windows: Windows (o CI) per NSIS.

### Installazione

```bash
git clone <repository-url>
cd easyfatt-sync-app
npm install
```

### Configurazione credenziali OAuth

Il file reale **`oauth_credentials.json` non deve essere committato** nel repository pubblico.

**Setup locale (sviluppo e build):**

1. Copia il template:
   ```bash
   cp oauth_credentials.example.json oauth_credentials.json
   ```
2. Apri `oauth_credentials.json` e inserisci le credenziali del **OAuth Client Desktop App** del progetto Google Cloud ufficiale **Aven Labs** (`client_id`, `client_secret`, ecc.).
3. Non committare il file reale: è già in `.gitignore`.

**Build produzione (installer Windows/macOS):**

- Prima di `npm run dist:win` o `npm run dist:mac`, assicurati che `oauth_credentials.json` esista **nella root del progetto** sulla macchina di build.
- electron-builder includerà il file nel pacchetto installato; ogni cliente finale **non** crea un progetto Google Cloud.

**Token per utente (`token.json`):**

- Generato **solo dopo** che l’utente clicca “Collega Google” nell’app installata.
- Salvato in locale per macchina, **mai** nel repository:
  - macOS/Linux: `~/EasyfattSync/token.json`
  - Windows: `%APPDATA%/EasyfattSync/token.json`

Se `oauth_credentials.json` manca, l’app mostra:

> Credenziali Google OAuth mancanti. Configura oauth_credentials.json.

Dettagli Google Cloud: [§5 Google OAuth setup](#5-google-oauth-setup). Sicurezza repository: [`SECURITY.md`](../../SECURITY.md).

### Avvio in sviluppo

```bash
npm run dev
```

Equivalente a `electron .` — **non** abilita auto-updater reale (messaggio dev in UI aggiornamenti).

### Script build


| Script                   | Output                        |
| ------------------------ | ----------------------------- |
| `npm run dist:win`       | Installer NSIS x64 in `dist/` |
| `npm run dist:mac`       | DMG ARM64 (Apple Silicon), senza firma/notarizzazione |
| `npm run dist:mac:intel` | DMG x64 (Intel), senza firma/notarizzazione           |
| `npm run icons:mac`      | Genera `assets/icon.icns`                             |
| `npm run check`          | Controllo salute progetto (pre-build / pre-push)    |

Guide build: **[build-windows.md](./build-windows.md)** · **[build-macos.md](./build-macos.md)** · [notarizzazione futura](./macos-notarization-future.md).

Configurazione builder in `package.json` → sezione `"build"`:

- `appId`: `com.avenlabs.easyfattsync`
- `productName`: `Easyfatt Sync`
- Windows: target **NSIS** (`oneClick: false`, scelta cartella, shortcut Desktop/Start, `assets/icon.ico`)
- macOS: **DMG** con `assets/icon.icns`, `hardenedRuntime: false` (test); notarizzazione documentata in [macos-notarization-future.md](./macos-notarization-future.md)
- `publish`: GitHub `DanielMatei0/easyfatt-sync`
- `oauth_credentials.json`: incluso nel pacchetto se presente in root al build; **mai** in Git (`oauth_credentials.example.json` resta nel repo)

### Variabili ambiente


| Variabile          | Uso                                                                 |
| ------------------ | ------------------------------------------------------------------- |
| `GH_TOKEN`         | Publish release su GitHub da CI o macchina build (electron-builder) |
| `RESEND_API_KEY`   | Solo backend supporto (Next.js), non nell’app Electron              |
| `APPDATA` / `HOME` | Path token utente (lettura in `auth.js`)                            |


File **non** committare (vedi `.gitignore`):

- `oauth_credentials.json`
- `token.json`
- `.env` / `.env.local`

---

## 5. Google OAuth setup

### Progetto Google Cloud (Aven Labs)

1. Console [Google Cloud](https://console.cloud.google.com/).
2. Crea o seleziona un progetto (es. “Aven Labs Easyfatt Sync”).
3. Abilita **Google Sheets API**.
4. Crea credenziali **OAuth 2.0 Client ID** di tipo **Desktop app** (consigliato per Electron).

### OAuth Desktop App

- Con Desktop app i redirect `http://127.0.0.1:<porta>/callback` sono gestiti senza registrare ogni porta in anticipo (a differenza di alcuni Web client).
- L’app avvia un server locale temporaneo e apre il browser con `shell.openExternal`.

### Scopes

```text
https://www.googleapis.com/auth/spreadsheets
```

Accesso in lettura/scrittura ai fogli dell’account collegato.

### File credenziali

`oauth_credentials.json` (formato Google):

```json
{
  "installed": {
    "client_id": "...",
    "client_secret": "...",
    "redirect_uris": ["http://localhost"]
  }
}
```

In produzione il file è **incluso nel pacchetto**; il cliente non crea un progetto Google proprio.

### Token locali

- Salvati in `EasyfattSync/token.json` per utente/macchina.
- `access_type: "offline"` + `prompt: "consent"` al primo collegamento per ottenere refresh token.
- Refresh persistito su evento `tokens` del client OAuth.

### Sicurezza


| Regola                         | Implementazione                                    |
| ------------------------------ | -------------------------------------------------- |
| Secret non nel renderer        | Solo main process legge credenziali                |
| Token non in backup di default | Checkbox esplicita in UI backup                    |
| Revoca                         | “Disconnetti Google” elimina `token.json`          |
| Messaggio scadenza             | `errors.js` + refresh fallito → “Ricollega Google” |


---

## 6. Sistema sincronizzazione

### Flusso dati

```
Excel (.xlsx)  →  xlsx (sheet_to_json)  →  matrice [header, ...rows]
       →  values.clear (range dinamico)  →  values.update (A1, RAW)
```

- Viene usato il **primo foglio** del workbook Excel (`SheetNames[0]`).
- Il nome foglio Google è `config.sheetName` (default `Clienti`).

### Watcher file

- Attivo se `watchEnabled && excelPath`.
- `chokidar` con `awaitWriteFinish.stabilityThreshold: 5000` ms.
- Debounce aggiuntivo 5s prima di chiamare `runSync`.
- Skip se sync già in corso o config incompleta (`canRunAutomatedSync`).

### Sync programmata

- `scheduleEnabled` + array `syncTimes` (formato `HH:MM`).
- Un job `node-cron` per ogni orario valido.
- Orari non validi ignorati con warning in log.

### Gestione Excel

- Lettura **async** (`fs.promises.readFile` + `XLSX.read` buffer).
- **Retry** fino a 5 tentativi su `EBUSY` / `EPERM` (file aperto in Easyfatt/Excel).
- Messaggio utente: file in uso → chiudi Easyfatt e riprova.

### Google Sheets

- Clear solo sulle colonne effettive (`sheetRange.buildClearRange`).
- Update da `'SheetName'!A1` con tutte le righe.

### Progress UI

Il main invia log speciali:

```text
__SYNC_PROGRESS__:<percent>:<messaggio>
```

Il renderer aggiorna barra progresso senza inondare l’elenco attività.

### Gestione errori

- `syncRunner` cattura errori, notifica desktop (se abilitate), rilancia messaggio friendly.
- Scheduler logga `Errore sincronizzazione: ...` senza crashare il processo.

---

## 7. Sistema aggiornamenti automatici

Basato su **electron-updater** e release **GitHub**.

### Componenti


| File                             | Ruolo                                            |
| -------------------------------- | ------------------------------------------------ |
| `updater.js`                     | Listener `autoUpdater`, emit eventi UI           |
| `package.json` → `build.publish` | Provider GitHub                                  |
| `dist/latest.yml`                | Metadati versione (generato da electron-builder) |


### Comportamento app

- Init solo se `app.isPackaged`.
- Check automatico ~4s dopo avvio.
- Download e install **solo su azione utente**.
- Listener registrati una sola volta (`listenersRegistered`).

### Release workflow (sintesi)

Vedi anche `[UPDATES.md](../../UPDATES.md)` e [§11](#11-workflow-release).

1. Bump `version` in `package.json`.
2. Build piattaforma target.
3. Tag Git `vX.Y.Z`.
4. GitHub Release con asset: `.exe` / `.dmg`, `latest.yml`, `.blockmap` se presenti.
5. App installata legge `latest.yml` e propone update.

### Versioning

Seguire **Semantic Versioning** per comunicare breaking change agli utenti:

- **PATCH** — bugfix, messaggi, piccole correzioni.
- **MINOR** — nuove funzioni compatibili (es. nuova opzione backup).
- **MAJOR** — cambi formato backup, OAuth, o comportamento sync incompatibile.

---

## 8. Sistema supporto

### Architettura

```
App Electron  --POST JSON-->  API Aven Labs  --Resend-->  Email interna + conferma cliente
```

- URL: `https://aven-labs.com/api/support/easyfatt-sync` (`supportConstants.js`).
- Timeout client: **30 secondi** (`support.js`).

### Payload (campi principali)


| Campo                                            | Note                                         |
| ------------------------------------------------ | -------------------------------------------- |
| `name`, `email`, `message`                       | Obbligatori (validazione)                    |
| `phone`                                          | Opzionale                                    |
| `issueType`                                      | Etichetta italiana da `supportIssueTypes.js` |
| `appVersion`, `platform`, `platformLabel`        | Contesto tecnico                             |
| `lastSyncAt`, `lastSyncRows`, `googleAuthorized` | Diagnostica                                  |
| `excelPath`, `sheetName`                         | Config (attenzione privacy in email interna) |


### Backend di esempio

Cartella: `backend-examples/nextjs/`

- Route: `app/api/support/easyfatt-sync/route.ts`
- Template email: `lib/support-email-templates.ts`
- Validazione server: `lib/support-validation.ts`

Variabili env tipiche:

```env
RESEND_API_KEY=re_...
SUPPORT_FROM_EMAIL="Aven Labs <support@aven-labs.com>"
SUPPORT_TO_EMAIL="support@aven-labs.com"
```

### Email cliente

Conferma automatica all’indirizzo inserito nel form, con footer privacy (link policy/termini).

---

## 9. Backup e ripristino

### Formato file JSON

Estensione consigliata: `.easyfatt-sync-backup.json`  
Nome manuale tipico: `easyfatt-sync-backup-YYYY-MM-DD.json`  
Nome automatico: `easyfatt-sync-backup-YYYY-MM-DD-HH-mm.json`

### Struttura payload

```json
{
  "app": "Easyfatt Sync",
  "backupVersion": "1.0",
  "backupType": "manual",
  "createdAt": "2026-05-16T20:00:00.000Z",
  "appVersion": "1.0.0",
  "platform": "darwin",
  "config": { },
  "legalAccepted": true,
  "legalAcceptedAt": "2026-01-01T00:00:00.000Z",
  "legalVersion": "1.0",
  "googleTokenIncluded": false,
  "googleToken": null
}
```


| Campo         | Descrizione                                                       |
| ------------- | ----------------------------------------------------------------- |
| `backupType`  | `"manual"` | `"automatic"` — la rotazione elimina solo automatici |
| `config`      | Oggetto completo impostazioni electron-store                      |
| `googleToken` | Presente solo se l’utente ha spuntato l’inclusione                |


**Non incluso:** file Excel, dati clienti nel foglio, log applicativi.

### Restore

1. Validazione `app`, `backupVersion`, `config`.
2. Merge config con default (`getDefaultConfig`).
3. Ripristino flag legali.
4. Token Google: scrittura o logout locale.
5. `restartScheduler` + `config-updated` verso UI.

### Backup automatici


| Impostazione                        | Default                        |
| ----------------------------------- | ------------------------------ |
| `automaticBackupEnabled`            | `false`                        |
| `automaticBackupFrequency`          | `daily` | `weekly` | `monthly` |
| `automaticBackupTime`               | `20:00`                        |
| `automaticBackupFolder`             | `""`                           |
| `automaticBackupRetention`          | `10`                           |
| `automaticBackupIncludeGoogleToken` | `false`                        |


- Settimanale: lunedì all’orario indicato.
- Mensile: primo giorno del mese.
- Cleanup: mantiene ultimi N file con pattern automatico; **non** cancella backup manuali.

---

## 10. Sicurezza

### Electron hardening

In `main.js` → `webPreferences`:

```javascript
contextIsolation: true,
nodeIntegration: false,
sandbox: true,
preload: path.join(__dirname, "preload.js"),
```

### Preload sicuro

- Nessun accesso diretto a `fs`, `process`, moduli Google.
- Solo metodi espliciti su `easyfattSync`.
- `open-external` valida URL (`^https?://`).

### Token e credenziali


| Asset                | Posizione                 | Git      |
| -------------------- | ------------------------- | -------- |
| OAuth client secret  | `oauth_credentials.json`  | Ignorato |
| Refresh/access token | `EasyfattSync/token.json` | Ignorato |
| Config utente        | electron-store (userData) | Locale   |


### API backend

- L’app non incorpora API key Resend.
- Il supporto passa da HTTPS verso dominio Aven Labs.

### Buone pratiche release

- Firmare binari Windows/macOS quando possibile (SmartScreen / Gatekeeper).
- Non allegare token o Excel cliente alle issue GitHub.

---

## 11. Workflow release

### Checklist completa

- Aggiornare `version` in `package.json` (es. `1.0.1`).
- Aggiornare note di rilascio (CHANGELOG o body GitHub Release).
- Verificare `build.publish` (owner/repo corretti).
- Build:
  ```bash
  npm run dist:win    # su Windows o CI Windows
  npm run dist:mac    # su Mac ARM
  npm run dist:mac:intel
  ```
- Controllare artefatti in `dist/`:
  - Windows: `Easyfatt-Sync-Windows.exe`, `latest.yml`, `Easyfatt-Sync-Windows.exe.blockmap`
  - macOS: `Easyfatt-Sync-macOS-arm64.dmg`, `latest-mac.yml`, `Easyfatt-Sync-macOS-arm64.dmg.blockmap`  
    Dettaglio nomi stabili: [release-assets.md](./release-assets.md)
- Creare tag Git: `git tag v1.0.1 && git push origin v1.0.1`
- Creare **GitHub Release** dal tag.
- Caricare **tutti** gli asset generati (incluso `latest.yml`).
- Test su macchina pulita: install → avvio → check update → sync smoke test.
- Comunicare agli utenti (email/newsletter se previsto).

### Publish con token

```bash
export GH_TOKEN=<github_pat_with_repo_scope>
npm run dist:win
# electron-builder può pubblicare se configurato --publish always
```

In CI è preferibile usare GitHub Actions con secret `GH_TOKEN`.

### Compatibilità aggiornamenti

- Gli utenti su versione N ricevono update solo se `latest.yml` sulla release è coerente con la piattaforma installata.
- Non forzare downgrade: electron-updater installa versioni più recenti.

---

## 12. TODO / roadmap

Roadmap indicativa (non impegnativa):


| Priorità | Funzione                | Note                                                         |
| -------- | ----------------------- | ------------------------------------------------------------ |
| Alta     | Sync bidirezionale      | Sheets → Excel o merge bidirezionale con conflict resolution |
| Media    | Multi-sheet             | Più fogli Excel / più tab Sheets                             |
| Media    | Sync prodotti / fatture | Estensione modello dati oltre anagrafica clienti             |
| Bassa    | Cloud dashboard         | Stato sync centralizzato per rivenditori                     |
| Bassa    | Analytics               | Metriche sync, errori aggregati (rispetto privacy)           |
| Bassa    | Multi-utente            | Account Aven Labs, config cloud, ruoli                       |


Ogni voce richiede ADR, aggiornamento `backupVersion` se cambia schema, e revisione privacy.

---

## 13. Troubleshooting tecnico

### OAuth


| Sintomo                           | Causa probabile         | Azione                                    |
| --------------------------------- | ----------------------- | ----------------------------------------- |
| `oauth_credentials.json mancante` | File non in root dev    | Copiare credenziali Desktop da GCP        |
| Redirect error                    | Tipo client errato      | Usare Desktop app, non Web senza URI      |
| `invalid_grant`                   | Token revocato/scaduto  | Eliminare `token.json`, ricollegare       |
| Porta occupata                    | Server OAuth precedente | Riavviare app, chiudere processi Electron |


### Sync


| Sintomo                  | Causa probabile                        | Azione                                         |
| ------------------------ | -------------------------------------- | ---------------------------------------------- |
| File in uso              | Easyfatt tiene lock                    | Chiudere export; verificare retry in `sync.js` |
| 0 righe                  | Foglio Excel vuoto o solo intestazione | Verificare export Easyfatt                     |
| Permission denied Sheets | Account sbagliato / ID errato          | Controllare `spreadsheetId` e permessi foglio  |
| Doppia sync              | Race (raro post-mutex)                 | Verificare un solo job cron per orario         |


### Updater


| Sintomo                    | Causa probabile                  | Azione                                       |
| -------------------------- | -------------------------------- | -------------------------------------------- |
| “Solo versione installata” | `npm run dev`                    | Testare su build packaged                    |
| Update non trovato         | `latest.yml` mancante in release | Allegare YAML alla GitHub Release            |
| Download fallito           | Rete / proxy aziendale           | Log `electron-log`, test manuale URL release |


### Build


| Sintomo         | Piattaforma | Azione                                                      |
| --------------- | ----------- | ----------------------------------------------------------- |
| NSIS fallisce   | Windows     | Path senza spazi, antivirus disabilitato per `dist/`        |
| DMG non si apre | macOS       | Gatekeeper: firmare e notarizzare per distribuzione esterna |
| Icona mancante  | Tutte       | Verificare `assets/icon.png`                                |


### Permessi file

- Backup automatico: cartella deve essere scrivibile (`fs.accessSync W_OK`).
- Excel su rete SMB: latenza alta → aumentare debounce o disabilitare watch.

### Token Google in backup

- Backup con token è sensibile: trattare file JSON come segreto.
- Dopo restore su altro PC, verificare che il refresh funzioni o ricollegare.

---

## Contatti tecnici

- **Supporto prodotto:** [support@aven-labs.com](mailto:support@aven-labs.com)
- **Documentazione utente:** `[docs/client/README.md](../client/README.md)`

---

*Ultimo aggiornamento documentazione: allineata a Easyfatt Sync v1.0.0 (stack Electron 42, backup v1.0).*