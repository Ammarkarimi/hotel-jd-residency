# Hotel JD Residency

Website and front-desk panel for Hotel JD Residency.

- **Public website** (`/`): a clean, classic hotel site modelled on the patterns guests know from big hotel chains: a date and guest search right at the top, "pay at hotel / no booking fees" reassurance, room cards with prices, amenities, map, FAQ, and a call or WhatsApp button everywhere.
- **Booking page** (`/book`): pick dates and guests, choose a room (live availability and total price), enter name and phone, done. A summary panel shows the price at every step, and guests get a booking reference plus "what happens next". Works well on phones, with a sticky "Confirm booking" bar.
- **Room details**: each room opens a details view with its photo and an optional interactive **3D view** of the room.
- **Staff panel** (`/admin`): a separate login where the hotel manages **rooms**, **prices**, **photos** and **bookings**:
  - Dashboard: arrivals, departures, guests in house, occupancy, 14-day occupancy forecast and revenue
  - Bookings: search and filter, confirm, assign room, check in/out, cancel, notes, CSV export, walk-in/phone bookings
  - Calendar: room-by-room timeline. Click an empty day to book that room
  - Rooms: add/edit room types (name, price, guests, beds, amenities, colour, photo) and physical rooms; block rooms for maintenance
  - Settings: hotel name, phone, WhatsApp, address, map, check-in/out times; website photos (banner + gallery); change password

Hotel only, no restaurant: nothing on the site mentions dining.

## Run it locally

Requires Node.js 20 or newer. Data is stored in Postgres: set `DATABASE_URL` to use a Postgres server (e.g. Neon); without it, a built-in Postgres (PGlite) keeps data in `data/pglite`, so there's nothing to install for local use.

```bash
npm install
npm run build
npm start            # http://localhost:3001  and  http://localhost:3001/admin
```

For development with hot reload: `npm run dev`, then open http://localhost:5173.

Run the API tests with `npm test`.

## First login

| Username | Password      |
|----------|---------------|
| `admin`  | `jdresidency` |

The panel shows a reminder until the password is changed in **Settings**. To start with your own credentials instead, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` before the first start (see `.env.example`).

## Before going live: check these details

The hotel's details below are **placeholders** taken from public listings. Update them in **/admin → Settings** and **/admin → Rooms**:

- Phone, WhatsApp and email (the phone is currently `+91 00000 00000`)
- Address and map pin (currently set to the Andheri West, Mumbai listing)
- Room types, prices, number of rooms and room numbers (seeded with 4 Deluxe, 4 Executive and 2 Family Suites)
- **Photos**: the site ships with 3D-rendered room pictures labelled "Representative image" / "3D illustration". Upload real photos in **Settings → Website photos** (banner and gallery) and **Rooms → Edit** (one photo per room type). Photos are resized in the browser before upload.
- Amenities, "About us" text, FAQ and "Nearby" travel times: edit `src/public/content.js`

## Deploying

It's one Node app: Vercel serves the built website and runs the API as a serverless function (`api/index.js`, `vercel.json`).
All data (bookings, rooms, settings, logins and uploaded photos) lives in **Postgres**, so every server instance sees the same data.

### Vercel + Neon (current setup)

1. In the Vercel project, open **Storage → Create Database → Neon** (free plan) and connect it to the project. This adds `DATABASE_URL`.
2. Project environment variables: `ADMIN_USERNAME`, `ADMIN_PASSWORD` (first login, used only when the database is empty),
   `SESSION_SECRET` (any long random string), `HOTEL_TIMEZONE=Asia/Kolkata`, and optionally `DEMO_DATA=1` to add sample
   bookings to a brand-new database.
3. Push to the production branch (`main`); Vercel builds and deploys it.

Tables and starter rooms are created automatically on first start.

### Any other host

- **Docker**: `docker build -t jd-residency . && docker run -p 3001:3001 -e DATABASE_URL=postgres://… jd-residency`
  (without `DATABASE_URL`, data goes to the built-in database in the `/data` volume).
- **Plain server**: `npm ci && npm run build && npm start` behind nginx or Caddy with HTTPS.

Back up with `pg_dump "$DATABASE_URL"` (Neon also keeps automatic history).

## Project layout

```
server/            Express API + SQLite (node:sqlite)
  db.js            Postgres schema, starter data, settings (Neon or built-in PGlite)
  bookings.js      availability & booking rules
  routes/public.js website API (info, availability, book, look up booking)
  routes/admin.js  staff API (auth, dashboard, bookings, calendar, rooms, settings)
src/
  public/          the website (home page, booking page, room details)
  three/           3D room viewer, built with three.js / react-three-fiber
  admin/           the staff panel
test/              API tests (node --test)
```
