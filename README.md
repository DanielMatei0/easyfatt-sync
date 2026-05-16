# Easyfatt Sync — `26.0.0`

Applicazione desktop **Electron** (Aven Labs) per sincronizzare l'export clienti **Easyfatt** (Excel) con **Google Sheets**.

- **Versione corrente:** `26.0.0` — ciclo prodotto **2026** (vedi [`VERSIONING.md`](VERSIONING.md))
- **Piattaforme:** Windows 10/11 (x64) · macOS 12+ (Apple Silicon e Intel)
- **Documentazione utente:** [`docs/client/README.md`](docs/client/README.md)
- **Documentazione tecnica:** [`docs/developer/README.md`](docs/developer/README.md)
- **Release notes:** [`RELEASE_NOTES.md`](RELEASE_NOTES.md)
- **Workflow release:** [`UPDATES.md`](UPDATES.md)
- **Sicurezza:** [`SECURITY.md`](SECURITY.md)
- **Supporto:** [support@aven-labs.com](mailto:support@aven-labs.com)

---

## Funzionalità prodotto

| Area | Descrizione |
|------|-------------|
| **Profili sync multipli** | Più connessioni Excel → Google Sheets, ognuna con automazioni proprie |
| **Dashboard salute** | Stato in tempo reale: operativo / attenzione / errore |
| **Cronologia eventi** | Ultimi 500 eventi locali, filtri, export report JSON |
| **Dettaglio sync (GitHub-diff)** | Vista riga-per-riga di aggiunte / modifiche / rimozioni tra due sync |
| **Mapping colonne** | Excel → Google Sheets con anteprima per profilo |
| **Wizard onboarding** | 6 passi guidati al primo avvio (saltabile) |
| **Sync manuale** | Pulsante "Sincronizza ora" |
| **Sync automatica (watcher)** | Trigger su salvataggio file Excel (`chokidar`, debounce) |
| **Sync programmata** | Uno o più orari giornalieri (`node-cron`) |
| **Notifiche desktop** | Nativa su successo/errore |
| **Promemoria sync mancata** | Notifica solo se in giornata non è stata fatta sync |
| **Backup manuale + automatico** | Giornaliero/settimanale/mensile con rotazione |
| **Supporto integrato** | Modulo + report diagnostico sanitizzato |
| **Aggiornamenti automatici** | `electron-updater` su GitHub Releases (consenso utente) |
| **Tema chiaro/scuro** | Persistito, completo su tutta l'UI |
| **Privacy/Termini** | Gate al primo avvio, link a policy |
| **Build Windows/macOS** | NSIS + DMG via `electron-builder` |
| **Release CI/CD** | GitHub Actions su tag `v*.*.*` |

---

## Avvio rapido (sviluppo)

```bash
npm install
cp oauth_credentials.example.json oauth_credentials.json
# Modifica oauth_credentials.json con le credenziali OAuth Desktop Aven Labs
npm run dev
```

