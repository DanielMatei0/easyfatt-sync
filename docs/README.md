# Documentazione Easyfatt Sync

Benvenuto nella documentazione ufficiale di **Easyfatt Sync**, l’applicazione desktop di Aven Labs che collega l’export clienti di Easyfatt a Google Sheets.

Questa cartella raccoglie tutta la documentazione del prodotto, organizzata per pubblico e obiettivo.

---

## A chi serve cosa

| Documento | Pubblico | Contenuto |
|-----------|----------|-----------|
| [Documentazione sviluppatori](./developer/README.md) | Team tecnico, maintainer, integratori | Architettura, codice, build, OAuth, release, sicurezza |
| [Guida cliente](./client/README.md) | Utenti finali, assistenza commerciale | Installazione, configurazione, sync, backup, FAQ |

---

## Panoramica prodotto

**Easyfatt Sync** è un’app **Electron** per **Windows** e **macOS** che:

- legge il file Excel esportato da Easyfatt;
- aggiorna un foglio Google Sheets con l’elenco clienti;
- supporta sincronizzazione manuale, automatica (su modifica file) e programmata;
- gestisce collegamento Google tramite OAuth;
- offre backup/ripristino delle impostazioni, aggiornamenti automatici e richiesta supporto integrata.

**Sviluppatore:** Aven Labs  
**Repository GitHub (publish aggiornamenti):** `DanielMatei0/easyfatt-sync`  
**Supporto:** [support@aven-labs.com](mailto:support@aven-labs.com) · [aven-labs.com](https://aven-labs.com)

---

## Struttura cartella `docs`

```
docs/
├── README.md                 ← indice generale (questo file)
├── developer/
│   └── README.md             ← documentazione tecnica completa
├── client/
│   └── README.md             ← guida utente finale
└── assets/
    └── README.md             ← riservata a screenshot e diagrammi futuri
```

---

## Link utili nel repository

| Risorsa | Percorso |
|---------|----------|
| Codice applicazione | Root del progetto (`main.js`, `renderer/`, moduli Node) |
| Workflow aggiornamenti | [`UPDATES.md`](../UPDATES.md) |
| Privacy (testo legale) | [`legal/privacy-easyfatt-sync.md`](../legal/privacy-easyfatt-sync.md) |
| Termini (testo legale) | [`legal/terms-easyfatt-sync.md`](../legal/terms-easyfatt-sync.md) |
| Esempio API supporto | [`backend-examples/nextjs/`](../backend-examples/nextjs/) |

---

## Come contribuire alla documentazione

1. Modifiche **tecniche** → aggiorna `docs/developer/README.md` e, se serve, `UPDATES.md`.
2. Modifiche **lato utente** → aggiorna `docs/client/README.md` con linguaggio semplice.
3. Nuove schermate o diagrammi → aggiungi file in `docs/assets/` e collega i markdown.

Mantieni **italiano**, testi reali (no placeholder) e coerenza con il comportamento attuale dell’app.
