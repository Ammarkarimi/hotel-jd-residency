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

Requires Node.js 22.13 or newer (it uses Node's built-in SQLite, so there's no database to install).

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

It's a single Node server that serves both the API and the built website. The SQLite database is a file, so the host needs a **persistent disk**:

- **Docker** (any VPS, Railway, Fly.io, Render with a disk): `docker build -t jd-residency . && docker run -p 3001:3001 -v jd-data:/data jd-residency`
- **Plain VPS**: `npm ci && npm run build && npm start` behind nginx or Caddy with HTTPS. Point `DATABASE_PATH` at a backed-up location.

Serverless hosts without a disk (e.g. Vercel functions) won't keep the database between requests.

Back up the database by copying the `.db` file (plus the `-wal` file if present) and the `uploads/` folder next to it, which holds the photos. Set `UPLOAD_DIR` to store photos elsewhere.

## Project layout

```
server/            Express API + SQLite (node:sqlite)
  db.js            schema, seed data, settings
  bookings.js      availability & booking rules
  routes/public.js website API (info, availability, book, look up booking)
  routes/admin.js  staff API (auth, dashboard, bookings, calendar, rooms, settings)
src/
  public/          the website (home page, booking page, room details)
  three/           3D room viewer, built with three.js / react-three-fiber
  admin/           the staff panel
test/              API tests (node --test)
```
