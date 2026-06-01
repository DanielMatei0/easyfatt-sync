# Aven Labs — Marketing API (Easyfatt Sync)

> **Deploy produzione:** l'endpoint va su **AvenSite** (`/Users/danielmatei/UTENTE/Lavoro/Progetti/AvenSite`) in  
> `app/api/marketing/easyfatt-sync/send/route.ts`.  
> Questa cartella è una copia di riferimento / test locale dentro `easyfatt-sync-app`.

Endpoint Next.js App Router per l'invio email marketing tramite **Resend**.

## Endpoint

`POST /api/marketing/easyfatt-sync/send`

## Variabili ambiente

Copia `.env.example` in `.env.local`:

```env
RESEND_API_KEY=re_...
MARKETING_FROM_EMAIL="Aven Labs Marketing <marketing@aven-labs.com>"
MARKETING_REPLY_FALLBACK="support@aven-labs.com"
```

## Sviluppo locale

```bash
cd marketing-api
npm install
npm run dev
```

L'app Electron può puntare a `http://localhost:3100/api/marketing/easyfatt-sync/send` impostando `marketingApiUrl` nella configurazione marketing.

## Deploy

Deployare questa cartella su `aven-labs.com` (Vercel o hosting Next.js). Il modulo `emailTemplateRenderer.js` della app padre viene caricato dal percorso relativo `../../src/main/emailTemplateRenderer`.

## Sicurezza

- Massimo **50** destinatari per richiesta
- `metadata.dryRun=true` → nessun invio Resend
- Nessuna API key nell'app desktop
