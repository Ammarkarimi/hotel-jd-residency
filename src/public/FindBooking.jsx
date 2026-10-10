import { useState } from 'react';
import { api } from '../lib/api.js';
import { fmtDate, money } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { useEscape } from './effects.jsx';
import { telHref, useInfo } from './PublicApp.jsx';

const LABELS = {
  pending: 'Received, awaiting confirmation call',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export default function FindBooking({ onClose }) {
  const { info } = useInfo();
  const [ref, setRef] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEscape(onClose);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const { booking } = await api(`/public/bookings/${encodeURIComponent(ref.trim())}?phone=${encodeURIComponent(phone)}`);
      setResult(booking);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="find-title" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        <h2 id="find-title">Find my booking</h2>
        <p className="muted">Enter the reference you received when you booked, and your phone number.</p>
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span className="field-label">Booking reference</span>
            <input className="input" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="e.g. JD4K7P2Q" required autoFocus />
          </label>
          <label className="field">
            <span className="field-label">Phone number</span>
            <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Searching…' : 'Find booking'}
          </button>
        </form>
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className="find-result">
            <span className={`badge badge-${result.status}`}>{LABELS[result.status]}</span>
            <h3>{result.room_type_name}</h3>
            <p>
              {fmtDate(result.check_in, { weekday: 'short', day: 'numeric', month: 'short' })} →{' '}
              {fmtDate(result.check_out, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <p>
              Total <b>{money(result.total_amount)}</b>, pay at hotel
            </p>
            {info?.settings.phone && (
              <p className="muted small">
                To change or cancel, call <a href={telHref(info.settings.phone)}>{info.settings.phone}</a>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
