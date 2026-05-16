# Guida: creare l’installabile Windows (Easyfatt Sync)

Questa guida spiega come generare l’**installer `.exe`** per Windows usando **electron-builder** e il target **NSIS**, partendo dal progetto `easyfatt-sync-app`.

---

## Indice

1. [Cosa viene prodotto](#1-cosa-viene-prodotto)
2. [Prerequisiti](#2-prerequisiti)
3. [Preparazione progetto](#3-preparazione-progetto)
4. [Build dell’installer](#4-build-dellinstaller)
5. [Dove trovare i file](#5-dove-trovare-i-file)
6. [Test dell’installer](#6-test-dellinstaller)
7. [Pubblicazione e aggiornamenti automatici](#7-pubblicazione-e-aggiornamenti-automatici)
8. [Firma del codice (consigliata)](#8-firma-del-codice-consigliata)
9. [Problemi comuni](#9-problemi-comuni)

---

## 1. Cosa viene prodotto

Lo script `npm run dist:win` esegue:

```bash
electron-builder --win nsis --x64
```

Risultato tipico nella cartella `dist/`:

| File | Uso |
|------|-----|
| `Easyfatt Sync Setup X.Y.Z.exe` | Installer per i clienti (setup guidato NSIS) |
| `latest.yml` | Metadati per **electron-updater** (aggiornamenti automatici) |
| `Easyfatt Sync Setup X.Y.Z.exe.blockmap` | Delta update |
| Cartella `win-unpacked/` | App “portable” non installata (utile per debug) |

Esempio con `version: "1.0.0"` in `package.json`:

```text
dist/Easyfatt Sync Setup 1.0.0.exe
dist/latest.yml
dist/Easyfatt Sync Setup 1.0.0.exe.blockmap
```

- **Architettura:** solo **64 bit** (`x64`).
- **Formato installer:** **NSIS** con wizard (non one-click): scelta cartella, collegamento Desktop, menu Start, icona `assets/icon.ico`.

---

## 2. Prerequisiti

### Macchina di build

| Requisito | Dettaglio |
|-----------|-----------|
| Sistema operativo | **Windows 10 o 11** (consigliato per build native) |
| Node.js | **18+** o **20 LTS** |
| npm | Incluso con Node |
| Spazio disco | Almeno 2–3 GB liberi (`node_modules` + `dist`) |
| Rete | Per `npm install` e download Electron |

> **Build Windows da Mac (soprattutto Apple Silicon):** spesso fallisce con errori Wine/NSIS (`bad CPU type in executable`, toolchain mancante). Per produzione usa un **PC Windows 10/11** o **GitHub Actions** con runner `windows-latest`. La build macOS (`npm run dist:mac`) resta su Mac.

### Account e file riservati

| File | Obbligatorio per build produzione | In git |
|------|-----------------------------------|--------|
| `oauth_credentials.json` | **Sì** — credenziali OAuth Google Desktop Aven Labs | No (`.gitignore`) |
| `token.json` | No — è del singolo utente, non va nel pacchetto | No |

Senza `oauth_credentials.json` nella root del progetto, l’app installata **non potrà** far collegare Google ai clienti.

---

## 3. Preparazione progetto

### 3.1 Clona o aggiorna il repository

```bash
cd easyfatt-sync-app
git pull
```

### 3.2 Installa le dipendenze

```bash
npm install
```

### 3.3 Inserisci le credenziali OAuth (produzione)

Copia il file OAuth **Desktop app** del progetto Google Cloud Aven Labs nella root:

```text
easyfatt-sync-app/
  oauth_credentials.json    ← qui
  main.js
  package.json
  ...
```

Formato atteso (estratto):

```json
{
  "installed": {
    "client_id": "....apps.googleusercontent.com",
    "client_secret": "....",
    "redirect_uris": ["http://localhost"]
  }
}
```

Verifica che il file **non** venga committato:

```bash
git status
# oauth_credentials.json non deve comparire tra i file da aggiungere
```

### 3.4 Verifica versione e icona

In `package.json`:

- **`version`** — numero versione dell’installer (es. `1.0.1` → file `Easyfatt Sync Setup 1.0.1.exe`).
- **`build.productName`** — nome visibile: `Easyfatt Sync`.
- **`build.win.icon`** — `assets/icon.ico` (richiesto per NSIS; generato da PNG).

Se manca `assets/icon.ico`:

```bash
npm run icons:win
```

Vedi [`assets/README.md`](../../assets/README.md). Senza `.ico` electron-builder può fallire o usare un’icona generica: controlla l’output prima di distribuire.

### 3.5 (Opzionale) Test in sviluppo

Prima della build pesante, verifica che l’app parta:

```bash
npm run dev
```

Controlla: avvio, collegamento Google, sync di prova.

---

## 4. Build dell’installer

### Comando principale

Da PowerShell o **Prompt dei comandi** nella cartella del progetto:

```bash
npm run dist:win
```

Equivalente a:

```bash
npx electron-builder --win nsis --x64
```

### Durata

La prima build scarica il runtime Electron e può richiedere **5–15 minuti**. Le build successive sono più veloci.

### Output atteso (console)

Messaggi tipici di electron-builder:

- `packaging` / `building`
- `building block map`
- `building nsis`
- percorso finale del file `.exe`

In caso di errore, leggi la sezione [Problemi comuni](#9-problemi-comuni).

---

## 5. Dove trovare i file

Tutti gli artefatti sono in:

```text
easyfatt-sync-app/dist/
```

### File da distribuire al cliente

- **`Easyfatt Sync Setup <versione>.exe`** — da caricare sul sito o inviare al cliente.

### File da allegare alla GitHub Release (aggiornamenti automatici)

- Installer `.exe`
- **`latest.yml`**
- Eventuali **`.blockmap`**

Senza `latest.yml` sulla release, l’app installata non rileverà correttamente gli aggiornamenti.

### Cartella di debug

- **`win-unpacked/`** — eseguibile non installato; utile per test rapidi senza ripetere l’installer.

---

## 6. Test dell’installer

Checklist consigliata su un PC Windows pulito (o VM):

1. Esegui il file `Easyfatt Sync Setup X.Y.Z.exe`.
2. Completa il wizard NSIS: scegli cartella, conferma collegamento **Desktop** e **menu Start** (entrambi abilitati in `package.json` → `build.nsis`).
3. Avvia **Easyfatt Sync** dal menu Start.
4. Accetta **Privacy e Termini** al primo avvio.
5. **Collega Google** e completa OAuth nel browser.
6. Configura file Excel, ID foglio, nome scheda → **Salva impostazioni**.
7. Esegui **Sincronizza ora** e verifica il foglio Google.
8. (Opzionale) **Controlla aggiornamenti** — in build installata deve funzionare (non in `npm run dev`).

### Verifica versione installata

L’app mostra la versione in interfaccia (footer/impostazioni), allineata a `package.json` → `version`.

---

## 7. Pubblicazione e aggiornamenti automatici

Per distribuire aggiornamenti via **electron-updater** (GitHub Releases):

1. Incrementa `version` in `package.json` (es. `1.0.0` → `1.0.1`).
2. Su **Windows**: `npm install` → `npm run dist:win`.
3. Crea tag Git `v1.0.1` e push: `git tag v1.0.1 && git push origin v1.0.1`.
4. Crea una **GitHub Release** sul repo `DanielMatei0/easyfatt-sync` (config in `package.json` → `build.publish`).
5. Carica **obbligatoriamente** da `dist/`:
   - `Easyfatt Sync Setup 1.0.1.exe`
   - `latest.yml`
   - `Easyfatt Sync Setup 1.0.1.exe.blockmap`

Dettagli: [`UPDATES.md`](../../UPDATES.md) e [Workflow release](./README.md#11-workflow-release).

### Publish diretta con token (opzionale)

```bash
set GH_TOKEN=ghp_xxxxxxxx   # Windows CMD
# oppure in PowerShell:
$env:GH_TOKEN="ghp_xxxxxxxx"

npx electron-builder --win nsis --x64 --publish always
```

Non inserire mai il token nel codice o nel repository.

---

## 8. Firma del codice (consigliata)

Su Windows, un installer **non firmato** può mostrare avvisi SmartScreen (“Windows ha protetto il PC”).

Per distribuzione professionale:

1. Acquista un certificato **Code Signing** (Authenticode).
2. Configura electron-builder con `certificateFile`, `certificatePassword`, ecc. in `package.json` → `build.win` (vedi [documentazione electron-builder](https://www.electron.build/code-signing)).

Senza firma l’installer funziona comunque; l’utente può scegliere “Ulteriori informazioni” → “Esegui comunque”.

---

## 9. Problemi comuni

### `oauth_credentials.json` mancante dopo installazione

**Causa:** file non presente nella root al momento della build.

**Soluzione:** copia il file prima di `npm run dist:win` e rifai la build.

---

### Build fallisce con errore NSIS

**Possibili cause:**

- Percorso progetto con caratteri speciali o troppo lungo.
- Antivirus che blocca file in `dist/` o `node_modules`.

**Soluzioni:**

- Sposta il progetto in un percorso breve, es. `C:\dev\easyfatt-sync-app`.
- Escludi temporaneamente la cartella dall’antivirus.
- Esegui il terminale **come amministratore** solo se necessario (di solito non serve).

---

### `npm run dist` non trovato

Nel progetto è definito solo:

```json
"dist:win": "electron-builder --win nsis --x64"
```

Usa **`npm run dist:win`**, non `npm run dist`.

---

### SmartScreen / “app non riconosciuta”

Normale senza firma digitale. Vedi [§8](#8-firma-del-codice-consigliata).

---

### L’app installata non trova aggiornamenti

**Verifica:**

- Release GitHub con **`latest.yml`** allegato.
- `version` nella release coerente con il tag.
- `build.publish` in `package.json` con owner/repo corretti.
- Cliente usa installer ufficiale, non `npm run dev`.

---

### Build lenta o download Electron bloccato

**Soluzioni:**

- Controlla proxy/firewall aziendale.
- Imposta mirror se necessario (variabili electron-builder / cache npm).

---

## Riepilogo rapido

```bash
cd easyfatt-sync-app
npm install
# Assicurati che oauth_credentials.json sia nella root
npm run dist:win
# Installer in: dist\Easyfatt Sync Setup X.Y.Z.exe
```

---

## Link correlati

- [Documentazione tecnica completa](./README.md)
- [Aggiornamenti automatici](../../UPDATES.md)
- [Guida utente](../client/README.md)

**Supporto:** [support@aven-labs.com](mailto:support@aven-labs.com)
