# DJ Lindstrom – booking

Booking-app til DJ Lindstrom. Kunder sender en forespørgsel, og Viktor håndterer dem i admin.

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
- [ ] E-mails (kvittering til kunde + besked til Viktor)
- [ ] Admin: opret/rediger event-typer, temaer, lydpakker og blokerede datoer
- [ ] Abonnent-kalender (ICS-feed) til iPhone