> Il file `oauth_credentials.json` **non va committato**. Vedi [Configurazione credenziali OAuth](docs/developer/README.md#configurazione-credenziali-oauth).

---

## Script utili

| Comando | Descrizione |
|---------|-------------|
| `npm run dev` | Avvia l'app in sviluppo |
| `npm run dist:win` | Installer Windows NSIS (solo su **Windows** o CI Windows) |
| `npm run dist:mac` | DMG macOS ARM64 (senza notarizzazione) |
| `npm run dist:mac:intel` | DMG macOS Intel x64 |
| `npm run icons:win` | Genera `assets/icon.ico` da PNG |
| `npm run icons:mac` | Genera `assets/icon.icns` da PNG (solo macOS) |
| `npm run check` | Controllo salute progetto (config, asset, moduli) |
| `npm run security:check` | Avvisi file sensibili prima del push |

---

## Build installer Windows

Su un PC **Windows 10/11**:

```bash
npm install
# oauth_credentials.json nella root (non committato)
npm run dist:win
```

Output in `dist/` (nomi **stabili**, senza versione nel filename):

- `Easyfatt-Sync-Windows.exe` — installer NSIS (scelta cartella, Desktop, menu Start)
- `latest.yml` — metadati electron-updater
- `Easyfatt-Sync-Windows.exe.blockmap` — delta updater

Link diretto GitHub (ultima release):  
`https://github.com/DanielMatei0/easyfatt-sync/releases/latest/download/Easyfatt-Sync-Windows.exe`

Guida completa: [`docs/developer/build-windows.md`](docs/developer/build-windows.md).

---

## Build DMG macOS

Su **Mac** (Apple Silicon o Intel):

```bash
npm install
npm run icons:mac    # se manca assets/icon.icns
npm run dist:mac     # ARM64 — oppure dist:mac:intel per x64
```

Output in `dist/`:

- `Easyfatt-Sync-macOS-arm64.dmg` (Apple Silicon) o `Easyfatt-Sync-macOS-x64.dmg` (Intel)
- `latest-mac.yml`
- `Easyfatt-Sync-macOS-arm64.dmg.blockmap`

Link diretto GitHub (ARM64):  
`https://github.com/DanielMatei0/easyfatt-sync/releases/latest/download/Easyfatt-Sync-macOS-arm64.dmg`

Guida: [`docs/developer/build-macos.md`](docs/developer/build-macos.md).

> Senza notarizzazione Apple, macOS può bloccare l'app: **tasto destro → Apri**, oppure **Impostazioni di Sistema → Privacy e sicurezza → Apri comunque**. Notarizzazione futura: [`macos-notarization-future.md`](docs/developer/macos-notarization-future.md).

> **Build Windows da Mac:** può fallire (Wine/NSIS). Usa PC Windows o CI `windows-latest`.

---

## Credenziali OAuth nella build

- Copia `oauth_credentials.example.json` → `oauth_credentials.json` e inserisci le credenziali **prima** di `npm run dist:win` / `npm run dist:mac`.
- Il file **non** va in Git (`.gitignore`); viene **incluso** nell'installer se presente in locale al momento della build.
- In **CI GitHub Actions** viene generato dal secret `OAUTH_CREDENTIALS_JSON` solo durante la build, poi rimosso dal workspace.
- `token.json` non va mai nel pacchetto (è per utente, in `userData`).

---

## Release `26.0.0` — comandi

### Workflow rapido (GitHub Actions)

```bash
git status
git add .
git commit -m "release: prepare Easyfatt Sync 26.0.0"
git push origin main

git tag v26.0.0
git push origin v26.0.0
```

Oppure in un colpo solo (crea commit + tag):

```bash
npm version 26.0.0
git push origin main --follow-tags
```

Il workflow `.github/workflows/release.yaml` parte sul push del tag e pubblica gli asset (`.exe`, `.dmg`, `latest*.yml`, `.blockmap`) sulla GitHub Release.

### Workflow manuale (locale)

1. `npm run dist:win` su Windows; `npm run dist:mac` su Mac.
2. Crea tag `vX.Y.Z` e una **GitHub Release** su `DanielMatei0/easyfatt-sync`.
3. Allega da `dist/` (nomi fissi):
   - Windows: `Easyfatt-Sync-Windows.exe`, `latest.yml`, `Easyfatt-Sync-Windows.exe.blockmap`
   - macOS: `Easyfatt-Sync-macOS-arm64.dmg`, `latest-mac.yml`, `Easyfatt-Sync-macOS-arm64.dmg.blockmap`  
     (e/o `Easyfatt-Sync-macOS-x64.dmg` + relativo `.blockmap`)

Dettagli: [`UPDATES.md`](UPDATES.md) · [`docs/developer/release-assets.md`](docs/developer/release-assets.md).

---

## Checklist pre-tag

Prima di pushare un tag `v*.*.*`:

```bash
npm run check
npm run security:check
git status
```

Verifica:

- [ ] `package.json` → `version` aggiornato (es. `26.0.0`)
- [ ] `RELEASE_NOTES.md` aggiornato con le novità
- [ ] `UPDATES.md` / `VERSIONING.md` allineati
- [ ] Nessun file sensibile in staging:
  - `oauth_credentials.json`
  - `token.json`
  - `.env`, `.env.local`
  - `dist/`, `*.exe`, `*.dmg`, `*.blockmap`
  - `latest.yml`, `latest-mac.yml`
- [ ] Secret `OAUTH_CREDENTIALS_JSON` configurato in GitHub Actions
- [ ] CI ha già completato una build di prova (`workflow_dispatch`)
- [ ] Sync test funzionante su `npm run dev`

Se un file sensibile è già nell'indice Git:

```bash
git rm --cached oauth_credentials.json token.json .env 2>/dev/null || true
git rm -r --cached dist 2>/dev/null || true
```

Se un secret è finito nella **history**, ruota le credenziali Google e contatta [support@aven-labs.com](mailto:support@aven-labs.com).

---

## Versioning

Dalla `26.0.0` Easyfatt Sync usa **calendar versioning** (MAJOR = anno). Vedi [`VERSIONING.md`](VERSIONING.md) per regole, esempi e compatibilità electron-updater.

---

## Licenza

ISC — © Aven Labs
