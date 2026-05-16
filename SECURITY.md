# Security Policy — Easyfatt Sync

## Segnalazione vulnerabilità

Se ritieni di aver trovato una vulnerabilità di sicurezza, **non aprire una issue pubblica** con dettagli sensibili.

Contatta:

**[support@aven-labs.com](mailto:support@aven-labs.com)**

Oggetto suggerito: `Security — Easyfatt Sync`

Indica, se possibile:

- versione dell’app;
- sistema operativo;
- passi per riprodurre il problema;
- impatto stimato.

Risponderemo il prima possibile.

---

## Cosa non va mai committato nel repository

| File / dato | Motivo |
|-------------|--------|
| `oauth_credentials.json` | Secret OAuth Google (client Desktop Aven Labs) |
| `token.json` | Token di accesso Google dell’utente |
| `.env`, `.env.local` | Chiavi e secret di ambiente |
| `dist/`, `*.exe`, `*.dmg` | Build e artefatti di release |
| `latest.yml` / `.blockmap` | Metadati updater (distribuiti via GitHub Releases, non nel sorgente) |
| Backup `*.easyfatt-sync-backup.json` | Possono contenere impostazioni e, se scelto, token Google |
| Log con dati cliente | Percorsi Excel, ID fogli, messaggi di errore dettagliati |

Usa `oauth_credentials.example.json` e `.env.example` come modelli **senza valori reali**.

---

## Google OAuth

- L’app usa un **OAuth Client Desktop** centralizzato Aven Labs (`oauth_credentials.json` in build, non nel repo pubblico).
- Ogni installazione genera un **`token.json` locale** dopo che l’utente clicca “Collega Google”.
- Il token resta sulla macchina del cliente (cartella dati app), non sui server Aven Labs.
- In caso di compromissione del PC, l’utente deve **disconnettere Google** dall’app e, se necessario, revocare l’accesso da [Account Google](https://myaccount.google.com/permissions).

---

## Dati del cliente

- I **dati clienti** (Excel Easyfatt, contenuto Google Sheets) **non** transitano dai server Aven Labs durante la sincronizzazione normale.
- La sync avviene: PC cliente → Google Sheets API.
- Le richieste di **supporto** inviano solo i campi compilati nel modulo (nome, email, descrizione problema, metadati tecnici limitati).

---

## Backup e token Google

- I backup possono includere opzionalmente il collegamento Google (`googleTokenIncluded`).
- I file di backup vanno trattati come **riservati** (stesso livello di una password).
- Non caricare backup su repository pubblici o cloud non cifrati senza valutazione del rischio.

---

## GitHub Releases

- Gli **installer** (`.exe`, `.dmg`) e `latest.yml` si pubblicano come **asset di release**, non nel codice sorgente.
- Il token `GH_TOKEN` per la publish va usato solo in CI o sulla macchina di build, mai nel codice.

---

## Buone pratiche per contributor

1. Esegui `npm run security:check` prima del push.
2. Verifica `git status` che non compaiano file sensibili.
3. Se un secret è stato committato per errore: ruota le credenziali su Google Cloud, revoca token, e rimuovi il file dalla history Git (es. `git filter-repo` o supporto Aven Labs).

---

## Electron

- `contextIsolation: true`, `nodeIntegration: false`, API esposte solo via `preload.js`.
- Link esterni aperti con `shell.openExternal` dopo validazione URL `https://`.
