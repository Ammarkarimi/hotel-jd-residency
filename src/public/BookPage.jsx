import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, money, nights, time12 } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { payWithRazorpay } from '../lib/razorpay.js';
import { KeyRules, RoomImage } from './Home.jsx';
import { telHref, useInfo, usePayOnline, waHref } from './PublicApp.jsx';
import { DateFields, GuestPicker, guestsLabel, stayFromParams, stayToParams, useToday } from './StaySearch.jsx';

const ARRIVAL = ['Not sure yet', 'Before 12 PM', '12 PM – 3 PM', '3 PM – 6 PM', '6 PM – 9 PM', 'After 9 PM'];
const blankGuest = { guest_name: '', phone: '', email: '', arrival: ARRIVAL[0], special_requests: '', website: '' };

export default function BookPage() {
  const { info } = useInfo();
  const online = usePayOnline();
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const stay = useMemo(() => stayFromParams(params, today), [params, today]);
  const wantedRoom = Number(params.get('room')) || null;

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [guest, setGuest] = useState(blankGuest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  // A booking created with online payment, waiting for the guest to pay: { booking, payment }.
  const [unpaid, setUnpaid] = useState(null);
  const detailsRef = useRef(null);

  const setStay = (next) => setParams(stayToParams(next, { room: wantedRoom }), { replace: true });
  const selectRoom = (id) => {
    setParams(stayToParams(stay, { room: id }), { replace: true });
    requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const key = stayToParams(stay);
  const ready = !!info;
  useEffect(() => {
    // Wait for hotel info so dates are checked against the hotel's "today".
    if (!ready) return;
    let live = true;
    setLoading(true);
    setSearchError('');
    const t = setTimeout(() => {
      const q = new URLSearchParams({ check_in: stay.check_in, check_out: stay.check_out, guests: stay.adults + stay.children });
      api(`/public/availability?${q}`)
        .then((d) => live && setResults(d.results))
        .catch((e) => live && setSearchError(e.message))
        .finally(() => live && setLoading(false));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const option = results?.find((r) => r.room_type_id === wantedRoom);
  const selected = option && option.available > 0 && option.fits ? option : null;
  const type = info?.room_types.find((t) => t.id === (selected?.room_type_id ?? wantedRoom));
  const n = nights(stay.check_in, stay.check_out);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const notes = [guest.arrival !== ARRIVAL[0] && `Arrival: ${guest.arrival}`, guest.special_requests].filter(Boolean).join(' · ');
    let created;
    try {
      created = await api('/public/bookings', {
        method: 'POST',
        body: {
          ...stay,
          room_type_id: selected.room_type_id,
          guest_name: guest.guest_name,
          phone: guest.phone,
          email: guest.email,
          special_requests: notes,
          website: guest.website,
        },
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    if (created.payment) {
      setUnpaid(created);
      window.scrollTo({ top: 0 });
      await pay(created);
    } else {
      finish(created.booking);
    }
  }

  function finish(booking) {
    setBusy(false);
    setDone(booking);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function pay({ booking, payment }) {
    setError('');
    setBusy(true);
    let result;
    try {
      result = await payWithRazorpay(payment);
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    if (!result) return setBusy(false); // payment window closed: the guest can try again
    try {
      const { booking: paid } = await api(`/public/bookings/${booking.ref}/payment`, { method: 'POST', body: result });
      finish(paid);
    } catch {
      // The money has left the guest's account; Razorpay's webhook completes the booking.
      finish({ ...booking, payment_status: 'verifying' });
    }
  }

  if (done) return <Confirmation booking={done} info={info} />;
  if (unpaid) {
    return (
      <PaymentDue
        unpaid={unpaid}
        info={info}
        busy={busy}
        error={error}
        onPay={() => pay(unpaid)}
        onBack={() => {
          setUnpaid(null);
          setError('');
        }}
      />
    );
  }

  const step = selected ? 2 : 1;

  return (
    <main className="book-page">
      <div className="wrap">
        <div className="book-head">
          <h1>Book your stay</h1>
          <ol className="steps" aria-label="Booking steps">
            {['Choose room', 'Your details', online ? 'Pay & confirm' : 'Confirmed'].map((label, i) => (
              <li key={label} className={i + 1 < step ? 'is-done' : i + 1 === step ? 'is-current' : ''} aria-current={i + 1 === step ? 'step' : undefined}>
                <span>{i + 1 < step ? <Icon name="check" size={14} strokeWidth={2.6} /> : i + 1}</span>
                <em className="step-label">{label}</em>
              </li>
            ))}
          </ol>
        </div>

        <div className="book-layout">
          <div className="book-main">
            <section className="panel">
              <h2 className="panel-title">Your stay</h2>
              <div className="stay-fields">
                <DateFields stay={stay} onChange={setStay} />
                <GuestPicker stay={stay} onChange={setStay} />
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">
                <span className="num">1</span> Choose your room
              </h2>
              {searchError && (
                <p className="alert alert-error" role="alert">
                  {searchError}
                </p>
              )}
              {option && !selected && (
                <p className="alert alert-warn" role="status">
                  {option.name} is {option.fits ? 'sold out for these dates' : `for up to ${option.max_guests} guests`}. Please choose another room
                  {option.fits ? ' or change your dates' : ''}.
                </p>
              )}
              <div className={`options ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
                {!results && !searchError && [0, 1, 2].map((i) => <div key={i} className="option skeleton" />)}
                {results?.map((r) => {
                  const t = info?.room_types.find((x) => x.id === r.room_type_id);
                  const ok = r.available > 0 && r.fits;
                  const isSel = selected?.room_type_id === r.room_type_id;
                  return (
                    <article key={r.room_type_id} className={`option ${isSel ? 'is-selected' : ''} ${ok ? '' : 'is-off'}`}>
                      {t && <RoomImage type={t} className="option-img" />}
                      <div className="option-body">
                        <h3>{r.name}</h3>
                        <ul className="room-facts">
                          <li>
                            <Icon name="users" size={16} /> Up to {r.max_guests} guests
                          </li>
                          {t?.beds && (
                            <li>
                              <Icon name="bed" size={16} /> {t.beds}
                            </li>
                          )}
                        </ul>
                        {t && (
                          <ul className="tags">
                            {t.amenities.slice(0, 3).map((a) => (
                              <li key={a}>{a}</li>
                            ))}
                          </ul>
                        )}
                        <p className={`avail ${ok ? (r.available <= 2 ? 'avail-low' : 'avail-ok') : 'avail-none'}`}>
                          {!r.fits
                            ? `Too small for ${stay.adults + stay.children} guests`
                            : r.available < 1
                              ? 'Sold out for these dates'
                              : r.available <= 2
                                ? `Only ${r.available} left for your dates`
                                : 'Available'}
                        </p>
                      </div>
                      <div className="option-buy">
                        <div className="price">
                          <b>{money(r.total)}</b>
                          <small>
                            {money(r.price)} × {r.nights} night{r.nights > 1 ? 's' : ''}
                          </small>
                        </div>
                        <button className={`btn ${isSel ? 'btn-selected' : 'btn-primary'}`} disabled={!ok} onClick={() => selectRoom(r.room_type_id)} aria-pressed={isSel}>
                          {isSel ? (
                            <>
                              <Icon name="check" size={16} strokeWidth={2.4} /> Selected
                            </>
                          ) : ok ? (
                            'Select'
                          ) : (
                            'Unavailable'
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={`panel ${selected ? '' : 'panel-locked'}`} ref={detailsRef}>
              <h2 className="panel-title">
                <span className="num">2</span> Your details
              </h2>
              {!selected ? (
                <p className="muted">Select a room above to continue.</p>
              ) : (
                <form id="guest-form" className="guest-form" onSubmit={submit}>
                  <div className="form-grid">
                    <label className="field">
                      <span className="field-label">
                        Full name <i>*</i>
                      </span>
                      <input className="input" value={guest.guest_name} onChange={(e) => setGuest({ ...guest, guest_name: e.target.value })} required minLength={2} autoComplete="name" />
                    </label>
                    <label className="field">
                      <span className="field-label">
                        Mobile number <i>*</i>
                      </span>
                      <input
                        className="input"
                        type="tel"
                        inputMode="tel"
                        value={guest.phone}
                        onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                        required
                        pattern="\+?[0-9][0-9 \-]{6,}"
                        title="Please enter a valid phone number"
                        placeholder="+91 98XXX XXXXX"
                        autoComplete="tel"
                      />
                      <small className="field-hint">We'll call this number to confirm your booking.</small>
                    </label>
                    <label className="field">
                      <span className="field-label">Email (optional)</span>
                      <input className="input" type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} autoComplete="email" />
                    </label>
                    <label className="field">
                      <span className="field-label">Expected arrival time</span>
                      <select className="input" value={guest.arrival} onChange={(e) => setGuest({ ...guest, arrival: e.target.value })}>
                        {ARRIVAL.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field span-2">
                      <span className="field-label">Special requests (optional)</span>
                      <textarea
                        className="input"
                        rows={3}
                        value={guest.special_requests}
                        onChange={(e) => setGuest({ ...guest, special_requests: e.target.value })}
                        placeholder="e.g. early check-in, extra bed, ground floor"
                      />
                    </label>
                    <input className="hp" tabIndex={-1} autoComplete="off" value={guest.website} onChange={(e) => setGuest({ ...guest, website: e.target.value })} aria-hidden="true" />
                  </div>
                  {error && (
                    <p className="alert alert-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="book-rules">
                    <KeyRules compact />
                    <ul>
                      <li>Carry a Passport or Aadhaar for every adult</li>
                      <li>Primary guest must be at least 18 years old</li>
                      <li>Pets are not allowed</li>
                      <li>
                        Check-in from {time12(info.settings.check_in_time)}, check-out by {time12(info.settings.check_out_time)}. Early
                        check-in: ₹1,000 extra
                      </li>
                    </ul>
                    <p className="book-rules-more">
                      By confirming, you agree to the{' '}
                      <Link to="/#rules" target="_blank">
                        house rules
                      </Link>
                      .
                    </p>
                  </div>
                  <button className="btn btn-primary btn-lg btn-block submit-btn" disabled={busy}>
                    {busy ? (online ? 'Opening payment…' : 'Confirming…') : online ? `Pay ${money(selected.total)} & book` : `Confirm booking · ${money(selected.total)}`}
                  </button>
                  {online ? (
                    <p className="fine pay-fine">
                      <Icon name="shield" size={15} /> Secure payment by Razorpay: UPI, cards, netbanking and wallets. Your room is held for{' '}
                      {info.payments.hold_minutes} minutes while you pay.
                    </p>
                  ) : (
                    <p className="fine">No payment now. You pay {money(selected.total)} at the hotel when you check in.</p>
                  )}
                </form>
              )}
            </section>
          </div>

          <aside className="summary" aria-label="Booking summary">
            <h2 className="panel-title">Booking summary</h2>
            {type && selected && <RoomImage type={type} className="summary-img" />}
            <dl className="summary-list">
              <div>
                <dt>Check-in</dt>
                <dd>
                  {fmtDate(stay.check_in, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  <small>from {time12(info?.settings.check_in_time)}</small>
                </dd>
              </div>
              <div>
                <dt>Check-out</dt>
                <dd>
                  {fmtDate(stay.check_out, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  <small>until {time12(info?.settings.check_out_time)}</small>
                </dd>
              </div>
              <div>
                <dt>Guests</dt>
                <dd>{guestsLabel(stay)}</dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{selected ? selected.name : <span className="muted">Not selected yet</span>}</dd>
              </div>
            </dl>
            {selected && (
              <div className="summary-total">
                <div>
                  <span>
                    {money(selected.price)} × {n} night{n > 1 ? 's' : ''}
                  </span>
                  <span>{money(selected.total)}</span>
                </div>
                <div className="total-row">
                  <span>Total</span>
                  <b>{money(selected.total)}</b>
                </div>
              </div>
            )}
            <ul className="assure">
              <li>
                <Icon name={online ? 'shield' : 'wallet'} size={18} /> {online ? 'Full payment at the time of booking (UPI, cards, netbanking)' : 'No prepayment. Pay at the hotel'}
              </li>
              <li>
                <Icon name="tag" size={18} /> No booking fees
              </li>
              {info?.settings.phone && (
                <li>
                  <Icon name="phone" size={18} />
                  <span>
                    Need help? <a href={telHref(info.settings.phone)}>{info.settings.phone}</a>
                  </span>
                </li>
              )}
            </ul>
          </aside>
        </div>
      </div>

      {selected && (
        <div className="mobile-bar">
          <div>
            <small>Total, {n} night{n > 1 ? 's' : ''}</small>
            <b>{money(selected.total)}</b>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              const form = document.getElementById('guest-form');
              if (form?.checkValidity()) form.requestSubmit();
              else detailsRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            disabled={busy}
          >
            {online ? 'Pay & book' : 'Confirm booking'}
          </button>
        </div>
      )}
    </main>
  );
}

function PaymentDue({ unpaid: { booking }, info, busy, error, onPay, onBack }) {
  const phone = info?.settings.phone;
  return (
    <main className="book-page">
      <div className="wrap confirm">
        <div className="confirm-icon confirm-icon-wait">
          <Icon name="wallet" size={34} />
        </div>
        <h1>Complete your payment</h1>
        <p className="lead">
          Your {booking.room_type_name} is held for {info.payments.hold_minutes} minutes. Pay {money(booking.total_amount)} to confirm the
          booking.
        </p>
        <dl className="confirm-grid">
          <div>
            <dt>Check-in</dt>
            <dd>{fmtDate(booking.check_in, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</dd>
          </div>
          <div>
            <dt>Check-out</dt>
            <dd>{fmtDate(booking.check_out, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</dd>
          </div>
          <div>
            <dt>Guests</dt>
            <dd>{guestsLabel(booking)}</dd>
          </div>
          <div className="confirm-total">
            <dt>Amount to pay</dt>
            <dd className="strong">{money(booking.total_amount)}</dd>
          </div>
        </dl>
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onBack} disabled={busy}>
            Change booking
          </button>
          <button className="btn btn-primary btn-lg" onClick={onPay} disabled={busy}>
            <Icon name="shield" size={18} /> {busy ? 'Opening payment…' : `Pay ${money(booking.total_amount)}`}
          </button>
        </div>
        <p className="muted small">
          If money was taken from your account but you don't see a confirmation, don't pay again
          {phone ? (
            <>
              . Call us on <a href={telHref(phone)}>{phone}</a> with reference <b>{booking.ref}</b>.
            </>
          ) : (
            <>. Contact the hotel with reference {booking.ref}.</>
          )}
        </p>
      </div>
    </main>
  );
}

function Confirmation({ booking, info }) {
  const s = info?.settings;
  const paid = booking.payment_status === 'paid';
  const verifying = booking.payment_status === 'verifying';
  const wa = waHref(s?.whatsapp, `Hi, I just booked at JD Residency. My booking reference is ${booking.ref}.`);
  const [copied, setCopied] = useState(false);
  return (
    <main className="book-page">
      <div className="wrap confirm">
        <div className="confirm-icon">
          <Icon name="check" size={36} strokeWidth={2.4} />
        </div>
        <h1>{paid ? 'Payment received' : verifying ? 'Payment being confirmed' : 'Booking received'}</h1>
        <p className="lead">
          Thank you, {booking.guest_name.split(' ')[0]}.{' '}
          {verifying
            ? 'We are confirming your payment with the bank. This usually takes a few seconds; you will get your confirmation on WhatsApp.'
            : `Your room is reserved${paid ? ' and fully paid' : ''}. We'll send your confirmation on WhatsApp (or call you) shortly.`}
        </p>
        <div className="ref-box">
          <span>Booking reference</span>
          <b>{booking.ref}</b>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              navigator.clipboard?.writeText(booking.ref).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <dl className="confirm-grid">
          <div>
            <dt>Room</dt>
            <dd>{booking.room_type_name}</dd>
          </div>
          <div>
            <dt>Guests</dt>
            <dd>{guestsLabel(booking)}</dd>
          </div>
          <div>
            <dt>Check-in</dt>
            <dd>
              {fmtDate(booking.check_in, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              <small>from {time12(s?.check_in_time)}</small>
            </dd>
          </div>
          <div>
            <dt>Check-out</dt>
            <dd>
              {fmtDate(booking.check_out, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              <small>until {time12(s?.check_out_time)}</small>
            </dd>
          </div>
          <div className="confirm-total">
            <dt>{paid ? 'Total paid online' : verifying ? 'Total (payment being confirmed)' : 'Total (pay at hotel)'}</dt>
            <dd className="strong">{money(paid ? booking.amount_paid : booking.total_amount)}</dd>
          </div>
        </dl>
        <h2>What happens next</h2>
        <ol className="next-steps">
          <li>We allocate your room and confirm on WhatsApp or by phone.</li>
          <li>On arrival, show a Passport or Aadhaar for each adult (local IDs are not accepted).</li>
          {!paid && !verifying && <li>Pay at the hotel when you check in.</li>}
        </ol>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={() => window.print()}>
            <Icon name="printer" size={18} /> Print / save
          </button>
          {wa && (
            <a className="btn btn-ghost" href={wa} target="_blank" rel="noreferrer">
              <Icon name="whatsapp" size={18} /> Send to hotel on WhatsApp
            </a>
          )}
          <Link className="btn btn-primary" to="/">
            Back to home
          </Link>
        </div>
        {s?.phone && (
          <p className="muted small">
            Need to change something? Call us on <a href={telHref(s.phone)}>{s.phone}</a> and mention your reference.
          </p>
        )}
      </div>
    </main>
  );
}
