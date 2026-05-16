# Easyfatt Sync 26.0.0

**Prima release ufficiale del ciclo prodotto 2026.**

Easyfatt Sync passa a un versioning **calendar-based** allineato all'anno (vedi [`VERSIONING.md`](VERSIONING.md)). Questa release porta un redesign completo dell'interfaccia, profili di sincronizzazione multipli, dashboard di salute, cronologia dettagliata con confronto stile GitHub diff, e una pipeline di release CI/CD su GitHub Actions.

---

## Cosa c'è di nuovo

### Interfaccia ridisegnata

- **Nuovo layout a tre colonne** (sidebar · area centrale · pannello stato & attività) ispirato ai prodotti desktop premium.
- **Sidebar di navigazione** con sezioni dedicate: Dashboard, Connessioni sync, Cronologia, Notifiche, Backup, Aggiornamenti, Supporto, Impostazioni.
- **Tema chiaro/scuro** completo, persistito tra sessioni.
- **Layout responsive** a 4 breakpoint: la sidebar diventa compatta (solo icone) sui monitor più piccoli e una tab bar orizzontale sui formati tablet.
- **Empty state intelligente**: il primo wizard appare solo quando nessuna sincronizzazione è configurata; il testo cambia da *"Configura la tua prima sincronizzazione"* a *"Configura un'altra sincronizzazione"* se esiste già almeno un profilo.

### Sincronizzazioni multiple (profili)

- Più profili Excel → Google Sheets nella stessa app, ciascuno con automazioni indipendenti.
- Ogni profilo ha un nome, un foglio di destinazione, mapping colonne dedicato, e statistiche proprie.

### Dashboard "Stato sistema"

- Risposta immediata a *"Sta funzionando tutto?"*: **Operativo / Attenzione / Errore**.
- Card con: ultima sync, prossima sync programmata, connessioni attive, file monitorati, righe sincronizzate oggi, stato Google.

### Cronologia + Dettaglio sincronizzazione (NEW)

- Cronologia locale fino a **500 eventi**, con filtri per profilo e stato, ed esportazione report JSON.
- **Nuova vista "Dettaglio sincronizzazione"**: cliccando su un evento si apre una finestra che mostra **cosa è cambiato** tra una sync e l'altra:
  - Riepilogo: stato, profilo, data, durata, file, foglio.
  - Metriche: righe aggiunte, modificate, rimosse, invariate.
  - Confronto **stile GitHub diff** con tab dedicati per:
    - Righe **aggiunte** (verde)
    - Righe **modificate** (giallo, con `before` / `after` per ciascun campo)
    - Righe **rimosse** (rosso)
- **Privacy first**: i dati di confronto restano **locali**, non vengono inviati al supporto né inclusi nei backup di default.
- **Pulisci cronologia**: pulsante dedicato che azzera cronologia ed eventuali snapshot.

### Mapping colonne per profilo

- Anteprima delle intestazioni Excel.
- Assegnazione colonna-per-colonna a Google Sheets.
- Salvataggio per profilo.

### Onboarding guidato

- Wizard in 6 passi: benvenuto, Google, file Excel, foglio Google, verifica, riepilogo + prima sync.
- Saltabile in qualsiasi momento, non crea profili vuoti.
- Riapribile via *"Apri configurazione guidata"*.

### Automazioni

- **Monitoraggio file** con `chokidar` e debounce 5s (riavvio sync automatico al salvataggio Easyfatt).
- **Sync programmata** via `node-cron` su uno o più orari giornalieri.
- **Promemoria sync mancata**: notifica solo se in giornata non è ancora stata fatta una sync.
- **Notifiche desktop** native su successo/errore.

### Backup e ripristino

- Backup manuale e **automatico** (giornaliero / settimanale / mensile).
- Rotazione automatica (mantiene ultimi N backup automatici, senza toccare i manuali).
- Inclusione opzionale del token Google nel backup (con avviso esplicito).
- Restore con validazione `backupVersion` e migrazione config.

### Supporto integrato

