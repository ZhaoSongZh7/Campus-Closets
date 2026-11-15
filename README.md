# Campus Closet

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

Everything users do is stored in Postgres and shared between them: one person's request, message or review shows up for the other.

| Data | Where it lives |
| ---- | -------------- |
| Accounts, sessions, profile, sizes, settings | Postgres (`users`, `sessions`) |
| Listings and their photos | Postgres (`listings`, `listing_photos`) |
| Try-on and reservation requests, the rental itself, earnings | Postgres (`bookings`: one row that the renter and the lender both see) |
| Conversations and messages | Postgres (`threads`, `messages`) |
| Message images, pickup and return photos | Postgres (`uploads`) |
| Notifications, reviews, saved outfits | Postgres (`notifications`, `reviews`, `favorites`) |

API (all under `src/app/api`, JSON in and out):

| Route | What it does |
| ----- | ------------ |
| `POST /api/auth/signup` · `login` · `logout` | Email + password accounts; sets or clears the session cookie |
| `GET /api/auth/google` · `/api/auth/google/callback` | "Continue with Google": sends the browser to Google, then signs the returning user in |
| `GET /api/bootstrap` | The signed-in account, every listed item (plus your own drafts), the owners' public profiles, and your activity |
| `GET /api/activity` | Your rentals, try-ons, requests, earnings, conversations and notifications, plus booked dates and reviews. The app polls this every few seconds |
| `POST /api/activity` | Performs one action (`{ "type": "sendMessage", … }`, `createReservation`, `respondRequest`, `confirmReturn`, `submitReview`, …) and returns the updated activity. The full list is `actionInput` in `src/server/activity.ts` |
| `GET /api/uploads/[id]` | A message image or pickup/return photo, for the two people involved only |
| `PATCH /api/me` · `DELETE /api/me` | Update or delete your own account |
| `POST /api/listings` · `PUT/DELETE /api/listings/[id]` | Create, edit or delete a listing you own |
| `GET /api/photos/[id]` | Serves a listing photo |
| `POST /api/geo` | Turns a device position (`{ lat, lng }`) or typed text (`{ text: "08540" }`) into a place: a label such as "Princeton, NJ 08540" and the centre of that ZIP code area |

Security notes:

- Passwords are hashed with scrypt and a per-user salt; the hash never leaves the server.
- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie (30 days). Only a hash of the token is stored.
- Writes from other origins are rejected, input is validated with zod, and listings can only be changed by their owner.
- Every action checks which side of the booking or conversation you are on: only the lender can accept, only the renter can cancel or confirm pickup, and a third person can neither read nor post. Prices are worked out on the server.
- Other users see a lender as "First L." with no email or phone.
- The tables have row-level security on with no policies, so Supabase's public REST API (and its publishable key) cannot read or write them; only the app's own database connection can.
- Google sign-in is the OpenID Connect code flow with PKCE, a one-time `state` and a `nonce`; only Google accounts with a verified email are accepted. A Google sign-in whose email already has a password account does not get into that account: the person is asked for the password once, and that connects the two.
- Not built yet: login rate limiting, email verification, password reset, Apple sign-in, and blocking or reporting another member. A Google-only account has no password, and there is no screen yet for adding one.

Places and distances: the location button on a place field (sign-up, onboarding, settings, Browse, the home page search, a listing's pickup area) asks the browser for the device's position and sends it to `POST /api/geo`, which finds the nearest ZIP code in a table bundled with the `zipcodes` package and returns its name. No outside service is called, and the position itself is not stored: only the place name is kept, and every distance runs between the centres of two ZIP code areas. A listing is measured from its pickup area, or from its lender's place when the pickup area is only a neighbourhood name; the viewer is measured from the place picked on Browse, else from their account. The table covers the US and Canada, typed text is understood as a ZIP/postal code or "City, ST", and the browser only offers location on `https://` or `localhost`.

Google sign-in setup: in the [Google Cloud console](https://console.cloud.google.com/apis/credentials) create an OAuth client ID of type "Web application" (the console first asks for an OAuth consent screen: app name, support email, and, while the app is in "Testing", the Google accounts allowed to sign in). Under "Authorized redirect URIs" add `<site address>/api/auth/google/callback` for every address the site is served from, e.g. `http://localhost:3000/api/auth/google/callback`. Put the client ID and secret in `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and restart. Until they are set, the Google button returns to the login page with a note. The database needs the `users.google_sub` column, which `npm run db:setup` adds.

How updates reach the other person: there is no push channel. Each open tab asks `/api/activity` every 4 seconds, so a message or an acceptance appears within a few seconds.

One thing to know about the database connection: through Supabase's transaction pooler, queries that the driver had to queue behind busy connections were seen to hang. So each request runs its queries one after another, and the API lets at most `DB_CONNECTIONS` (10, in `src/server/db.ts`) requests run at once. Keep new queries sequential rather than wrapping them in `Promise.all`.

## What is still simulated

- The sample listings can belong to a real account: set `SAMPLE_OWNER_EMAIL` in `.env.local` to that account's
  email and run `npm run db:setup`. That account then sees them in its closet, can edit them, and answers
  requests for them itself. After that the setup script leaves their photos and owner alone.
- Without `SAMPLE_OWNER_EMAIL`, the listings belong to five sample lenders, which are rows in `users` that
  nobody logs in as. The server plays them: a sample lender accepts a try-on or reservation about 12 seconds
  after you request it and answers messages with a canned reply. Requests between real members are never
  answered automatically, and there are no sample renters.
- Checkout, payouts and ID/email/phone verification are not connected to any provider. Nothing is
  charged; only the last four digits of a card or bank number are kept.
- Maps are drawn illustrations, not real geography (`src/components/map-art.tsx` draws the same made-up streets for the same pickup area). Distances are real but approximate (ZIP code area to ZIP code area), and a listing shows its pickup area name instead when either place is unknown.
- Fees are assumptions: an 8% renter service fee and a 20% lender platform fee (`src/lib/format.ts`).

## Layout

- `src/app` — one folder per route; `src/app/api` — the API routes
- `src/server` — database client, auth/sessions, Google sign-in (`google.ts`), account and listing queries, place lookup (`geo.ts`)
- `db/schema.sql`, `db/seed-data.json`, `scripts/db-setup.mjs` — schema, sample data, setup script
- `db/sample-photos/` — photos for the sample listings, converted from `src/assets/`: `<listing id>-1.jpg` is the main photo and `-2` a second shot (`-front`/`-back`/`-label`/`-wear` would be condition photos); re-run `npm run db:setup` after changing them. These are the retailers' own product photos, so replace them before the site goes public
- `public/art/` — site artwork made from the same photos (landing hero, sign-in panel, profile covers, occasion tiles) and `no-photo.jpg`, shown for a listing that has no photo yet
- `src/assets/campus-closet-logo.jpeg` — the logo artwork, shown as a rounded tile beside the name by `src/components/site/logo.tsx` (navbar, sign-in pages, footer). `src/app/icon.png` and `apple-icon.png` are the same artwork scaled down for the browser tab and home screen
- `src/components/ui` — shadcn/ui components
- `src/components/kit.tsx` — shared building blocks (panels, fields, chips, steppers, photo slots)
- `src/components/place-field.tsx` — the place field with its "use my current location" button
- `src/components/site` — navbar, footer, page shells
- `src/lib` — types, the client store and its actions, formatting and pricing helpers
