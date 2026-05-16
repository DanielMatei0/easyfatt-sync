# Guida: build macOS (DMG) — Easyfatt Sync

Build **beta / test interno** su macOS **senza** Apple Developer Program (nessuna firma Developer ID, nessuna notarizzazione).

Per distribuzione pubblica esterna, vedi [Firma e notarizzazione (futuro)](./macos-notarization-future.md).

---

## Indice

1. [Output atteso](#1-output-atteso)
2. [Prerequisiti](#2-prerequisiti)
3. [Icona `.icns`](#3-icona-icns)
4. [Build DMG](#4-build-dmg)
5. [Gatekeeper senza notarizzazione](#5-gatekeeper-senza-notarizzazione)
6. [GitHub Releases e auto-update](#6-github-releases-e-auto-update)
7. [Problemi comuni](#7-problemi-comuni)

---

## 1. Output atteso

### Apple Silicon (consigliato su M1/M2/M3)

```bash
npm run dist:mac
```

In `dist/` (es. `version: "1.0.0"`):

| File | Uso |
|------|-----|
| `Easyfatt Sync-1.0.0-arm64.dmg` | Installer per test / beta |
| `latest-mac.yml` | Metadati **electron-updater** (macOS) |
| `Easyfatt Sync-1.0.0-arm64.dmg.blockmap` | Delta update |

### Mac Intel

```bash
npm run dist:mac:intel
```

Output tipico: `Easyfatt Sync-1.0.0.dmg` (arch x64) + `latest-mac.yml` + `.blockmap`.

> I nomi esatti dipendono da `productName` e `version` in `package.json`; controlla sempre la cartella `dist/` dopo la build.

---

## 2. Prerequisiti

| Requisito | Dettaglio |
|-----------|-----------|
| macOS | 12+ consigliato |
| Node.js | 18+ o 20 LTS |
| Xcode CLI | `xcode-select --install` (per `sips`, `iconutil`) |
| `oauth_credentials.json` | Nella root **prima** della build (come Windows); non in Git |

Script di build con **`CSC_IDENTITY_AUTO_DISCOVERY=false`** per evitare tentativi di firma automatica senza certificato.

---

## 3. Icona `.icns`

La build macOS usa `assets/icon.icns`. Se manca:

```bash
npm run icons:mac
```

Senza `.icns`, electron-builder può usare un fallback o avvisare: genera l’icona prima di distribuire il DMG.

Sorgente: `assets/icon.png` (≥1024×1024 consigliato). Dettagli: [`assets/README.md`](../../assets/README.md).

---

## 4. Build DMG

```bash
cd easyfatt-sync-app
npm install
# oauth_credentials.json nella root
npm run icons:mac    # se manca icon.icns
npm run dist:mac     # ARM64
# oppure
npm run dist:mac:intel
```

Configurazione test in `package.json` → `build.mac`:

- `hardenedRuntime: false`
- `gatekeeperAssess: false`
- `identity: null` — nessuna firma (solo test; in produzione usare Developer ID)
- `target: dmg`

**Non** modificare `build.win` / `build.nsis` per le build Mac.

---

## 5. Gatekeeper senza notarizzazione

Senza **Developer ID** e **notarizzazione Apple**, macOS può mostrare:

> «Easyfatt Sync» non può essere aperto perché proviene da uno sviluppatore non identificato.

**Per test interno / beta:**

1. **Tasto destro** sull’app (o sul DMG montato → trascina in Applicazioni) → **Apri** → **Apri** nel dialogo.
2. Oppure: **Impostazioni di Sistema** → **Privacy e sicurezza** → **Apri comunque** (dopo il primo tentativo bloccato).

Non chiedere ai clienti finali questo workaround in produzione: serve [notarizzazione](./macos-notarization-future.md).

---

## 6. GitHub Releases e auto-update

Per ogni release che supporta **Windows e macOS**, allega **tutti** gli asset rilevanti:

| Piattaforma | File |
|-------------|------|
| Windows | `Easyfatt Sync Setup X.Y.Z.exe`, `latest.yml`, `.exe.blockmap` |
| macOS | `Easyfatt Sync-X.Y.Z-arm64.dmg` (o x64), `latest-mac.yml`, `.dmg.blockmap` |

Tag consigliato: `vX.Y.Z` (es. `v1.0.1`).

`build.publish` in `package.json` punta a `DanielMatei0/easyfatt-sync`.

Gli artefatti in `dist/` **non** vanno committati (`.gitignore`).

---

## 7. Problemi comuni

### Build chiede certificato / fallisce codesign

Gli script impostano `CSC_IDENTITY_AUTO_DISCOVERY=false` e in `package.json` → `build.mac.identity` è `null` (nessuna firma, solo test).

Se compare `resource fork, Finder information, or similar detritus not allowed`:

```bash
xattr -cr .
npm run dist:mac
```

### `icon.icns` mancante

```bash
npm run icons:mac
```

### App non si apre dopo install

Vedi [§5 Gatekeeper](#5-gatekeeper-senza-notarizzazione).

### Aggiornamenti Mac non rilevati

Verifica che la release includa **`latest-mac.yml`** e che l’utente abbia installato il DMG ufficiale (non `npm run dev`).

---

## Link correlati

- [Build Windows (NSIS)](./build-windows.md)
- [Notarizzazione futura](./macos-notarization-future.md)
- [Workflow release](./README.md#11-workflow-release)
- [UPDATES.md](../../UPDATES.md)

**Supporto:** [support@aven-labs.com](mailto:support@aven-labs.com)