- Modulo dalla sezione **Supporto** con consenso esplicito all'invio.
- **Report diagnostico** sanitizzato (mai token Google, mai dati Excel, mai dettaglio diff).
- Conferma automatica via email.

### Aggiornamenti automatici

- `electron-updater` su GitHub Releases.
- Download e installazione **solo con consenso utente**.
- Check automatico ~4s dopo l'avvio (solo versione installata).

### CI/CD GitHub Actions (NEW)

- Workflow `.github/workflows/release.yaml` builda Windows e macOS automaticamente al push di un tag `v*.*.*`.
- Credenziali OAuth iniettate da secret `OAUTH_CREDENTIALS_JSON` (mai nel repo).
- Asset stabili pubblicati direttamente sulla GitHub Release.

---

## Note installazione

### Windows

1. Scarica `Easyfatt-Sync-Windows.exe` dalla [Release GitHub](https://github.com/DanielMatei0/easyfatt-sync/releases/latest).
2. Esegui l'installer (NSIS): scegli cartella, shortcut Desktop e menu Start.
3. Avvia **Easyfatt Sync** dal menu Start.

SmartScreen può segnalare l'app come sconosciuta (firma in fase di acquisizione). Clicca **Ulteriori informazioni → Esegui comunque**.

### macOS (non notarizzata in questa release)

1. Scarica `Easyfatt-Sync-macOS-arm64.dmg` (Apple Silicon) o `Easyfatt-Sync-macOS-x64.dmg` (Intel).
2. Apri il `.dmg` e trascina **Easyfatt Sync** in **Applicazioni**.
3. Al primo avvio macOS può segnalare *"sviluppatore non identificato"*:
   - **Tasto destro** sull'app → **Apri** → conferma **Apri**, **oppure**
   - **Impostazioni di Sistema** → **Privacy e sicurezza** → **Apri comunque**.

La notarizzazione Apple è in pipeline per le prossime release minor — vedi [`macos-notarization-future.md`](docs/developer/macos-notarization-future.md).

---

## Privacy e dati

| Dato | Dove resta |
|---|---|
| File Excel clienti | **Sul tuo computer** (percorso che scegli tu) |
| Dati nel foglio Google | **Nel tuo Google Drive** |
| Impostazioni app | **Sul tuo computer** (electron-store / userData) |
| Token Google | **Sul tuo computer** (`EasyfattSync/token.json`) |
| Snapshot diff (cronologia dettagliata) | **Sul tuo computer**, non in backup, non in supporto |
| Richiesta supporto | Inviata ad Aven Labs **solo** quando compili il modulo |

Aven Labs non riceve automaticamente i tuoi dati clienti tramite la sincronizzazione. Dettagli completi in **Privacy Policy** e **Termini** linkati nell'app al primo avvio.

---

## Aggiornamenti automatici

- Se sei su **1.0.x** e aggiorni a **26.0.0**: l'updater proporrà l'aggiornamento normalmente (lo schema `26.x.x` è SemVer-compatibile, MAJOR maggiore = più recente).
- Le impostazioni esistenti vengono **migrate automaticamente** verso il nuovo schema profili (`syncProfiles`).
- I backup creati su `1.0.x` restano ripristinabili su `26.0.0`.

---

## Compatibilità

| Componente | Versione |
|---|---|
| Electron | 42.x |
| Node.js (in Electron) | 22.x |
| electron-builder | 26.x |
| Piattaforme | Windows 10/11 x64, macOS 12+ (ARM64 + Intel) |
| Google API scope | `https://www.googleapis.com/auth/spreadsheets` |
| Backup version | `1.0` |

---

## Documentazione

- [Guida utente (italiano)](docs/client/README.md)
- [Documentazione tecnica sviluppatori](docs/developer/README.md)
- [Strategia versioning](VERSIONING.md)
- [Workflow release](UPDATES.md)
- [Politica di sicurezza](SECURITY.md)

---

## Ringraziamenti

Grazie ai clienti early-adopter che hanno fornito feedback sulle versioni 1.0.x e hanno reso possibile il salto a un prodotto "year-aligned" più stabile e organizzato.

**Aven Labs** — Maggio 2026
