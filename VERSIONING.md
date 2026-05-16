# Versioning — Easyfatt Sync

Dalla release **26.0.0** (Maggio 2026) Easyfatt Sync usa un versioning **calendar-based** ispirato allo schema Apple, dove il numero MAJOR rappresenta l'**anno di riferimento del prodotto**.

---

## Schema

```
MAJOR . MINOR . PATCH
   │       │      │
   │       │      └──── bugfix, hotfix
   │       └─────────── feature update durante l'anno
   └─────────────────── anno di riferimento (26 = 2026)
```

| Versione | Significato |
|---|---|
| `26.0.0` | Prima release ufficiale **2026** |
| `26.0.1` | Bugfix rapido sulla 26.0 |
| `26.1.0` | Nuova feature (es. nuova vista, automazione, mapping) |
| `26.2.0` | Successivo feature update 2026 |
| `27.0.0` | Prima release **2027** |

---

## Cosa significa MAJOR (e cosa no)

**Significato:** L'anno di riferimento del ciclo prodotto. Allinea Easyfatt Sync alle release annuali Aven Labs.

**Non implica automaticamente breaking change.** Easyfatt Sync mantiene la compatibilità interna (formato config, backup, OAuth) attraverso le versioni, salvo eccezioni comunicate nelle **Release Notes**.

Eventuali rotture vengono sempre:

1. Documentate in [`RELEASE_NOTES.md`](RELEASE_NOTES.md).
2. Gestite con migrazione automatica della config (vedi `syncState.js`).
3. Annunciate ai clienti via email/changelog.

---

## Quando incrementare MINOR vs PATCH

Durante l'anno (es. `26.x.x`):

| Tipo modifica | Incremento |
|---|---|
| Bugfix, typo, fix UI minore | **PATCH** (`26.0.1`) |
| Hotfix per crash o sync rotta | **PATCH** |
| Nuova opzione configurazione | **MINOR** (`26.1.0`) |
| Nuova vista UI, nuovo tipo automazione | **MINOR** |
| Refactor invisibile all'utente, dipendenze | **PATCH** |

Quando l'anno cambia → **MAJOR** sale (`27.0.0`).

---

## Tag Git

Il tag segue sempre `v<MAJOR>.<MINOR>.<PATCH>`:

```bash
git tag v26.0.0
git push origin v26.0.0
```

Il push del tag su `main` attiva il workflow `.github/workflows/release.yaml` che builda Windows + macOS e pubblica gli artefatti sulla GitHub Release.

---

## Compatibilità electron-updater

`electron-updater` confronta versioni con `semver`. Lo schema 26.x.x **è valido SemVer** (numeri MAJOR alti sono supportati), quindi gli aggiornamenti continuano a funzionare normalmente:

- Un utente su `1.0.3` riceverà l'update a `26.0.0` (più recente).
- Un utente su `26.0.0` riceverà l'update a `26.0.1` o `26.1.0`.

---

## Storico versioni

| Versione | Data | Note |
|---|---|---|
| `1.0.3` | 2025 | Ultima release schema SemVer "classico" |
| `26.0.0` | Maggio 2026 | Prima release calendar versioning — vedi [`RELEASE_NOTES.md`](RELEASE_NOTES.md) |

---

## Riferimenti

- [`UPDATES.md`](UPDATES.md) — workflow release operativo
- [`RELEASE_NOTES.md`](RELEASE_NOTES.md) — note rilascio versione corrente
- [`docs/developer/README.md`](docs/developer/README.md) — documentazione tecnica
