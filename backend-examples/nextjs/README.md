# Backend supporto Easyfatt Sync (Next.js + Resend)

Esempio di endpoint per ricevere richieste dall’app Electron e inviare **due email**:

1. **Interna** → `support@aven-labs.com` (con tutti i dettagli tecnici)
2. **Conferma** → email del cliente (brandizzata Aven Labs)

## Installazione nel sito Aven Labs (Next.js App Router)

1. Copia i file in un progetto Next.js esistente:
   - `app/api/support/easyfatt-sync/route.ts`
   - `lib/support-email-templates.ts`
   - `lib/support-validation.ts`

2. Installa Resend:

```bash
npm install resend
```

3. Configura le variabili d’ambiente (`.env.local` o hosting):

```env
RESEND_API_KEY=re_xxxxxxxx
SUPPORT_FROM_EMAIL="Aven Labs <support@aven-labs.com>"
SUPPORT_TO_EMAIL="support@aven-labs.com"
```

4. Verifica dominio mittente su Resend (`aven-labs.com`).

5. L’URL pubblico deve essere:

```
https://aven-labs.com/api/support/easyfatt-sync
```

(già configurato nell’app Electron in `supportConstants.js`)

## Payload atteso (POST JSON)

```json
{
  "name": "Ottica Rossi",
  "email": "cliente@example.com",
  "phone": "3331234567",
  "issueType": "Sincronizzazione",
  "message": "Il file non si aggiorna su Google Sheets.",
  "appVersion": "1.0.0",
  "platform": "win32",
  "lastSyncAt": "2026-05-16T07:30:00.000Z",
  "lastSyncRows": 245,
  "googleAuthorized": true,
  "excelPath": "C:\\AvenSync\\clienti.xlsx",
  "sheetName": "Clienti",
  "createdAt": "2026-05-16T07:45:00.000Z"
}
```

## Risposta

Successo:

```json
{ "ok": true }
```

Errore (messaggio generico, senza stack trace):

```json
{ "ok": false, "message": "..." }
```

## Sicurezza

- `RESEND_API_KEY` solo sul server
- Validazione input lato API
- Messaggi errore generici al client
- Rate limit: da aggiungere in futuro (es. middleware IP / Upstash)

## Test locale

```bash
curl -X POST http://localhost:3000/api/support/easyfatt-sync \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"tu@email.com","issueType":"sync","message":"Messaggio di prova lungo abbastanza","appVersion":"1.0.0","platform":"win32","googleAuthorized":true,"createdAt":"2026-05-16T12:00:00.000Z"}'
```
