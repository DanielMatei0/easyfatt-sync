# Asset release GitHub — nomi stabili

Ogni release GitHub usa **nomi file fissi** (senza versione nel filename), così il sito Aven Labs e i link `releases/latest/download/...` restano validi tra una versione e l’altra.

La **versione** resta in `package.json`, nel tag Git (`v1.0.1`) e dentro `latest.yml` / `latest-mac.yml`.

---

## Windows (`npm run dist:win`)

| File | Chi lo usa |
|------|------------|
| `Easyfatt-Sync-Windows.exe` | **Download clienti** / sito web |
| `latest.yml` | electron-updater |
| `Easyfatt-Sync-Windows.exe.blockmap` | electron-updater (delta) |

**Link latest (esempio):**  
`https://github.com/DanielMatei0/easyfatt-sync/releases/latest/download/Easyfatt-Sync-Windows.exe`

---

## macOS Apple Silicon (`npm run dist:mac`)

| File | Chi lo usa |
|------|------------|
| `Easyfatt-Sync-macOS-arm64.dmg` | **Download clienti** / sito web |
| `latest-mac.yml` | electron-updater |
| `Easyfatt-Sync-macOS-arm64.dmg.blockmap` | electron-updater (delta) |

**Link latest:**  
`https://github.com/DanielMatei0/easyfatt-sync/releases/latest/download/Easyfatt-Sync-macOS-arm64.dmg`

---

## macOS Intel (`npm run dist:mac:intel`)

| File | Chi lo usa |
|------|------------|
| `Easyfatt-Sync-macOS-x64.dmg` | **Download clienti** (Mac Intel) |
| `latest-mac.yml` | electron-updater (una release può includere entrambe le arch) |
| `Easyfatt-Sync-macOS-x64.dmg.blockmap` | electron-updater |

**Link latest:**  
`https://github.com/DanielMatei0/easyfatt-sync/releases/latest/download/Easyfatt-Sync-macOS-x64.dmg`

---

## Configurazione `package.json`

```json
"win": {
  "artifactName": "Easyfatt-Sync-Windows.${ext}"
},
"mac": {
  "artifactName": "Easyfatt-Sync-macOS-${arch}.${ext}"
}
```

---

## Checklist upload release

1. Incrementa `version` in `package.json`.
2. Build su macchina corretta (`dist:win` / `dist:mac`).
3. Crea tag `vX.Y.Z` e GitHub Release.
4. Carica **tutti** i file sopra per le piattaforme supportate.
5. Verifica che `latest.yml` / `latest-mac.yml` puntino ai nomi stabili (generati da electron-builder).

Non committare `dist/` nel repository.
