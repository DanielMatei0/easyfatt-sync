# Asset applicazione (icone)

| File | Uso |
|------|-----|
| `icon.png` | Sorgente master (consigliato ≥1024×1024), icona in sviluppo |
| `icon.ico` | Installer Windows NSIS |
| `icon.icns` | DMG / `.app` macOS |

## Windows — `icon.ico`

```bash
npm run icons:win
```

## macOS — `icon.icns` (solo su Mac)

```bash
npm run icons:mac
```

Lo script `scripts/generate-icon-icns.sh`:

1. Crea `assets/icon.iconset` (temporanea)
2. Ridimensiona con `sips` (16 … 1024 px)
3. Converte con `iconutil` → `assets/icon.icns`
4. Rimuove l’iconset

Senza `icon.icns`, la build Mac può fallire o usare un’icona generica: esegui `npm run icons:mac` prima di `npm run dist:mac`.

Committa `icon.ico` e `icon.icns` nel repo se vuoi evitare rigenerazione in CI.
