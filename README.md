# DJ Lindstrøm – booking

Booking-app til DJ Lindstrøm. Kunder sender en forespørgsel, og Viktor håndterer dem i admin.

- **Kundeside:** `https://lindstroms.github.io/DJLindstrom/`
- **Admin:** `https://lindstroms.github.io/DJLindstrom/#/admin`

Teknik: React + Vite + Tailwind (frontend på GitHub Pages) og Supabase (database og login).
Med `VITE_DEMO=true` kører appen i **demo-tilstand** med eksempeldata.

## Supabase

Projekt: **DJLindstrom** (`vubxctebuwiftamiskxs`, EU). Databasen er sat op med
`supabase/migrations/0001_init.sql` og `0002_harden_functions.sql`.

Mangler at blive gjort i Supabase-dashboardet (én gang):

1. **Authentication → Users → Add user → Create new user**: `viktor@fam-lindstrom.dk` + adgangskode,
   sæt flueben i *Auto Confirm User*.
2. **Authentication → Sign In / Providers**: slå *Allow new users to sign up* **fra**.

Nye admins tilføjes ved at indsætte deres e-mail i tabellen `admins`.

## E-mails (Resend)

Ved hver ny forespørgsel kalder en database-trigger edge-funktionen `booking-email`
(`supabase/functions/booking-email`), som sender kvittering til kunden og besked til Viktor via Resend.

Opsætning (én gang):

1. Opret konto på resend.com → **Domains → Add domain** → `fam-lindstrom.dk` (region: Ireland).
2. Læg de viste DNS-records ind hos one.com (**DNS-indstillinger**) og tryk *Verify* i Resend.
3. Resend → **API Keys → Create API key** (Sending access).
4. Supabase → **Edge Functions → Secrets**: tilføj `RESEND_API_KEY`.
   Valgfrit: `EMAIL_FROM` (standard `DJ Lindstrom <booking@fam-lindstrom.dk>`) og `ADMIN_EMAIL`.

## GitHub Pages (én gang)

1. GitHub → repo → **Settings → Pages → Source: GitHub Actions**.
2. Hver push til `main` bygger og udgiver siden automatisk.

## Lokal udvikling

```bash
npm install
npm run dev
```

## Status

- [x] Booking-flow i 5 trin (event-type/tema, dato/tid/timer, lyd & lys, oplysninger, send)
- [x] Kvitteringsside: "Tak for din forespørgsel – vi kontakter dig og sender et tilbud inden for 24 timer."
- [x] Admin: login, liste over forespørgsler, status, tilbudt pris, noter, "Tilføj til kalender" (.ics)
- [x] Priser gemt i databasen, men skjult for kunder (`settings.show_prices`)
- [x] E-mails (kvittering til kunde + besked til Viktor) – kræver Resend-opsætning
- [x] Admin → Opsætning: opret/rediger/skjul event-typer, temaer, lydpakker, blokerede datoer og "vis priser"
- [x] Musikønsker: kunden får link ved bekræftelse, søger sange (iTunes/Deezer), vælger genrer/energi; vises i admin
- [x] Live-ønsker: QR-kode til gæster, ønsk/stem på sange, DJ-kø i admin (#/admin/live/:id)
- [x] Anmeldelser: automatisk mail dagen efter festen (pg_cron kl. 10:05 UTC), kunden anmelder via #/anmeld/:token, Viktor godkender under Admin → Anmeldelser, vises på forsiden
- [x] Økonomi (Admin → Økonomi): tilbud → online accept → faktura med PDF på mail, kreditnotaer, fortløbende numre,
      moms 25 %, MobilePay/bank, automatiske rykkere (pg_cron kl. 08:15 UTC), overblik, moms pr. kvartal og CSV-eksport
- [x] Udgifter (Admin → Økonomi → Udgifter): kvitteringsfoto (privat storage-bucket `receipts`), kategorier, købsmoms,
  resultat og moms at betale pr. kvartal i Overblik, CSV-eksport
- [x] Abonnent-kalender (ICS-feed) til iPhone – Admin → Opsætning → Kalender
