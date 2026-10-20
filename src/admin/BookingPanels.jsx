import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { SOURCE_LABELS, addDays, fmtDate, isoDate, money, nights } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { Modal, StatusPill, useAdmin } from './AdminApp.jsx';

const ACTIONS = {
  awaiting_payment: [
    ['confirmed', 'Confirm without online payment', ''],
    ['cancelled', 'Cancel', 'danger'],
  ],
  pending: [
    ['confirmed', 'Confirm booking', 'primary'],
    ['cancelled', 'Cancel', 'danger'],
  ],
  confirmed: [
    ['checked_in', 'Check in', 'primary'],
    ['no_show', 'Mark no-show', ''],
    ['cancelled', 'Cancel', 'danger'],
  ],
  checked_in: [['checked_out', 'Check out', 'primary']],
  checked_out: [['checked_in', 'Undo check-out', '']],
  cancelled: [['confirmed', 'Re-open booking', '']],
  no_show: [['confirmed', 'Re-open booking', '']],
};

export function BookingDrawer({ id, onClose }) {
  const { rooms, notify, changed, version, wa: waConfig } = useAdmin();
  const [b, setB] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api(`/admin/bookings/${id}`)
      .then(({ booking, notifications }) => {
        if (!live) return;
        setB(booking);
        setNotes(booking.admin_notes);
        setNotifications(notifications || []);
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, [id, version]);

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  async function patch(body, message) {
    setBusy(true);
    setError('');
    try {
      const { booking, whatsapp, notifications } = await api(`/admin/bookings/${id}`, { method: 'PATCH', body });
      setB(booking);
      setNotes(booking.admin_notes);
      if (notifications) setNotifications(notifications);
      if (whatsapp?.ok) notify(`${message}. WhatsApp ${whatsapp.kind === 'review_request' ? 'review link' : 'confirmation'} sent to the guest.`);
      else if (whatsapp) notify(`${message}, but the WhatsApp message failed: ${whatsapp.error}`, 'err');
      else notify(message);
      changed();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete booking ${b.ref} permanently? Use "Cancel" instead if you want to keep a record.`)) return;
    try {
      await api(`/admin/bookings/${id}`, { method: 'DELETE' });
      notify('Booking deleted');
      changed();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }

  const typeRooms = b ? rooms.filter((r) => r.room_type_id === b.room_type_id) : [];
  const phoneDigits = b?.phone.replace(/\D/g, '');
  const wa = phoneDigits?.length === 10 ? `91${phoneDigits}` : phoneDigits;

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Booking" onMouseDown={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <span className="mono">{b?.ref}</span>
            {b && <StatusPill status={b.status} />}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>

        {!b ? (
          <div className="drawer-body">{error || 'Loading…'}</div>
        ) : editing ? (
          <div className="drawer-body">
            <BookingForm
              initial={b}
              mode="edit"
              busy={busy}
              error={error}
              onCancel={() => {
                setEditing(false);
                setError('');
              }}
              onSubmit={async (form) => {
                if (await patch(form, 'Booking updated')) setEditing(false);
              }}
            />
          </div>
        ) : (
          <div className="drawer-body">
            <h2 className="drawer-guest">{b.guest_name}</h2>
            <div className="contact-row">
              <a className="abtn abtn-sm" href={`tel:${b.phone}`}>
                <Icon name="phone" size={16} /> {b.phone}
              </a>
              {wa && (
                <a className="abtn abtn-sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                  <Icon name="whatsapp" size={16} /> WhatsApp
                </a>
              )}
              {b.email && (
                <a className="abtn abtn-sm" href={`mailto:${b.email}`}>
                  <Icon name="mail" size={16} /> Email
                </a>
              )}
            </div>

            <dl className="facts">
              <div>
                <dt>Room type</dt>
                <dd>{b.room_type_name}</dd>
              </div>
              <div>
                <dt>Guests</dt>
                <dd>
                  {b.adults} adult{b.adults > 1 ? 's' : ''}
                  {b.children ? `, ${b.children} child${b.children > 1 ? 'ren' : ''}` : ''}
                </dd>
              </div>
              <div>
                <dt>Check-in</dt>
                <dd>{fmtDate(b.check_in, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</dd>
              </div>
              <div>
                <dt>Check-out</dt>
                <dd>{fmtDate(b.check_out, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</dd>
              </div>
              <div>
                <dt>Nights</dt>
                <dd>{nights(b.check_in, b.check_out)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd className="strong">{money(b.total_amount)}</dd>
              </div>
              <div className="span-2">
                <dt>Payment</dt>
                <dd>
                  <PaymentState booking={b} />
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{SOURCE_LABELS[b.source] || b.source}</dd>
              </div>
              <div>
                <dt>Booked on</dt>
                <dd>{fmtDate(b.created_at.slice(0, 10))}</dd>
              </div>
            </dl>

            {b.special_requests && (
              <div className="note-box">
                <b>Guest's request</b>
                <p>{b.special_requests}</p>
              </div>
            )}

            <label className="afield">
              <span>Room</span>
              <select
                value={b.room_id || ''}
                disabled={busy || !['pending', 'confirmed', 'checked_in'].includes(b.status)}
                onChange={(e) => patch({ room_id: e.target.value || null }, 'Room assigned')}
              >
                <option value="">Not assigned yet</option>
                {typeRooms.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.status !== 'active'}>
                    Room {r.number}
                    {r.status !== 'active' ? ' (maintenance)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="action-row">
              {(ACTIONS[b.status] || []).map(([status, label, kind]) => (
                <button
                  key={status}
                  className={`abtn ${kind ? `abtn-${kind}` : ''}`}
                  disabled={busy}
                  onClick={() => patch({ status }, `${b.guest_name}: ${label.toLowerCase()} done`)}
                >
                  {label}
                </button>
              ))}
              <button className="abtn" onClick={() => setEditing(true)}>
                <Icon name="edit" size={16} /> Edit
              </button>
            </div>
            {error && <p className="aerror">{error}</p>}

            {waConfig && waConfig.wa_mode !== 'off' && (
              <WhatsAppPanel booking={b} wa={waConfig} notifications={notifications} onNotifications={setNotifications} />
            )}

            <label className="afield">
              <span>Staff notes (only visible here)</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ID checked, advance paid, etc." />
            </label>
            {notes !== b.admin_notes && (
              <button className="abtn abtn-sm" disabled={busy} onClick={() => patch({ admin_notes: notes }, 'Notes saved')}>
                Save notes
              </button>
            )}

            <button className="link-danger" onClick={remove}>
              <Icon name="trash" size={16} /> Delete booking
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function PaymentState({ booking: b }) {
  if (b.payment_status === 'paid') {
    return (
      <span className="pay-state">
        <span className="pay-paid">
          <Icon name="check" size={15} strokeWidth={2.4} /> Paid online {money(b.amount_paid)}
        </span>
        {b.payment_id && (
          <a href={`https://dashboard.razorpay.com/app/payments/${b.payment_id}`} target="_blank" rel="noreferrer">
            {b.payment_id} <Icon name="external" size={13} />
          </a>
        )}
      </span>
    );
  }
  if (b.payment_status === 'awaiting' && b.status !== 'awaiting_payment') return <span>Not paid online yet</span>;
  if (b.payment_status === 'awaiting') {
    const until = b.hold_until && new Date(b.hold_until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    return <span className="pay-wait">Guest is paying online{until ? ` (room held until ${until})` : ''}</span>;
  }
  if (b.payment_status === 'expired') return <span className="muted">Online payment not completed</span>;
  if (b.payment_status === 'failed') return <span className="muted">Online payment could not be started</span>;
  return <span>At the hotel</span>;
}

