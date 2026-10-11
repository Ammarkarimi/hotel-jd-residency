import { getSettings, publicSettings } from './db.js';

// WhatsApp messages for bookings.
//
// Three modes, chosen in the admin panel:
//   off   – no WhatsApp features.
//   link  – no setup: the admin panel opens WhatsApp with a ready-written message
//           and staff press Send from the hotel's own WhatsApp.
//   api   – fully automatic through Meta's WhatsApp Cloud API: the owner gets an
//           alert for every website booking, and confirmations are sent by the server.
//           WhatsApp only allows businesses to start conversations with approved
//           message templates, so two templates must exist in WhatsApp Manager
//           (see README for their exact text).

export const WA_DEFAULTS = {
  wa_mode: 'link',
  wa_owner_numbers: '',
  wa_phone_number_id: '',
  wa_token: '',
  wa_template_owner: 'new_booking_alert',
  wa_template_guest: 'booking_confirmed',
  wa_template_lang: 'en',
  wa_auto_confirm: '0',
  wa_guest_message: [
    'Hello {name}, your booking at {hotel} is confirmed ✅',
    '',
    'Booking ref: {ref}',
    'Room: {room}',
    'Check-in: {check_in} (from {check_in_time})',
    'Check-out: {check_out} (until {check_out_time})',
    'Guests: {guests}',
    'Total: {total}, to be paid at the hotel',
    '',
    'Address: {address}',
    'Please carry a valid photo ID for each adult. See you soon!',
  ].join('\n'),
};

export const MODES = ['off', 'link', 'api'];
const API_BASE = () => process.env.WHATSAPP_API_BASE || 'https://graph.facebook.com';
const API_VERSION = () => process.env.WHATSAPP_API_VERSION || 'v23.0';

/** WhatsApp settings, with the access token from the WHATSAPP_TOKEN env var taking priority. */
export async function waConfig(db) {
  const all = await getSettings(db);
  const cfg = Object.fromEntries(Object.keys(WA_DEFAULTS).map((k) => [k, all[k] ?? WA_DEFAULTS[k]]));
  if (process.env.WHATSAPP_TOKEN) cfg.wa_token = process.env.WHATSAPP_TOKEN;
  return cfg;
}

/** The config as the admin panel sees it: the token is never sent back, only whether it is set. */
export function waConfigOut(cfg) {
  const { wa_token: token, ...rest } = cfg;
  return {
    ...rest,
    wa_token_set: !!token,
    wa_token_from_env: !!process.env.WHATSAPP_TOKEN,
    api_ready: !!(cfg.wa_phone_number_id && token),
  };
}

/**
 * Turns what people type ("+91 98200 12345", "098200 12345", "9820012345") into the
 * digits WhatsApp wants ("919820012345"). Ten-digit numbers are treated as Indian.
 */
export function normalizeNumber(input, defaultCountry = '91') {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = defaultCountry + d;
  return d.length >= 11 && d.length <= 15 ? d : '';
}

export function ownerNumbers(cfg) {
  return String(cfg.wa_owner_numbers || '')
    .split(/[,;\n]/)
    .map((n) => normalizeNumber(n))
    .filter(Boolean);
}

const fmtDate = (s) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtMoney = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const time12 = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** Values that can be used in messages as {name}, {ref}, … */
export function bookingFields(b, s) {
  const guests = b.adults + (b.children || 0);
  return {
    name: String(b.guest_name || '').split(' ')[0] || b.guest_name,
    full_name: b.guest_name,
    ref: b.ref,
    hotel: s.hotel_name,
    room: b.room_number ? `${b.room_type_name}, Room ${b.room_number}` : b.room_type_name,
    room_type: b.room_type_name,
    check_in: fmtDate(b.check_in),
    check_out: fmtDate(b.check_out),
    check_in_time: time12(s.check_in_time),
    check_out_time: time12(s.check_out_time),
    guests: `${guests} guest${guests === 1 ? '' : 's'}`,
    total: fmtMoney(b.total_amount),
    address: s.address,
    phone: s.phone,
    guest_phone: b.phone,
    requests: b.special_requests || '-',
  };
}

export function fillMessage(template, fields) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, key) => (key in fields ? fields[key] : m));
}

