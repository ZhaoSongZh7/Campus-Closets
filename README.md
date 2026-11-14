# Mutuari

A local, peer-to-peer clothing rental marketplace MVP, built from the
"Clothing Rental Marketplace — Desktop MVP" Figma file.

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · shadcn/ui (Base UI) · lucide-react

## Run it

```bash
npm install
cp .env.example .env.local   # then paste your Postgres connection string
npm run db:setup             # creates tables + loads sample lenders, listings and photos
npm run dev                  # http://localhost:3000
```

`DATABASE_URL` works with any Postgres:

- **Neon** — Project → Connect → copy the **pooled** connection string.
- **Supabase** — Connect → **Transaction pooler** connection string.
- **Local** — `postgres://user@localhost:5432/mutuari`.

`npm run db:setup` is safe to re-run; it never overwrites existing rows.
When deploying, set `DATABASE_URL` in the host's environment variables.

## What's in it

| Area    | Routes |
| ------- | ------ |
| Public  | `/` · `/browse` · `/listing/[id]` · `/help` · `/signup` · `/login` |
| Renter  | `/onboarding` · `/listing/[id]/try-on` · `/listing/[id]/reserve` · `/rentals` · `/rentals/[id]` · `/rentals/[id]/confirmed` · `/rentals/[id]/return` |
| Lender  | `/lender` · `/lender/closet` · `/lender/closet/new` · `/lender/requests` · `/lender/earnings` |
| Shared  | `/messages` · `/profile` · `/settings` |

## Backend

Accounts and listings are real and shared between users. Everything else is still sample data.

| Data | Where it lives |
| ---- | -------------- |
| Accounts, sessions, profile, sizes, settings | Postgres (`users`, `sessions`) |
| Listings and their photos | Postgres (`listings`, `listing_photos`) |
| Rentals, try-ons, requests, messages, earnings, favourites | This browser's `localStorage`, per signed-in user |

API (all under `src/app/api`, JSON in and out):

| Route | What it does |
| ----- | ------------ |
| `POST /api/auth/signup` · `login` · `logout` | Email + password accounts; sets or clears the session cookie |
| `GET /api/bootstrap` | The signed-in account, every listed item (plus your own drafts), and the owners' public profiles |
| `PATCH /api/me` · `DELETE /api/me` | Update or delete your own account |
| `POST /api/listings` · `PUT/DELETE /api/listings/[id]` | Create, edit or delete a listing you own |
| `GET /api/photos/[id]` | Serves a listing photo |

Security notes:

- Passwords are hashed with scrypt and a per-user salt; the hash never leaves the server.
- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie (30 days). Only a hash of the token is stored.
- Writes from other origins are rejected, input is validated with zod, and listings can only be changed by their owner.
- Other users see a lender as "First L." with no email or phone.
- The tables have row-level security on with no policies, so Supabase's public REST API (and its publishable key) cannot read or write them; only the app's own database connection can.
- Not built yet: login rate limiting, email verification, password reset, and Google/Apple sign-in.

## What is still simulated

- Other lenders and renters are sample people. Sample lenders "accept" a try-on or reservation about
  12 seconds after you request it; a sample renter requests each listing you publish about 15 seconds later.
- Checkout, payouts and ID/email/phone verification are not connected to any provider. Nothing is
  charged; only the last four digits of a card or bank number are kept.
- Maps are drawn illustrations, not real geography (`src/components/map-art.tsx` draws the same made-up streets for the same pickup area), and distance is only known for the sample listings (there is no geocoding).
- Fees are assumptions: an 8% renter service fee and a 15% lender platform fee (`src/lib/format.ts`).

Settings → "Reset sample data" restores the browser-side sample data without touching your account or listings.

## Layout

- `src/app` — one folder per route; `src/app/api` — the API routes
- `src/server` — database client, auth/sessions, account and listing queries
- `db/schema.sql`, `db/seed-data.json`, `scripts/db-setup.mjs` — schema, sample data, setup script
- `db/sample-photos/` — illustrated images for the sample listings: `<listing id>-1.jpg` is the main photo, `-2`/`-3` are detail shots, and `-front`/`-back`/`-label`/`-wear` are the condition photos; re-run `npm run db:setup` after changing them
- `public/art/` — site artwork (landing hero, sign-in panel, profile covers, occasion tiles) and `no-photo.jpg`, shown for a listing that has no photo yet
- `src/components/ui` — shadcn/ui components
- `src/components/kit.tsx` — shared building blocks (panels, fields, chips, steppers, photo slots)
- `src/components/site` — navbar, footer, page shells
- `src/lib` — types, the client store and its actions, browser-side sample data, formatting and pricing helpers
