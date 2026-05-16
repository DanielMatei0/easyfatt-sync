# Aggiornamenti Easyfatt Sync (electron-updater)

## Prerequisiti

1. Configurare `package.json` → `build.publish` con owner e repo GitHub reali (sostituire `TUO_OWNER_GITHUB` e `TUO_REPO_GITHUB`).
2. **Non** inserire token GitHub nel codice. Usare variabile d’ambiente `GH_TOKEN` per la publish da CI o da macchina di build.

## Workflow release

1. Incrementare la versione in `package.json` (es. `1.0.1`).
2. Eseguire la build Windows dalla macchina di build:
   ```bash
   npm run dist
   ```
3. Creare una **GitHub Release** con tag uguale alla versione (es. `v1.0.1`).
4. Allegare alla release i file generati in `dist/`, in particolare:
   - installer NSIS (`.exe`)
   - `latest.yml` (generato da electron-builder — necessario per electron-updater)
   - eventuali file `.blockmap` se presenti
5. L’app installata controllerà `latest.yml` sul repository configurato e proporrà l’aggiornamento all’utente.

## Comportamento in App

- Gli aggiornamenti partono solo se `app.isPackaged === true` (versione installata, non `npm run dev`).
- In sviluppo, “Controlla aggiornamenti” mostra: *Aggiornamenti disponibili solo nella versione installata.*
- Il download non parte senza consenso: l’utente deve cliccare **Scarica aggiornamento** dopo che è disponibile una nuova versione.
- L’installazione non parte senza consenso: l’utente deve cliccare **Installa e riavvia** dopo il download.
- All’avvio l’app controlla automaticamente gli aggiornamenti dopo circa 4 secondi (solo versione installata).
- Gli errori di update non bloccano la sincronizzazione Excel → Google Sheets.

## Log

I log dell’updater sono scritti tramite `electron-log` (cartella log dell’app sul sistema operativo).