/** Plain-text versions, used for the "open WhatsApp" links and the history shown to staff. */
export function ownerAlertText(f, adminUrl) {
  return [
    `New booking ${f.ref} at ${f.hotel}`,
    `Guest: ${f.full_name} (${f.guest_phone})`,
    `Room: ${f.room_type}`,
    `Stay: ${f.check_in} to ${f.check_out}, ${f.guests}`,
    `Total: ${f.total}`,
    `Requests: ${f.requests}`,
    adminUrl ? `Confirm it here: ${adminUrl}` : 'Open the admin panel to confirm it.',
  ].join('\n');
}

// Parameters for the approved templates. The order must match {{1}}, {{2}}, … in the README.
export const ownerTemplateParams = (f) => [f.ref, f.full_name, f.guest_phone, f.room_type, f.check_in, f.check_out, f.guests, f.total];
export const guestTemplateParams = (f) => [f.name, f.ref, f.hotel, f.room, f.check_in, f.check_in_time, f.check_out, f.total, f.address];

/** WhatsApp template parameters can't contain new lines or long runs of spaces. */
const cleanParam = (v) => String(v ?? '-').replace(/\s+/g, ' ').trim().slice(0, 500) || '-';

export async function sendTemplate(cfg, to, templateName, params) {
  if (!cfg.wa_phone_number_id || !cfg.wa_token) return { ok: false, error: 'WhatsApp API is not set up (phone number ID and access token).' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE()}/${API_VERSION()}/${encodeURIComponent(cfg.wa_phone_number_id)}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.wa_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: cfg.wa_template_lang || 'en' },
          components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: cleanParam(p) })) }],
        },
      }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error?.message || `WhatsApp API error ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id || '' };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'WhatsApp API did not respond in time.' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function logNotification(db, bookingId, kind, recipient, status, detail = '') {
  await db.query('INSERT INTO notifications (booking_id, kind, recipient, status, detail) VALUES (?, ?, ?, ?, ?)', [
    bookingId, kind, recipient, status, String(detail).slice(0, 1000),
  ]);
}

/**
 * Alerts the owner about a new website booking (automatic mode only).
 * Never throws: a WhatsApp problem must not stop the guest's booking.
 */
export async function notifyOwner(db, booking, { adminUrl } = {}) {
  try {
    const cfg = await waConfig(db);
    if (cfg.wa_mode !== 'api') return;
    const numbers = ownerNumbers(cfg);
    if (!numbers.length) return;
    const fields = bookingFields(booking, await publicSettings(db));
    const params = ownerTemplateParams(fields);
    await Promise.all(
      numbers.map(async (to) => {
        const r = await sendTemplate(cfg, to, cfg.wa_template_owner, params);
        await logNotification(db, booking.id, 'owner_alert', to, r.ok ? 'sent' : 'failed', r.ok ? ownerAlertText(fields, adminUrl) : r.error);
      }),
    );
  } catch (err) {
    console.error('WhatsApp owner alert failed:', err);
  }
}

/** Sends (api mode) or prepares (link mode) the confirmation message for a guest. */
export async function confirmGuest(db, booking) {
  const cfg = await waConfig(db);
  const settings = await publicSettings(db);
  const to = normalizeNumber(booking.phone);
  if (!to) return { ok: false, mode: cfg.wa_mode, error: `The guest's phone number (${booking.phone}) doesn't look like a WhatsApp number.` };
  const fields = bookingFields(booking, settings);
  const text = fillMessage(cfg.wa_guest_message, fields);

  if (cfg.wa_mode === 'api') {
    const r = await sendTemplate(cfg, to, cfg.wa_template_guest, guestTemplateParams(fields));
    await logNotification(db, booking.id, 'guest_confirmation', to, r.ok ? 'sent' : 'failed', r.ok ? text : r.error);
    return { ...r, mode: 'api', to };
  }
  if (cfg.wa_mode === 'link') {
    await logNotification(db, booking.id, 'guest_confirmation', to, 'opened', text);
    return { ok: true, mode: 'link', to, url: `https://wa.me/${to}?text=${encodeURIComponent(text)}` };
  }
  return { ok: false, mode: 'off', error: 'WhatsApp messages are turned off in Settings.' };
}