const NOTE_LABELS = {
  owner_alert: { sent: 'Owner alerted on WhatsApp', failed: 'Owner alert failed' },
  guest_confirmation: { sent: 'Confirmation sent to guest', failed: 'Confirmation to guest failed', opened: 'Confirmation opened in WhatsApp' },
  review_request: { sent: 'Review link sent to guest', failed: 'Review link to guest failed', opened: 'Review link opened in WhatsApp' },
};

const SENDS = {
  confirmation: { path: 'whatsapp-confirmation', kind: 'guest_confirmation', what: 'confirmation' },
  review: { path: 'whatsapp-review', kind: 'review_request', what: 'Google review link' },
};

function WhatsAppPanel({ booking: b, wa, notifications, onNotifications }) {
  const { notify } = useAdmin();
  const [busy, setBusy] = useState('');
  const canConfirm = ['confirmed', 'checked_in'].includes(b.status);
  const canReview = b.status === 'checked_out';
  const sentBefore = (kind) => notifications.some((n) => n.kind === kind && n.status !== 'failed');
  const isLink = wa.wa_mode === 'link';

  async function send(which) {
    const { path, what } = SENDS[which];
    // Open the tab straight away (inside the click) so browsers don't block it, then point it at WhatsApp.
    const tab = isLink ? window.open('', '_blank') : null;
    setBusy(which);
    try {
      const { whatsapp, notifications: list } = await api(`/admin/bookings/${b.id}/${path}`, { method: 'POST' });
      onNotifications(list);
      if (whatsapp.mode === 'link' && whatsapp.url) {
        if (tab) tab.location.href = whatsapp.url;
        else window.location.href = whatsapp.url;
        notify(`WhatsApp opened with the ${what}. Press Send there.`);
      } else if (whatsapp.ok) {
        notify(`${what[0].toUpperCase()}${what.slice(1)} sent to ${b.guest_name} on WhatsApp`);
      } else {
        notify(`WhatsApp message failed: ${whatsapp.error}`, 'err');
      }
    } catch (e) {
      tab?.close();
      notify(e.message, 'err');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="wa-panel">
      <header>
        <Icon name="whatsapp" size={18} />
        <b>WhatsApp</b>
        <small className="muted">{isLink ? 'opens WhatsApp with a ready message' : 'sent automatically'}</small>
      </header>
      {canConfirm && !b.room_id && <p className="small muted">Tip: assign a room first so the message tells the guest their room number.</p>}
      {canReview && <p className="small muted">The guest has checked out. Ask them to review the hotel on Google.</p>}
      {canConfirm || canReview ? (
        <div className="wa-actions">
          {canConfirm && (
            <button className="abtn abtn-wa" disabled={!!busy} onClick={() => send('confirmation')}>
              <Icon name="whatsapp" size={16} />
              {busy === 'confirmation' ? 'Sending…' : sentBefore('guest_confirmation') ? 'Send confirmation again' : 'Send confirmation to guest'}
            </button>
          )}
          {canReview && (
            <button className="abtn abtn-wa" disabled={!!busy} onClick={() => send('review')}>
              <Icon name="star" size={16} />
              {busy === 'review' ? 'Sending…' : sentBefore('review_request') ? 'Send review link again' : 'Send Google review link'}
            </button>
          )}
        </div>
      ) : (
        <p className="small muted">
          {b.status === 'pending'
            ? 'Confirm the booking first, then you can send the guest a WhatsApp confirmation.'
            : b.status === 'awaiting_payment'
              ? 'The guest is still paying online. The booking moves to Pending once the payment is received.'
              : 'Confirmations can be sent for confirmed bookings, and the review link after check-out.'}
        </p>
      )}
      {notifications.length > 0 && (
        <ul className="wa-log">
          {notifications.map((n) => (
            <li key={n.id} className={`wa-${n.status}`}>
              <Icon name={n.status === 'failed' ? 'alert' : 'check'} size={14} strokeWidth={2.2} />
              <div>
                <span>
                  {NOTE_LABELS[n.kind]?.[n.status] || n.kind} · +{n.recipient}
                </span>
                <small>
                  {new Date(n.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  {n.status === 'failed' && ` · ${n.detail}`}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NewBookingModal({ preset, onClose }) {
  const { notify, changed, openBooking } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="New booking" onClose={onClose} wide>
      <BookingForm
        initial={preset}
        mode="new"
        busy={busy}
        error={error}
        onCancel={onClose}
        onSubmit={async (form) => {
          setBusy(true);
          setError('');
          try {
            const { booking } = await api('/admin/bookings', { method: 'POST', body: form });
            notify(`Booking ${booking.ref} created`);
            changed();
            onClose();
            openBooking(booking.id);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Modal>
  );
}

function BookingForm({ initial = {}, mode, busy, error, onSubmit, onCancel }) {
  const { roomTypes, rooms } = useAdmin();
  const today = isoDate();
  const [f, setF] = useState(() => ({
    guest_name: initial.guest_name || '',
    phone: initial.phone || '',
    email: initial.email || '',
    adults: initial.adults || 2,
    children: initial.children || 0,
    room_type_id: initial.room_type_id || roomTypes[0]?.id || '',
    room_id: initial.room_id || '',
    check_in: initial.check_in || today,
    check_out: initial.check_out || addDays(initial.check_in || today, 1),
    status: initial.status || 'confirmed',
    source: initial.source || 'walk_in',
    total_amount: mode === 'edit' ? String(initial.total_amount ?? '') : '',
    special_requests: initial.special_requests || '',
    admin_notes: initial.admin_notes || '',
  }));
  const [totalTouched, setTotalTouched] = useState(false);
  useEffect(() => {
    if (!f.room_type_id && roomTypes[0]) setF((x) => ({ ...x, room_type_id: roomTypes[0].id }));
  }, [roomTypes, f.room_type_id]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => {
      const next = { ...x, [k]: v };
      if (k === 'check_in' && next.check_out <= v) next.check_out = addDays(v, 1);
      if (k === 'room_type_id') next.room_id = '';
      return next;
    });
  };
  const type = roomTypes.find((t) => t.id === Number(f.room_type_id));
  const n = nights(f.check_in, f.check_out);
  const suggested = type && n > 0 ? type.price * n : 0;
  const typeRooms = rooms.filter((r) => r.room_type_id === Number(f.room_type_id) && r.status === 'active');

  function submit(e) {
    e.preventDefault();
    const body = { ...f, room_type_id: Number(f.room_type_id), room_id: f.room_id ? Number(f.room_id) : null };
    if (mode === 'edit') {
      // Let the server recalculate the price unless staff typed their own.
      if (!totalTouched) delete body.total_amount;
      delete body.status;
      delete body.source;
      delete body.admin_notes;
    } else if (!totalTouched) {
      body.total_amount = '';
    }
    onSubmit(body);
  }

  return (
    <form className="aform" onSubmit={submit}>
      <div className="aform-grid">
        <label className="afield span-2">
          <span>Guest name</span>
          <input value={f.guest_name} onChange={set('guest_name')} required autoFocus={mode === 'new'} />
        </label>
        <label className="afield">
          <span>Phone</span>
          <input type="tel" value={f.phone} onChange={set('phone')} required />
        </label>
        <label className="afield">
          <span>Email</span>
          <input type="email" value={f.email} onChange={set('email')} />
        </label>
        <label className="afield">
          <span>Check-in</span>
          <input type="date" value={f.check_in} onChange={set('check_in')} required />
        </label>
        <label className="afield">
          <span>Check-out</span>
          <input type="date" min={addDays(f.check_in, 1)} value={f.check_out} onChange={set('check_out')} required />
        </label>
        <label className="afield">
          <span>Adults</span>
          <input type="number" min="1" max="10" value={f.adults} onChange={set('adults')} required />
        </label>
        <label className="afield">
          <span>Children</span>
          <input type="number" min="0" max="10" value={f.children} onChange={set('children')} />
        </label>
        <label className="afield">
          <span>Room type</span>
          <select value={f.room_type_id} onChange={set('room_type_id')} required>
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {money(t.price)}
              </option>
            ))}
          </select>
        </label>
        <label className="afield">
          <span>Room (optional)</span>
          <select value={f.room_id} onChange={set('room_id')}>
            <option value="">Assign later</option>
            {typeRooms.map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.number}
              </option>
            ))}
          </select>
        </label>
        {mode === 'new' && (
          <>
            <label className="afield">
              <span>Status</span>
              <select value={f.status} onChange={set('status')}>
                <option value="confirmed">Confirmed</option>
                <option value="checked_in">Checked in now</option>
                <option value="pending">Pending</option>
              </select>
            </label>
            <label className="afield">
              <span>Booked via</span>
              <select value={f.source} onChange={set('source')}>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="afield">
          <span>Total amount (₹)</span>
          <input
            type="number"
            min="0"
            value={totalTouched || mode === 'edit' ? f.total_amount : ''}
            placeholder={suggested ? `${suggested} (auto)` : ''}
            onChange={(e) => {
              setTotalTouched(true);
              set('total_amount')(e);
            }}
          />
          {suggested > 0 && (
            <small className="muted">
              {n} night{n > 1 ? 's' : ''} × {money(type.price)} = {money(suggested)}
              {mode === 'edit' && !totalTouched ? ' (recalculated if dates or room change)' : ''}
            </small>
          )}
        </label>
        <label className="afield span-2">
          <span>Guest's request</span>
          <input value={f.special_requests} onChange={set('special_requests')} />
        </label>
        {mode === 'new' && (
          <label className="afield span-2">
            <span>Staff notes</span>
            <input value={f.admin_notes} onChange={set('admin_notes')} placeholder="ID type, advance paid…" />
          </label>
        )}
      </div>
      {error && <p className="aerror">{error}</p>}
      <div className="aform-foot">
        <button type="button" className="abtn" onClick={onCancel}>
          Cancel
        </button>
        <button className="abtn abtn-primary" disabled={busy}>
          {busy ? 'Saving…' : mode === 'new' ? 'Create booking' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
