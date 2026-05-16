# macOS: firma e notarizzazione (futuro)

> **Stato attuale:** build DMG di **test/beta** senza Apple Developer Program pagato.  
> Config in `package.json`: `hardenedRuntime: false`, `gatekeeperAssess: false`, `CSC_IDENTITY_AUTO_DISCOVERY=false` negli script.

Quando Aven Labs attiverà l’**Apple Developer Program**, abilitare firma **Developer ID Application** e **notarizzazione** prima della distribuzione a clienti esterni.

---

## Cosa servirà

| Elemento | Uso |
|----------|-----|
| **Apple Developer Program** | Account a pagamento |
| **Developer ID Application** certificate | Firma `.app` e `.dmg` |
| **Apple ID** | Account sviluppatore |
| **App-specific password** | Per `notarytool` / electron-builder (non la password normale) |
| **Team ID** | Identificativo team in Apple Developer |

Variabili d’ambiente tipiche (esempio, **non** committare):

```bash
export CSC_NAME="Developer ID Application: Aven Labs (TEAMID)"
export APPLE_ID="dev@aven-labs.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

Rimuovere `CSC_IDENTITY_AUTO_DISCOVERY=false` dagli script `dist:mac` e impostare `build.mac.identity` al nome del certificato **Developer ID Application** (rimuovere `null`) quando la firma è configurata.

---

## Modifiche previste a `package.json` (build.mac)

Esempio **da attivare solo dopo** avere certificato e credenziali:

```json
"mac": {
  "target": "dmg",
  "icon": "assets/icon.icns",
  "category": "public.app-category.business",
  "hardenedRuntime": true,
  "gatekeeperAssess": true,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
},
"afterSign": "scripts/notarize.js",
"notarize": {
  "teamId": "TEAM_ID"
}
```

Oppure notarizzazione via `electron-builder` con `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (vedi [documentazione electron-builder](https://www.electron.build/code-signing)).

---

## Checklist prima della prima release notarizzata

1. Creare certificato **Developer ID Application** in Keychain Access.
2. Aggiungere `entitlements.mac.plist` (rete client, file user-selected, ecc.).
3. Impostare `hardenedRuntime: true`.
4. Eseguire `npm run dist:mac` con firma attiva.
5. Inviare a notarizzazione Apple (`notarytool` o integrazione builder).
6. Stapling del DMG (`xcrun stapler staple`).
7. Test su Mac pulito: doppio click senza «Apri comunque».

---

## Riferimenti

- [Apple: Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [electron-builder — macOS code signing](https://www.electron.build/code-signing)
