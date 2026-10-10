import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { STATUS_LABELS, addDays, fmtDate, isoDate, nights } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { useAdmin } from './AdminApp.jsx';

const DAYS = 14;

/** Assign overlapping bookings to separate lanes so bars never cover each other. */
function lanes(bookings) {
  const ends = [];
  return bookings
    .slice()
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
    .map((b) => {
      let lane = ends.findIndex((end) => end <= b.check_in);
      if (lane === -1) lane = ends.length;
      ends[lane] = b.check_out;
      return { ...b, lane };
    });
}

export default function CalendarView() {
  const { version, openBooking, newBooking } = useAdmin();
  const [from, setFrom] = useState(isoDate());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/admin/calendar?from=${from}&days=${DAYS}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [from, version]);

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(from, i)), [from]);
  const today = isoDate();

  const groups = useMemo(() => {
    if (!data) return [];
    const byType = new Map();
    for (const r of data.rooms) {
      if (!byType.has(r.room_type_id)) byType.set(r.room_type_id, { id: r.room_type_id, name: r.room_type_name, accent: r.accent, rooms: [] });
      byType.get(r.room_type_id).rooms.push({ ...r, bookings: lanes(data.bookings.filter((b) => b.room_id === r.id)) });
    }
    for (const g of byType.values()) {
      g.unassigned = lanes(data.bookings.filter((b) => b.room_type_id === g.id && !b.room_id));
    }
    return [...byType.values()];
  }, [data]);

  function renderBar(b) {
    const start = Math.max(0, nights(from, b.check_in));
    const end = Math.min(DAYS, nights(from, b.check_out));
    const clippedL = b.check_in < from;
    const clippedR = nights(from, b.check_out) > DAYS;
    return (
      <button
        key={b.id}
        className={`cal-bar s-${b.status} ${clippedL ? 'clip-l' : ''} ${clippedR ? 'clip-r' : ''}`}
        style={{ gridColumn: `${start + 1} / ${end + 1}`, gridRow: b.lane + 1 }}
        onClick={() => openBooking(b.id)}
        title={`${b.guest_name} · ${STATUS_LABELS[b.status]} · ${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}`}
      >
        <span>{b.guest_name}</span>
      </button>
    );
  }

  function renderRow({ key, label, sub, bookings, onEmpty, muted }) {
    const laneCount = Math.max(1, ...bookings.map((b) => b.lane + 1));
    return (
      <div key={key} className={`cal-row ${muted ? 'cal-row-muted' : ''}`}>
        <div className="cal-label">
          <b>{label}</b>
          {sub && <small>{sub}</small>}
        </div>
        <div className="cal-track" style={{ gridTemplateRows: `repeat(${laneCount}, 34px)` }}>
          {days.map((d, i) => (
            <button
              key={d}
              className={`cal-cell ${d === today ? 'is-today' : ''} ${[0, 6].includes(new Date(`${d}T00:00:00`).getDay()) ? 'is-weekend' : ''}`}
              style={{ gridColumn: i + 1, gridRow: `1 / ${laneCount + 1}` }}
              onClick={() => onEmpty?.(d)}
              aria-label={`New booking from ${fmtDate(d)}`}
              tabIndex={-1}
            />
          ))}
          {bookings.map(renderBar)}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Room calendar</h1>
          <p className="muted">Each bar is a stay. Click a bar to open it, or an empty day to book that room.</p>
        </div>
        <div className="head-actions">
          <button className="icon-btn bordered" onClick={() => setFrom(addDays(from, -7))} aria-label="Previous week">
            <Icon name="chevronLeft" />
          </button>
          <button className="abtn" onClick={() => setFrom(isoDate())}>
            Today
          </button>
          <button className="icon-btn bordered" onClick={() => setFrom(addDays(from, 7))} aria-label="Next week">
            <Icon name="chevronRight" />
          </button>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Start date" />
        </div>
      </header>

      <div className="legend">
        {['pending', 'confirmed', 'checked_in', 'checked_out'].map((s) => (
          <span key={s}>
            <i className={`cal-swatch s-${s}`} /> {STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      {error && <p className="aerror">{error}</p>}
      <div className="card flush cal-card">
        {!data ? (
          <p className="empty">Loading…</p>
        ) : (
          <div className="cal" style={{ '--days': DAYS }}>
            <div className="cal-row cal-head">
              <div className="cal-label" />
              <div className="cal-track">
                {days.map((d) => (
                  <div key={d} className={`cal-day ${d === today ? 'is-today' : ''}`}>
                    <small>{fmtDate(d, { weekday: 'short' })}</small>
                    <b>{fmtDate(d, { day: 'numeric' })}</b>
                    <small>{fmtDate(d, { month: 'short' })}</small>
                  </div>
                ))}
              </div>
            </div>
            {groups.map((g) => (
              <div key={g.id} className="cal-group" style={{ '--accent': g.accent }}>
                <div className="cal-group-title">{g.name}</div>
                {g.rooms.map((r) =>
                  renderRow({
                    key: r.id,
                    label: `Room ${r.number}`,
                    sub: r.status === 'maintenance' ? 'Maintenance' : null,
                    muted: r.status === 'maintenance',
                    bookings: r.bookings,
                    onEmpty: (d) => newBooking({ room_type_id: g.id, room_id: r.id, check_in: d }),
                  }),
                )}
                {g.unassigned.length > 0 &&
                  renderRow({ key: 'unassigned', label: 'No room yet', sub: 'Assign from booking', bookings: g.unassigned })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
