import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { SOURCE_LABELS, STATUS_LABELS, fmtDate, money, nights } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { StatusPill, useAdmin } from './AdminApp.jsx';

export default function Bookings() {
  const { version, openBooking, newBooking } = useAdmin();
  const [filters, setFilters] = useState({ view: 'upcoming', status: '', q: '', from: '', to: '' });
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
      api(`/admin/bookings?${params}`)
        .then((d) => {
          setRows(d.bookings);
          setError('');
        })
        .catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [filters, version]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  function exportCsv() {
    const cols = ['ref', 'guest_name', 'phone', 'email', 'room_type_name', 'room_number', 'check_in', 'check_out', 'adults', 'children', 'total_amount', 'status', 'source', 'special_requests', 'admin_notes', 'created_at'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `jd-residency-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Bookings</h1>
          <p className="muted">Click a booking to confirm, assign a room, check in or check out.</p>
        </div>
        <div className="head-actions">
          <button className="abtn" onClick={exportCsv} disabled={!rows?.length}>
            Export CSV
          </button>
          <button className="abtn abtn-primary" onClick={() => newBooking({})}>
            <Icon name="plus" size={16} /> New booking
          </button>
        </div>
      </header>

      <div className="filters">
        <div className="seg" role="tablist">
          {[
            ['upcoming', 'Upcoming & in-house'],
            ['all', 'All bookings'],
          ].map(([v, l]) => (
            <button key={v} role="tab" aria-selected={filters.view === v} className={filters.view === v ? 'is-on' : ''} onClick={() => setFilters((f) => ({ ...f, view: v }))}>
              {l}
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={16} />
          <input placeholder="Name, phone or ref" value={filters.q} onChange={set('q')} aria-label="Search bookings" />
        </label>
        <select value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="range">
          <span>Staying between</span>
          <input type="date" value={filters.from} onChange={set('from')} aria-label="From" />
          <span>and</span>
          <input type="date" value={filters.to} onChange={set('to')} aria-label="To" />
        </label>
      </div>

      {error && <p className="aerror">{error}</p>}
      <div className="card flush">
        {!rows ? (
          <p className="empty">Loading…</p>
        ) : !rows.length ? (
          <p className="empty">No bookings match these filters.</p>
        ) : (
          <div className="table-scroll">
            <table className="atable">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Room</th>
                  <th>Stay</th>
                  <th className="num">Total</th>
                  <th>Status</th>
                  <th>Via</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} onClick={() => openBooking(b.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openBooking(b.id)}>
                    <td>
                      <b>{b.guest_name}</b>
                      <div className="muted small">
                        <span className="mono">{b.ref}</span> · {b.phone}
                      </div>
                    </td>
                    <td>
                      {b.room_type_name}
                      <div className="muted small">{b.room_number ? `Room ${b.room_number}` : 'Not assigned'}</div>
                    </td>
                    <td>
                      {fmtDate(b.check_in, { day: 'numeric', month: 'short' })} → {fmtDate(b.check_out, { day: 'numeric', month: 'short', year: '2-digit' })}
                      <div className="muted small">
                        {nights(b.check_in, b.check_out)} night(s) · {b.adults + b.children} guest(s)
                      </div>
                    </td>
                    <td className="num">{money(b.total_amount)}</td>
                    <td>
                      <StatusPill status={b.status} />
                    </td>
                    <td className="muted small">{SOURCE_LABELS[b.source] || b.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
