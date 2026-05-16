# Aggiornamenti Easyfatt Sync (electron-updater)

## Strategia di versioning (dal 2026)

Dalla release **26.0.0** Easyfatt Sync adotta un **versioning calendar-based** allineato all'anno di riferimento del prodotto, in stile Apple:

| Componente | Significato |
|---|---|
| **MAJOR** | Anno di riferimento (`26` = 2026, `27` = 2027, …) |
| **MINOR** | Feature update durante l'anno |
| **PATCH** | Bugfix e correzioni rapide |

Esempi:

| Versione | Tipo |
|---|---|
| `26.0.0` | Prima release ufficiale 2026 |
| `26.0.1` | Bugfix |
| `26.1.0` | Nuove funzionalità compatibili |
| `26.2.0` | Successivo feature update |
| `27.0.0` | Prima release 2027 |

Non rappresenta SemVer puro: l'incremento MAJOR **non implica breaking change**, ma marca l'anno solare. Eventuali rotture (formato backup, schema config) vengono comunque comunicate nelle **release notes**.

---

## Prerequisiti

1. `package.json` → `build.publish` configurato su `DanielMatei0/easyfatt-sync` (già presente).
2. **Mai** committare token GitHub. Usa la variabile d'ambiente `GH_TOKEN` (electron-builder) o `GITHUB_TOKEN` (GitHub Actions).
3. `oauth_credentials.json` presente nella root della macchina di build (o iniettato da CI).

---

## Workflow release ufficiale (consigliato — via GitHub Actions)

La build di Windows e macOS avviene automaticamente in CI quando si pubblica un tag `v*.*.*`.

### 1. Prepara la versione

```bash
git status              # nessun file sensibile
npm run check           # health check progetto
npm run security:check  # avvisi pre-push
```

### 2. Aggiorna `package.json` e committa

```bash
# scelta A — manuale:
git add .
git commit -m "release: prepare Easyfatt Sync 26.0.0"
git push origin main

# scelta B — con npm version (crea tag automaticamente):
npm version 26.0.0
git push origin main --follow-tags
```

### 3. Crea il tag (se non hai usato `npm version`)

```bash
git tag v26.0.0
git push origin v26.0.0
```

### 4. CI builda e pubblica

Il workflow `.github/workflows/release.yaml`:

- Parte solo su tag `v*.*.*`
- Builda Windows su `windows-latest` (Node 22)
- Builda macOS ARM64 su `macos-latest` (Node 22)
- Crea `oauth_credentials.json` dal secret `OAUTH_CREDENTIALS_JSON`
- Pubblica gli asset sulla GitHub Release del tag:
  - `dist/*.exe` (installer Windows)
  - `dist/*.dmg` (DMG macOS)
  - `dist/*.yml` (`latest.yml`, `latest-mac.yml`)
  - `dist/*.blockmap`

**Secret GitHub necessari** (Settings → Secrets and variables → Actions):

| Secret | Valore |
|---|---|
| `OAUTH_CREDENTIALS_JSON` | Contenuto JSON delle credenziali OAuth Desktop Aven Labs |

`GITHUB_TOKEN` è iniettato automaticamente da Actions.

---

## Release manuale (fallback locale)

Se non hai accesso a CI, esegui le build sulle macchine corrette:

```bash
# Windows 10/11 (o CI windows-latest)
npm run dist:win

# Mac Apple Silicon (ARM64)
npm run dist:mac

# Mac Intel (opzionale)
npm run dist:mac:intel
```

Guide build: [Windows](docs/developer/build-windows.md) · [macOS](docs/developer/build-macos.md).

Poi:

1. Crea una **GitHub Release** con tag `vX.Y.Z` (es. `v26.0.0`).
2. Allega da `dist/` (nomi **stabili** — vedi [release-assets.md](docs/developer/release-assets.md)):
   - **Windows:** `Easyfatt-Sync-Windows.exe`, `latest.yml`, `Easyfatt-Sync-Windows.exe.blockmap`
   - **macOS:** `Easyfatt-Sync-macOS-arm64.dmg`, `latest-mac.yml`, `Easyfatt-Sync-macOS-arm64.dmg.blockmap`  
     (opz. Intel: `Easyfatt-Sync-macOS-x64.dmg` + `.blockmap`)

> Il cliente scarica solo `.exe` / `.dmg`. `latest*.yml` e `.blockmap` servono solo a electron-updater per il delta download.

---

## Comportamento in App

- Gli aggiornamenti partono solo se `app.isPackaged === true` (versione installata, non `npm run dev`).
- In sviluppo, **Controlla aggiornamenti** mostra: *Aggiornamenti disponibili solo nella versione installata.*
- Il download **non parte** senza consenso: l'utente deve cliccare **Scarica aggiornamento**.
- L'installazione **non parte** senza consenso: l'utente deve cliccare **Installa e riavvia**.
- All'avvio l'app controlla automaticamente gli aggiornamenti dopo circa 4 secondi (solo versione installata).
- Gli errori di update **non bloccano** la sincronizzazione Excel → Google Sheets.

---

## Log

I log dell'updater sono scritti tramite `electron-log` nella cartella log di sistema:

- **Windows:** `%USERPROFILE%\AppData\Roaming\easyfatt-sync-app\logs\main.log`
- **macOS:** `~/Library/Logs/easyfatt-sync-app/main.log`

---

## Sicurezza pre-tag

Verifica sempre prima di taggare:

```bash
git status     # niente di sensibile in staging
git log -1     # commit di release pronto
```

Non devono essere tracciati:

- `oauth_credentials.json`
- `token.json`
- `.env`, `.env.local`
- `dist/`, `*.exe`, `*.dmg`, `*.blockmap`
- `latest.yml`, `latest-mac.yml`

In caso di leak di un secret nella history → ruotare le credenziali Google Cloud e contattare [support@aven-labs.com](mailto:support@aven-labs.com).
