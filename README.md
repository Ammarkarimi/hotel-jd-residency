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
  - Settings: hotel name, phone, WhatsApp, address, map, check-in/out times; website photos (banner + gallery); online payments; change password

Hotel only, no restaurant: nothing on the site mentions dining.

## Online payments (Razorpay)

Set up in **/admin → Settings → Online payments**. Two options:

- **Pay at the hotel** (default): website bookings arrive as *Pending* straight away, nothing is paid online.
- **Full payment online**: the guest pays the whole amount in Razorpay Checkout (UPI, cards, netbanking, wallets)
  when they book. The booking holds a room as *Awaiting payment* for 20 minutes; once the payment is received it
  becomes *Pending* for staff to confirm, and the owner's WhatsApp alert is sent. Unpaid holds are released
  automatically. A payment that arrives after its hold ran out is kept if a room is still free; otherwise the
  booking is marked for a refund in its staff notes.

Every payment is checked with Razorpay (signature, amount and order) before a booking counts as paid, and captured
if the account doesn't capture automatically. Two paths confirm a payment: the guest's browser right after paying,
and the Razorpay **webhook** (`/api/public/payments/razorpay/webhook`, events `payment.captured` and `order.paid`),
which covers guests who close the page before returning. Refunds are made from the Razorpay Dashboard; each paid
booking links to its payment.

Keys can be saved in the admin panel (secrets are never shown again) or set as `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Use `rzp_test_…` keys to try it without real money.

## WhatsApp messages

Set up in **/admin → Settings → WhatsApp messages**. Three modes:

| Mode | Owner alert for a new website booking | Guest confirmation |
|------|---------------------------------------|--------------------|
| **Off** | – | – |
| **Ready-made message** (default, no setup) | – (staff see new bookings in the dashboard) | "Send confirmation to guest" opens WhatsApp with the message written; staff press Send from the hotel's WhatsApp |
| **Automatic** (WhatsApp Business / Cloud API) | Sent automatically to the owner number(s) | Sent by the website when staff press the button, or automatically when a booking is confirmed (optional) |

After check-out, guests can be sent a thank-you with the hotel's **Google review link** (configurable in the same
settings). In ready-made mode staff press "Send Google review link" on the booking; in automatic mode it is sent
when staff check the guest out (can be turned off). With online payments on, alerts are only sent once the guest
has paid, and messages say the amount was paid online.

Configurable: the hotel WhatsApp number guests hear from, the owner number(s) for alerts, the confirmation text
(ready-made mode), and the API details and template names (automatic mode). Confirming a booking allocates a free
room automatically if staff haven't chosen one, so the confirmation includes the room number. Every message sent or
attempted is listed on the booking in the admin panel.

Automatic mode needs a Meta WhatsApp Business setup: a phone number registered with the WhatsApp Cloud API, its
**Phone number ID**, a permanent **access token**, and three approved templates (category **Utility**):

- `new_booking_alert`: `New booking {{1}} received. Guest: {{2}} ({{3}}). Room: {{4}}. Check-in: {{5}}. Check-out: {{6}}. Guests: {{7}}. Total: {{8}}. Please open the admin panel to confirm it.`
- `booking_confirmed`: `Hello {{1}}, your booking {{2}} at {{3}} is confirmed. Room: {{4}}. Check-in: {{5}} from {{6}}. Check-out: {{7}}. Total: {{8}}. Address: {{9}}. Please carry a Passport or Aadhaar for each adult. We look forward to hosting you.`
- `stay_review`: `Hello {{1}}, thank you for staying at {{2}}. We hope you had a comfortable stay. If you have a minute, please share your experience in a Google review: {{3}} We look forward to welcoming you again.`

`Total` is filled in with the amount and either "(paid online)" or "(to be paid at the hotel)".

The access token can be saved in the admin panel (it is never shown again) or set as the `WHATSAPP_TOKEN`
environment variable. `WHATSAPP_API_VERSION` overrides the Graph API version (default `v23.0`).

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
server/            Express API + Postgres
  db.js            Postgres schema, starter data, settings (Neon or built-in PGlite)
  bookings.js      availability & booking rules
  routes/public.js website API (info, availability, book, pay, look up booking, Razorpay webhook)
  payments.js      Razorpay orders, payment checks and capture
  whatsapp.js      owner alerts, guest confirmations and review requests
  routes/admin.js  staff API (auth, dashboard, bookings, calendar, rooms, settings)
src/
  public/          the website (home page, booking page, room details)
  three/           3D room viewer, built with three.js / react-three-fiber
  admin/           the staff panel
test/              API tests (node --test)
```
