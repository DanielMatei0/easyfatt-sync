# Easyfatt Sync

Applicazione desktop **Electron** (Aven Labs) per sincronizzare l’export clienti **Easyfatt** (Excel) con **Google Sheets**.

- **Piattaforme:** Windows 10/11, macOS  
- **Documentazione:** [`docs/README.md`](docs/README.md)  
- **Sicurezza:** [`SECURITY.md`](SECURITY.md)  
- **Supporto:** [support@aven-labs.com](mailto:support@aven-labs.com)

---

## Avvio rapido (sviluppo)

```bash
npm install
cp oauth_credentials.example.json oauth_credentials.json
# Modifica oauth_credentials.json con le credenziali OAuth Desktop Aven Labs
npm run dev
```

> Il file `oauth_credentials.json` **non va committato**. Vedi [Configurazione credenziali OAuth](docs/developer/README.md#configurazione-credenziali-oauth) nella documentazione tecnica.

---

## Script utili

| Comando | Descrizione |
|---------|-------------|
| `npm run dev` | Avvia l’app in sviluppo |
| `npm run dist:win` | Installer Windows NSIS (solo su **Windows** o CI Windows) |
| `npm run dist:mac` | DMG macOS ARM64 (test/beta, senza notarizzazione) |
| `npm run dist:mac:intel` | DMG macOS Intel x64 |
| `npm run icons:win` | Genera `assets/icon.ico` da PNG |
| `npm run icons:mac` | Genera `assets/icon.icns` da PNG (solo macOS) |
| `npm run check` | Controllo salute progetto (config, asset, moduli) |
| `npm run security:check` | Avvisi file sensibili prima del push |

### Build installer Windows

Su un PC **Windows 10/11** (consigliato):

```bash
npm install
# oauth_credentials.json nella root (non committato — vedi sotto)
npm run dist:win
```

Output in `dist/` (es. versione `1.0.0`):

- `Easyfatt Sync Setup 1.0.0.exe` — setup guidato (scelta cartella, Desktop, menu Start)
- `latest.yml` — aggiornamenti automatici (electron-updater)
- `Easyfatt Sync Setup 1.0.0.exe.blockmap`

Guida completa: [`docs/developer/build-windows.md`](docs/developer/build-windows.md).

### Build DMG macOS (test interno)

Su **Mac** (Apple Silicon o Intel):

```bash
npm install
npm run icons:mac    # se manca assets/icon.icns
npm run dist:mac     # ARM64 — oppure dist:mac:intel per x64
```

Output in `dist/` (es. versione `1.0.0`):

- `Easyfatt Sync-1.0.0-arm64.dmg`
- `latest-mac.yml`
- `Easyfatt Sync-1.0.0-arm64.dmg.blockmap`

Guida: [`docs/developer/build-macos.md`](docs/developer/build-macos.md).

> Senza notarizzazione Apple, macOS può bloccare l’app: **tasto destro → Apri → Apri**, oppure Impostazioni → Privacy e sicurezza → **Apri comunque**. Firma/notarizzazione future: [`macos-notarization-future.md`](docs/developer/macos-notarization-future.md).

> **Build Windows da Mac:** può fallire (Wine/NSIS). Usa PC Windows o CI `windows-latest`.

### Credenziali OAuth nella build

- Copia `oauth_credentials.example.json` → `oauth_credentials.json` e inserisci le credenziali **prima** di `npm run dist:win`.
- Il file **non** va in Git (`.gitignore`); viene **incluso** nell’installer se presente in locale al momento della build.
- `token.json` non va mai nel pacchetto (è per utente, in `userData`).

### Pubblicare su GitHub Releases

1. Incrementa `version` in `package.json`.
2. `npm run dist:win` su Windows; `npm run dist:mac` (e/o `dist:mac:intel`) su Mac.
3. Crea tag `vX.X.X` e una **GitHub Release** su `DanielMatei0/easyfatt-sync`.
4. Allega da `dist/`:
   - Windows: `.exe`, `latest.yml`, `.exe.blockmap`
   - macOS: `.dmg`, `latest-mac.yml`, `.dmg.blockmap`

Dettagli: [`UPDATES.md`](UPDATES.md) e [`docs/developer/README.md`](docs/developer/README.md#11-workflow-release).

---

## Repository pubblico — checklist

Prima di `git push`, verifica:

```bash
npm run check
npm run security:check
git status
```

Non devono essere tracciati: `oauth_credentials.json`, `token.json`, `.env`, `dist/`.

Se un file sensibile è già nell’indice Git:

```bash
git rm --cached oauth_credentials.json token.json .env 2>/dev/null || true
git rm -r --cached dist 2>/dev/null || true
```

Poi committa le correzioni. Se un secret è finito nella **history**, ruota le credenziali Google e contatta [support@aven-labs.com](mailto:support@aven-labs.com).

---

## Licenza

ISC — Aven Labs
