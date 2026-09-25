# DJ Lindstrom – booking

Booking-app til DJ Lindstrom. Kunder sender en forespørgsel, og Viktor håndterer dem i admin.

- **Kundeside:** `https://lindstroms.github.io/DJLindstrom/`
- **Admin:** `https://lindstroms.github.io/DJLindstrom/#/admin`

Teknik: React + Vite + Tailwind (frontend på GitHub Pages) og Supabase (database og login).
Uden Supabase-nøgler kører appen i **demo-tilstand** med eksempeldata.

## Opsætning af Supabase (én gang)

1. Opret et projekt i Supabase (region: *West EU / Frankfurt* eller *Stockholm*).
2. **SQL Editor → New query**: indsæt hele `supabase/migrations/0001_init.sql` og tryk *Run*.
3. **Authentication → Users → Add user**: opret `viktor@fam-lindstrom.dk` med en adgangskode
   (sæt flueben i *Auto Confirm User*).
4. **Authentication → Sign In / Providers**: slå *Allow new users to sign up* **fra**,
   så kun Viktor kan logge ind.
5. **Project Settings → API**: kopiér *Project URL* og *anon public* key.

## Opsætning af GitHub Pages (én gang)

1. GitHub → repo → **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: opret
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key

   (anon-nøglen er beregnet til at være offentlig – databasen er beskyttet af Row Level Security.)
3. Hver push til `main` bygger og udgiver siden automatisk.

## Lokal udvikling

```bash
npm install
cp .env.example .env   # udfyld nøglerne, eller lad være for demo-tilstand
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
