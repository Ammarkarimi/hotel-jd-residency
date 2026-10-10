import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { addDays, fmtDate, isoDate, money, nights } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';

const blankGuest = { guest_name: '', phone: '', email: '', special_requests: '', website: '' };

export default function BookingFlow({ info, preset }) {
  const today = isoDate();
  const [stay, setStay] = useState({ check_in: today, check_out: addDays(today, 1), adults: 2, children: 0 });
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [guest, setGuest] = useState(blankGuest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const n = nights(stay.check_in, stay.check_out);
  const guests = Number(stay.adults) + Number(stay.children);

  // Hero quick-search and "Book this room" buttons hand their choice over here.
  useEffect(() => {
    if (!preset) return;
    const next = { ...stay, ...preset.stay };
    setStay(next);
    search(next, preset.room_type_id);
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(s = stay, pick) {
    setError('');
    setDone(null);
    setBusy(true);
    try {
      const q = new URLSearchParams({ check_in: s.check_in, check_out: s.check_out, guests: Number(s.adults) + Number(s.children) });
      const { results } = await api(`/public/availability?${q}`);
      setResults(results);
      const want = results.find((r) => r.room_type_id === pick && r.available > 0 && r.fits);
      setSelected(want ? want.room_type_id : null);
    } catch (e) {
      setResults(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { booking } = await api('/public/bookings', {
        method: 'POST',
        body: { ...stay, ...guest, room_type_id: selected },
      });
      setDone(booking);
      requestAnimationFrame(() => document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' }));
      setGuest(blankGuest);
      setResults(null);
      setSelected(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const updStay = (k) => (e) => {
    const v = e.target.value;
    setStay((s) => {
      const next = { ...s, [k]: v };
      if (k === 'check_in' && next.check_out <= v) next.check_out = addDays(v, 1);
      return next;
    });
    setResults(null);
    setSelected(null);
  };
  const updGuest = (k) => (e) => setGuest((g) => ({ ...g, [k]: e.target.value }));
  const chosen = results?.find((r) => r.room_type_id === selected);
  const type = info?.room_types.find((t) => t.id === selected);

  if (done) {
    return (
      <div className="booking-done glass" role="status">
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => (
            <i key={i} style={{ '--i': i, '--x': `${(i * 37) % 100}%` }} />
          ))}
        </div>
        <div className="done-badge">
          <Icon name="check" size={34} strokeWidth={2.4} />
        </div>
        <h3>Request received, {done.guest_name.split(' ')[0]}!</h3>
        <p>
          Your booking reference is <strong className="ref">{done.ref}</strong>
        </p>
        <dl className="done-grid">
          <div>
            <dt>Room</dt>
            <dd>{done.room_type_name}</dd>
          </div>
          <div>
            <dt>Check-in</dt>
            <dd>{fmtDate(done.check_in)}</dd>
          </div>
          <div>
            <dt>Check-out</dt>
            <dd>{fmtDate(done.check_out)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{money(done.total_amount)}</dd>
          </div>
        </dl>
        <p className="muted">
          Our front desk will call you on your phone number to confirm. {info?.settings.booking_note}
        </p>
        <button className="btn btn-ghost" onClick={() => setDone(null)}>
          Make another booking
        </button>
      </div>
    );
  }

  return (
    <div className="booking glass">
      <form
        className="booking-search"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <label className="field">
          <span>Check-in</span>
          <input type="date" min={today} value={stay.check_in} onChange={updStay('check_in')} required />
        </label>
        <label className="field">
          <span>Check-out</span>
          <input type="date" min={addDays(stay.check_in, 1)} value={stay.check_out} onChange={updStay('check_out')} required />
        </label>
        <label className="field">
          <span>Adults</span>
          <select value={stay.adults} onChange={updStay('adults')}>
            {[1, 2, 3, 4, 5, 6].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Children</span>
          <select value={stay.children} onChange={updStay('children')}>
            {[0, 1, 2, 3, 4].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-gold" disabled={busy || n < 1}>
          {busy && !results ? 'Checking…' : 'Check availability'}
        </button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </p>
      )}

      {results && (
        <div className="booking-results">
          <p className="muted small">
            {n} night{n > 1 ? 's' : ''} · {fmtDate(stay.check_in, { day: 'numeric', month: 'short' })} →{' '}
            {fmtDate(stay.check_out, { day: 'numeric', month: 'short' })} · {guests} guest{guests > 1 ? 's' : ''}
          </p>
          <div className="result-list" role="radiogroup" aria-label="Choose a room">
            {results.map((r) => {
              const t = info?.room_types.find((x) => x.id === r.room_type_id);
              const disabled = r.available < 1 || !r.fits;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected === r.room_type_id}
                  key={r.room_type_id}
                  disabled={disabled}
                  className={`result ${selected === r.room_type_id ? 'is-selected' : ''}`}
                  style={{ '--accent': t?.accent }}
                  onClick={() => setSelected(r.room_type_id)}
                >
                  <span className="result-name">{r.name}</span>
                  <span className="result-meta">
                    {!r.fits
                      ? `Fits up to ${r.max_guests} guests`
                      : r.available < 1
                        ? 'Sold out for these dates'
                        : r.available <= 2
                          ? `Only ${r.available} left!`
                          : 'Available'}
                  </span>
                  <span className="result-price">
                    {money(r.total)}
                    <small>
                      {money(r.price)} × {r.nights}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {chosen && (
        <form className="guest-form" onSubmit={submit}>
          <h4>
            Your details <span className="muted">· {type?.name}</span>
          </h4>
          <div className="guest-grid">
            <label className="field">
              <span>Full name</span>
              <input value={guest.guest_name} onChange={updGuest('guest_name')} required autoComplete="name" />
            </label>
            <label className="field">
              <span>Phone</span>
              <input type="tel" value={guest.phone} onChange={updGuest('phone')} required autoComplete="tel" placeholder="+91" />
            </label>
            <label className="field">
              <span>Email (optional)</span>
              <input type="email" value={guest.email} onChange={updGuest('email')} autoComplete="email" />
            </label>
            <label className="field field-wide">
              <span>Anything we should know? (optional)</span>
              <input value={guest.special_requests} onChange={updGuest('special_requests')} placeholder="Early check-in, extra bed…" />
            </label>
            {/* Honeypot for bots */}
            <input className="hp" tabIndex={-1} autoComplete="off" value={guest.website} onChange={updGuest('website')} aria-hidden="true" />
          </div>
          <div className="guest-foot">
            <div>
              <div className="total">{money(chosen.total)}</div>
              <div className="muted small">{info?.settings.booking_note}</div>
            </div>
            <button className="btn btn-gold btn-lg" disabled={busy}>
              {busy ? 'Booking…' : 'Request booking'} <Icon name="arrow" size={18} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
