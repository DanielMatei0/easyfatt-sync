# Easyfatt Sync — Guida per l'utente

*Versione documentazione allineata a Easyfatt Sync **26.0.0** (2026).*

Questa guida spiega come usare **Easyfatt Sync**, l'applicazione di Aven Labs che aggiorna automaticamente un foglio **Google Sheets** con i clienti esportati da **Easyfatt**.

Non serve essere esperti di informatica: segui i passaggi in ordine la prima volta, poi l'app lavorerà in automatico per te.

---

## Indice

1. [Cos'è Easyfatt Sync](#1-cosè-easyfatt-sync)
2. [Requisiti](#2-requisiti)
3. [Installazione](#3-installazione)
4. [Collegamento Google](#4-collegamento-google)
5. [Configurazione](#5-configurazione)
6. [Più sincronizzazioni (profili)](#6-più-sincronizzazioni-profili)
7. [Sincronizzazione](#7-sincronizzazione)
8. [Cronologia e dettaglio sync](#8-cronologia-e-dettaglio-sync)
9. [Notifiche](#9-notifiche)
10. [Backup](#10-backup)
11. [Marketing](#11-marketing)
12. [Aggiornamenti](#12-aggiornamenti)
13. [Supporto](#13-supporto)
14. [Privacy](#14-privacy)
15. [Risoluzione problemi](#15-risoluzione-problemi)
16. [Contatti](#16-contatti)

---

## 1. Cos’è Easyfatt Sync

**Easyfatt Sync** è un programma per **Windows** e **Mac** che:

1. Legge il file **Excel** che esporti da Easyfatt (elenco clienti).
2. Aggiorna un foglio **Google Sheets** che hai scelto tu.

In pratica, ogni volta che sincronizzi, il foglio Google riflette i dati più recenti del tuo Excel — utile per report, condivisione con il team o integrazioni che leggono Google Sheets.

**Cosa non fa l’app:**

- Non sostituisce Easyfatt.
- Non modifica il file Excel di Easyfatt (lo legge).
- Non invia i tuoi dati clienti ad Aven Labs: restano sul tuo PC, su Google e nel file che configuri tu.

---

## 2. Requisiti

Prima di iniziare, verifica di avere:


| Requisito            | Dettaglio                                                               |
| -------------------- | ----------------------------------------------------------------------- |
| Sistema operativo    | **Windows 10/11** oppure **macOS** (versione recente)                   |
| Account Google       | Gmail o Google Workspace con accesso a Google Sheets                    |
| Easyfatt             | Capacità di **esportare** l’elenco clienti in formato **Excel (.xlsx)** |
| Google Sheet         | Un foglio di calcolo già creato (o permesso di crearne uno)             |
| Connessione internet | Necessaria per Google e per eventuali aggiornamenti dell’app            |


---

## 3. Installazione

### Download

Scarica l’installer dalla pagina o dal link fornito da **Aven Labs** (sito o email di attivazione).

- **Windows:** file `.exe` (installer).
- **Mac:** file `.dmg`.

### Installazione su Windows

1. Apri il file `.exe`.
2. Segui la procedura guidata (Avanti → Installa).
3. Alla fine, avvia **Easyfatt Sync** dal menu Start.

### Installazione su Mac

1. Apri il file `.dmg`.
2. Trascina **Easyfatt Sync** nella cartella **Applicazioni**.
3. Apri l’app da Applicazioni.

Se macOS segnala **«sviluppatore non identificato»** (normale per versioni beta non notarizzate):

- **Tasto destro** su **Easyfatt Sync** in Applicazioni → **Apri** → nel dialogo clicca di nuovo **Apri**, oppure
- **Impostazioni di Sistema** → **Privacy e sicurezza** → **Apri comunque** (compare dopo il primo tentativo bloccato).

Le versioni ufficiali future, una volta notarizzate da Aven Labs, non richiederanno questo passaggio.

### Primo avvio

Alla prima apertura l’app può chiederti di:

- **Accettare Privacy Policy e Termini** — necessario per continuare.
- **Collegare Google** — lo vediamo nel capitolo successivo.

Dopo l’accettazione vedrai la schermata principale con le impostazioni e lo stato della sincronizzazione.

---

## 4. Collegamento Google

Per scrivere su Google Sheets l’app deve collegarsi al tuo account Google **una volta** (salva l’autorizzazione sul computer).

### Passaggi

1. Nell’app, apri la sezione **Google** (o usa il pulsante **Collega Google**).
2. Clicca **Collega Google**.
3. Si apre il **browser** con la pagina di accesso Google.
4. Accedi con l’account che possiede il foglio Google da aggiornare.
5. Se richiesto, **autorizza** l’accesso a Google Sheets.
6. Torna all’app: lo stato dovrebbe indicare che Google è **collegato**.

### Suggerimenti

- Usa lo stesso account Google con cui hai creato o condiviso il foglio.
- Se chiudi il browser prima di finire, ripeti “Collega Google”.
- Per scollegare l’account usa **Disconnetti Google** nelle impostazioni.

---

## 5. Configurazione

Apri le **Impostazioni** nell’app e compila questi campi essenziali.

### File Excel Easyfatt

- Clicca **Sfoglia** e seleziona il file `.xlsx` che Easyfatt esporta (es. elenco clienti).
- Il percorso completo apparirà nel campo (es. `C:\AvenSync\clienti.xlsx`).

**Suggerimento:** dopo ogni export da Easyfatt, se il percorso è lo stesso non devi riselezionare il file.

### ID foglio Google (Spreadsheet ID)

È il codice lungo nell’indirizzo del tuo Google Sheet:

```text
https://docs.google.com/spreadsheets/d/QUESTO_È_L_ID/edit
```

Copia solo la parte `QUESTO_È_L_ID` e incollala nel campo **ID foglio Google**.

### Nome scheda (foglio interno)

È il nome della **tab** in basso nel foglio Google, di solito:

```text
Clienti
```

Deve corrispondere **esattamente** al nome della scheda (maiuscole/minuscole incluse).

### Salvataggio

Clicca **Salva impostazioni** in fondo alla colonna impostazioni. Senza salvare, le modifiche non restano attive dopo la chiusura dell’app.

### Altre opzioni utili


| Opzione                   | Cosa fa                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| Avvio con Windows / login | Apre l’app all’accensione del PC (se disponibile sulla tua versione) |
| Tema chiaro/scuro         | Cambia aspetto dell’interfaccia                                      |
| Monitoraggio file         | Sync automatica quando il file Excel cambia                          |
| Sync programmata          | Sync a orari fissi (es. 09:00, 13:00, 18:00)                         |

### Dashboard “Stato sistema”

In cima all’app trovi la risposta a **“Sta funzionando tutto?”**:

- **Operativo** — tutto ok
- **Attenzione** — qualcosa da verificare (es. nessuna sync oggi)
- **Errore** — problema da risolvere (es. Google non collegato)

Vedi anche ultima sync, prossima sync programmata, connessioni attive, file monitorati, righe sincronizzate oggi e stato Google.

### Configurazione guidata

Se non hai ancora nessuna sincronizzazione configurata, vedrai un grande pulsante **Inizia configurazione guidata** nella dashboard. Il wizard ti aiuta in 6 passi:

1. **Benvenuto** — anteprima di cosa farai
2. **Google** — colleghi il tuo account (saltato in automatico se già collegato)
3. **File Excel** — scegli il file esportato da Easyfatt; controlliamo che sia leggibile
4. **Foglio Google** — incolla il codice del foglio (puoi anche incollare l’intero URL: lo estraiamo noi)
5. **Verifica** — controlliamo file, Google e foglio
6. **Riepilogo + prima sync** — confermi e parte la sincronizzazione

Puoi **saltare** il wizard in qualsiasi momento: non viene creato nessun profilo vuoto e non lo rivedrai più all’avvio.

Per riaprirlo, clicca **Apri configurazione guidata** dalla sezione *Connessioni sync*.

### Mapping colonne (opzionale)

Nella modifica connessione, apri **Mapping colonne**:

1. Clicca **Carica intestazioni dal file**
2. Controlla l’anteprima delle prime righe
3. Assegna ogni colonna Excel alla colonna desiderata su Google Sheets

Se non configuri il mapping, le colonne Excel vengono copiate con lo stesso nome.

---

## 6. Più sincronizzazioni (profili)

Easyfatt Sync supporta **più sincronizzazioni nella stessa app**. Ogni "profilo" collega un file Excel a un foglio Google Sheets ed ha le sue automazioni.

### Aggiungere una nuova sincronizzazione

1. Vai nella sezione **Connessioni sync**.
2. Clicca **Aggiungi sincronizzazione** (oppure **Apri configurazione guidata** se è la prima).
3. Compila:
   - **Nome** (es. `Clienti negozio`, `Clienti b2b`)
   - **File Excel** (esportato da Easyfatt)
   - **ID foglio Google** e **Nome scheda**
   - (Opzionale) **Mapping colonne**
4. **Salva impostazioni**.

Quando hai già almeno un profilo, il pulsante grande in dashboard diventa **"Configura un'altra sincronizzazione"**.

### Modificare o eliminare una sincronizzazione

- Nella card del profilo: **Modifica** per cambiare i dati, **Elimina** per rimuoverlo.
- L'eliminazione cancella **anche gli snapshot** locali di quel profilo (vedi [Cronologia](#8-cronologia-e-dettaglio-sync)).

### Come trovare l'ID di un Google Sheet

Apri il foglio in Google Sheets. L'URL ha questa forma:

```text
https://docs.google.com/spreadsheets/d/1AbCdEfG_h-iJkLmNoPqRsTuVwXyZ123456/edit#gid=0
                                       └──────── ID del foglio ────────────┘
```

L'**ID foglio Google** è la parte tra `/d/` e `/edit`. Copiala e incollala nel campo apposito. Puoi anche incollare l'**intero URL**: il wizard estrae l'ID automaticamente.

Il **nome scheda** è il nome della tab in basso (es. `Clienti`, `Foglio1`).

---

## 7. Sincronizzazione

### Sincronizzazione manuale

1. Controlla che Google sia collegato e le impostazioni siano salvate.
2. Clicca **Sincronizza ora**.
3. Attendi il messaggio di completamento (numero clienti aggiornati).

Durante la sync non chiudere il file Excel in Easyfatt se possibile.

### Sincronizzazione automatica (monitoraggio file)

Se attivi **Monitoraggio file**:

- Quando Easyfatt salva un nuovo export sullo stesso file Excel, l’app rileva la modifica.
- Dopo qualche secondo avvia da sola una sincronizzazione.

Utile se esporti spesso e vuoi il foglio Google sempre aggiornato.

### Sincronizzazione programmata

Se attivi **Sync programmata**:

- Imposta uno o più orari (un orario per riga, formato `09:00`).
- L’app sincronizza a quegli orari anche se il file non è cambiato.

### Cosa succede durante la sync

L'app legge l'Excel, si collega a Google e **aggiorna il foglio** con i dati attuali. L'operazione può richiedere da pochi secondi a qualche minuto se ci sono molti clienti.

---

## 8. Cronologia e dettaglio sync

Nella sezione **Cronologia sync** trovi tutti gli eventi delle ultime sincronizzazioni (fino agli ultimi 500).

### Cosa vedi nella lista

Per ogni evento:

- **Stato** (successo / errore)
- **Profilo** che ha sincronizzato
- **Data e ora**
- **Durata**
- **Numero righe** sincronizzate
- **Mini badge** che riassumono le modifiche: **+ aggiunte**, **~ modificate**, **− rimosse**

### Filtri ed export

- Filtra per **profilo** o per **stato**.
- Clicca **Esporta report** per salvare un file JSON di archivio o da allegare al supporto.
- Clicca **Pulisci cronologia** per azzerare cronologia e snapshot locali.

### Vedere cosa è cambiato — **Dettaglio sincronizzazione**

Clicca su un evento della cronologia per aprire la **finestra Dettaglio sincronizzazione**, che ti mostra **esattamente cosa è cambiato** rispetto alla sync precedente.

La finestra contiene:

1. **Riepilogo**: stato, profilo, data, durata, file e foglio.
2. **Conteggi**: righe aggiunte, modificate, rimosse, invariate.
3. **Tre tab** con il confronto stile *GitHub diff*:
   - **Aggiunte** (verde) — clienti / righe comparsi rispetto alla volta prima.
   - **Modificate** (giallo) — per ciascun cliente cambiato vedi i singoli campi con `Prima → Dopo`.
   - **Rimosse** (rosso) — clienti / righe spariti dal file.

#### Come funziona dietro le quinte

Prima di ogni sincronizzazione, l'app salva una **fotografia locale** (snapshot) delle righe del tuo Excel. Alla sync successiva confronta la fotografia precedente con quella nuova e ti mostra le differenze.

> La prima sync di un profilo non ha una fotografia precedente, quindi il dettaglio è semplicemente **"Primo snapshot"** (tutte le righe sono "stato iniziale", non "aggiunte" in senso di confronto).

#### Privacy del dettaglio

- Le fotografie restano **solo sul tuo computer**.
- **Non** sono inviate ad Aven Labs, anche con le richieste di supporto.
- **Non** sono incluse nei backup di default.
- Puoi cancellarle in qualunque momento con **Pulisci cronologia**.

---

## 9. Notifiche

### Notifiche desktop

Se **Notifiche desktop** è attiva:

- Ricevi un avviso quando la sincronizzazione **va a buon fine** o in caso di **errore**.
- Le notifiche dipendono dalle impostazioni di Windows o macOS (assicurati che siano consentite per Easyfatt Sync).

### Promemoria se nessuna sync oggi

Se attivi **Promemoria se nessuna sync oggi**:

- Negli orari che imposti (es. 12:00 e 19:00) l’app ti avvisa **solo se** in quel giorno non hai ancora sincronizzato.
- Serve a non dimenticare l'aggiornamento del foglio Google.

---

## 10. Backup

Il backup salva le **impostazioni dell’app** (percorsi, orari, preferenze), non il file Excel e non il contenuto del foglio Google.

### Backup manuale

1. Apri **Backup e ripristino**.
2. (Opzionale) Spunta **Includi collegamento Google nel backup** solo se devi spostare l’app su un altro PC e vuoi evitare di ricollegare Google. **Conserva il file in modo sicuro.**
3. Clicca **Crea backup** e scegli dove salvare il file `.json`.

### Backup automatici

Puoi programmare backup delle impostazioni:

1. Attiva **Backup automatico**.
2. Scegli **frequenza** (giornaliero, settimanale, mensile) e **orario**.
3. Seleziona la **cartella destinazione** con **Sfoglia**.
4. Imposta quanti backup tenere (**Mantieni ultimi N backup**).
5. **Salva impostazioni**.

I file automatici hanno data e ora nel nome. I backup manuali non vengono cancellati dalla rotazione automatica.

### Ripristino backup

1. Clicca **Ripristina backup**.
2. Seleziona il file di backup.
3. Conferma: le impostazioni attuali saranno **sostituite**.
4. Se il backup non includeva Google, dovrai **ricollegare Google**.

**Quando usarlo:** cambio PC, reinstallazione, o dopo aver modificato per errore le impostazioni.

> Nota privacy: i **dettagli diff** della cronologia (snapshot delle righe Excel) **non** vengono inclusi nei backup.

---

## 11. Marketing

La sezione **Marketing** ti permette di preparare **automazioni email** basate sui dati del file Excel collegato a un profilo sync (clienti, fidelity, punti, consensi).

### Simulazione e invio reale

Per impostazione predefinita l’app è in **modalità simulazione** (badge «Simulazione»): le email vengono preparate e registrate nello storico locale, **senza invio ai clienti**.

L’**invio reale** (badge «Invio reale attivo») si abilita in **Impostazioni marketing → Dati azienda e brand** ed è gestito dal **backend Aven Labs** (non dal tuo PC). In questo modo:

- non servono chiavi API sul computer del negozio;
- il **reply-to** delle email è quello che hai configurato (email risposta del negozio);
- ogni invio manuale richiede la conferma: *«Confermo di avere il consenso marketing dei destinatari»*.

**Limiti:** massimo **50 destinatari** per singolo invio; automazioni giornaliere rispettano le regole anti-duplicati (es. un augurio di compleanno all’anno per cliente).

### Configurazione guidata

1. Apri **Marketing** dalla barra laterale.
2. Clicca **Configura Marketing** e completa i 4 passi:
   - scegli il **profilo sync** Excel;
   - **mappa le colonne** (nome, email, data nascita, punti, consenso, ecc.);
   - imposta **mittente** e nome negozio;
   - conferma e attiva.

### Automazioni disponibili

| Tipo | Quando si attiva |
|------|------------------|
| **Compleanno** | Cliente con compleanno oggi |
| **Soglia punti** | Punti fidelity ≥ soglia impostata |
| **Nuova fidelity** | Attivazione card in data odierna |
| **Cliente inattivo** | Nessun acquisto da N giorni |

Per ogni automazione puoi:

- scegliere un **template email**;
- vedere l’**anteprima destinatari** (validi / senza email / senza consenso);
- **simulare l’invio** (locale);
- **testare il backend** (dry-run, nessuna email inviata);
- **inviare email reali** (solo con invio reale attivo e conferma consenso);
- inviare un’**email di test** (simulata in locale);

### Template email (editor visuale)

I template si compongono con **blocchi** (titolo, testo, bottone, premio, footer) — **non serve scrivere HTML**. Logo e colori del negozio si impostano in **Dati azienda e brand**.

Variabili disponibili: `{{firstName}}`, `{{lastName}}`, `{{points}}`, `{{businessName}}`, `{{fidelityCardNumber}}`, `{{birthday}}`, `{{reward}}`.

### Consensi

Nella scheda **Consensi** puoi richiedere che venga inviato solo a clienti con consenso marketing valido, e definire i valori della colonna Excel considerati validi (es. `sì`, `true`, `1`).

### Storico e backup

- Lo **storico invii** resta sul PC e non viene incluso nel file di backup (per privacy).
- Le impostazioni marketing (profili, automazioni, template, mittente) **sono incluse** nel backup delle impostazioni.

---

## 12. Aggiornamenti

Easyfatt Sync può aggiornarsi alle nuove versioni pubblicate da Aven Labs.

### Controllo aggiornamenti

Nella sezione **Aggiornamenti**:

1. Clicca **Controlla aggiornamenti**.
2. Se c’è una versione nuova, l’app te lo indica.

> In modalità sviluppo (non installer ufficiale) il controllo può dire che gli aggiornamenti sono disponibili solo nella versione installata.

### Installazione aggiornamento

1. Quando disponibile, clicca **Scarica aggiornamento**.
2. Al termine del download, clicca **Installa e riavvia**.
3. L’app si chiude e si riapre con la versione aggiornata.

Gli aggiornamenti **non** cancellano le tue impostazioni.

> Easyfatt Sync usa un versioning **per anno** (es. `26.x.x` = 2026). Un aggiornamento da `26.0.0` a `26.1.0` aggiunge nuove funzioni mantenendo compatibilità; un aggiornamento di MAJOR (`26 → 27`) significa nuovo anno di prodotto.

---

## 13. Supporto

Se qualcosa non funziona o hai dubbi sull’uso:

### Dall’app

1. Clicca **Contatta il supporto** (o voce equivalente nel menu/footer).
2. Compila il modulo: nome attività, email, tipo di problema, descrizione.
3. Opzionale: allega **report diagnostico** spuntando la casella e autorizzando l’invio di informazioni tecniche (senza token Google né dati Excel).
4. Invia: riceverai una **email di conferma** all’indirizzo indicato.

### Via email

Scrivi direttamente a:

**[support@aven-labs.com](mailto:support@aven-labs.com)**

Indica:

- sistema operativo (Windows o Mac);
- cosa stavi facendo;
- messaggio di errore se compare.

---

## 14. Privacy

In sintesi:


| Dato                        | Dove resta                                              |
| --------------------------- | ------------------------------------------------------- |
| File Excel clienti          | Sul **tuo computer** (percorso che scegli tu)           |
| Dati nel foglio Google      | Nel **tuo Google Drive** / account Google               |
| Impostazioni app            | Sul **tuo computer** (configurazione locale)            |
| Token Google (collegamento) | Sul **tuo computer**, cartella dedicata Easyfatt Sync   |
| Snapshot diff (cronologia)  | Sul **tuo computer**, **mai** inviati al supporto       |
| Richiesta supporto          | Inviata ad Aven Labs solo se compili il modulo supporto |


Aven Labs non riceve automaticamente l’elenco dei tuoi clienti tramite la sincronizzazione.

Per i dettagli legali consulta **Privacy Policy** e **Termini** linkati nell'app al primo avvio.

---

## 15. Risoluzione problemi

### Google non collegato

**Messaggio:** invito a collegare Google o sync che non parte.

**Cosa fare:**

1. Clicca **Collega Google** e completa il login nel browser.
2. Se fallisce, **Disconnetti Google** e collega di nuovo.
3. Verifica connessione internet.

---

### La sincronizzazione non parte

**Controlla:**

- Impostazioni **salvate**
- Percorso **file Excel** corretto
- **ID foglio Google** e **nome scheda** corretti
- Google **collegato**
- File Excel **esistente** (export fatto da Easyfatt)

---

### File Excel non trovato

**Cause comuni:**

- Percorso cambiato dopo aver spostato il file.
- Lettera di unità di rete non disponibile.

**Cosa fare:** **Sfoglia** e seleziona di nuovo il file, poi **Salva impostazioni**.

---

### Il file Excel è in uso / errore lettura file

Easyfatt o Excel potrebbero tenere il file aperto.

**Cosa fare:**

1. Chiudi l’export in Easyfatt se possibile.
2. Chiudi Microsoft Excel se il file è aperto lì.
3. Riprova **Sincronizza ora**.

---

### Foglio Google non si aggiorna come previsto

**Verifica:**

- L’**ID foglio** è quello del documento giusto.
- Il **nome scheda** coincide con la tab in basso (es. `Clienti`).
- L’account Google collegato ha **permesso di modifica** sul foglio.

---

### Aggiornamento non disponibile

- Se usi una copia di prova non installata ufficialmente, gli aggiornamenti automatici potrebbero non essere attivi.
- Se hai l’installer ufficiale, controlla la connessione e riprova più tardi.

---

### Backup automatico non crea file

**Verifica:**

- Backup automatico **attivo** e impostazioni **salvate**.
- **Cartella destinazione** selezionata e scrivibile.
- Orario e frequenza impostati correttamente.

---

## 16. Contatti


| Canale         | Dettaglio                                             |
| -------------- | ----------------------------------------------------- |
| Email supporto | [support@aven-labs.com](mailto:support@aven-labs.com) |
| Sito           | [aven-labs.com](https://aven-labs.com)                |
| Prodotto       | Easyfatt Sync — Aven Labs                             |


---

Grazie per aver scelto **Easyfatt Sync**. Per approfondimenti tecnici (sviluppatori e partner IT) consulta la [documentazione sviluppatori](../developer/README.md).