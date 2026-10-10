import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { compactMoney, fmtDate, money } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { StatusPill, useAdmin } from './AdminApp.jsx';

export default function Dashboard() {
  const { version, openBooking, notify, changed } = useAdmin();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/dashboard')
      .then(setD)
      .catch((e) => setError(e.message));
  }, [version]);

  async function quick(id, status, label) {
    try {
      await api(`/admin/bookings/${id}`, { method: 'PATCH', body: { status } });
      notify(label);
      changed();
    } catch (e) {
      notify(e.message, 'err');
    }
  }

  if (error) return <p className="aerror">{error}</p>;
  if (!d) return <p className="muted">Loading…</p>;

  const occ = d.rooms.sellable ? Math.round((d.occupied_tonight / d.rooms.sellable) * 100) : 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Good {greeting()}</h1>
          <p className="muted">{fmtDate(d.today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </header>

      <section className="kpis">
        <Kpi label="Arrivals today" value={d.arrivals} icon="door" />
        <Kpi label="Departures due" value={d.departures} icon="logout" />
        <Kpi label="Guests in house" value={d.in_house} icon="users" />
        <Kpi
          label="Occupied tonight"
          value={`${d.occupied_tonight}/${d.rooms.sellable}`}
          sub={`${occ}% of rooms`}
          meter={occ}
          icon="bed"
        />
        <Kpi label="Awaiting confirmation" value={d.pending} icon="bell" highlight={d.pending > 0} />
        <Kpi label="Booked revenue this month" value={compactMoney(d.month_revenue)} sub={money(d.month_revenue)} icon="sparkle" />
      </section>

      <section className="card">
        <OccupancyChart forecast={d.forecast} />
      </section>

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">Arriving today</h2>
          <BookingList
            items={d.arrivals_list}
            empty="No arrivals expected today."
            onOpen={openBooking}
            action={(b) => (
              <button className="abtn abtn-sm abtn-primary" onClick={() => quick(b.id, 'checked_in', `${b.guest_name} checked in`)}>
                Check in
              </button>
            )}
          />
        </section>
        <section className="card">
          <h2 className="card-title">Leaving today</h2>
          <BookingList
            items={d.departures_list}
            empty="No check-outs due today."
            onOpen={openBooking}
            action={(b) => (
              <button className="abtn abtn-sm" onClick={() => quick(b.id, 'checked_out', `${b.guest_name} checked out`)}>
                Check out
              </button>
            )}
          />
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Latest bookings</h2>
        <BookingList items={d.recent} empty="No bookings yet. They'll show up here as soon as guests book." onOpen={openBooking} showDates />
      </section>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function Kpi({ label, value, sub, icon, meter, highlight }) {
  return (
    <div className={`kpi ${highlight ? 'kpi-hl' : ''}`}>
      <div className="kpi-label">
        <Icon name={icon} size={16} /> {label}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {meter !== undefined && (
        <div className="meter" role="img" aria-label={`${meter}% occupied`}>
          <span style={{ width: `${Math.min(100, meter)}%` }} />
        </div>
      )}
    </div>
  );
}

function BookingList({ items, empty, onOpen, action, showDates }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="blist">
      {items.map((b) => (
        <li key={b.id}>
          <button className="blist-main" onClick={() => onOpen(b.id)}>
            <b>{b.guest_name}</b>
            <span className="muted">
              {b.room_type_name}
              {b.room_number ? ` · Room ${b.room_number}` : ' · no room yet'}
              {showDates && ` · ${fmtDate(b.check_in, { day: 'numeric', month: 'short' })} → ${fmtDate(b.check_out, { day: 'numeric', month: 'short' })}`}
            </span>
          </button>
          <StatusPill status={b.status} />
          {action?.(b)}
        </li>
      ))}
    </ul>
  );
}

function OccupancyChart({ forecast }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const W = 720;
  const H = 220;
  const pad = { l: 40, r: 8, t: 16, b: 34 };
  const band = (W - pad.l - pad.r) / forecast.length;
  const barW = Math.min(24, band * 0.6);
  const y = (pct) => pad.t + (H - pad.t - pad.b) * (1 - pct / 100);
  const data = forecast.map((f) => ({ ...f, pct: f.rooms ? Math.round((f.booked / f.rooms) * 100) : 0 }));
  const peak = data.reduce((m, d, i) => (d.pct > data[m].pct ? i : m), 0);

  return (
    <div className="viz-root">
      <div className="chart-head">
        <div>
          <h2 className="card-title">Occupancy, next 14 days</h2>
          <p className="muted small">Share of rooms booked each night (pending, confirmed and in-house guests)</p>
        </div>
        <button className="abtn abtn-sm" onClick={() => setTable((t) => !t)}>
          <Icon name={table ? 'grid' : 'list'} size={16} /> {table ? 'Chart' : 'Table'}
        </button>
      </div>
      {table ? (
        <table className="atable compact">
          <thead>
            <tr>
              <th>Night of</th>
              <th className="num">Rooms booked</th>
              <th className="num">Occupancy</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td className="num">
                  {d.booked} / {d.rooms}
                </td>
                <td className="num">{d.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-wrap">
          <div className="chart-inner">
            <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Occupancy for the next 14 nights">
              {[0, 50, 100].map((t) => (
                <g key={t}>
                  <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
                  <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
                    {t}%
                  </text>
                </g>
              ))}
              {data.map((d, i) => {
                const cx = pad.l + band * i + band / 2;
                const top = y(d.pct);
                const h = Math.max(0, y(0) - top);
                const r = Math.min(4, h);
                return (
                  <g key={d.date} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                    <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
                    {h > 0 && (
                      <path
                        className={`bar ${hover === i ? 'is-hover' : ''}`}
                        d={`M${cx - barW / 2},${y(0)} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${y(0)} Z`}
                      />
                    )}
                    {i === peak && d.pct > 0 && hover === null && (
                      <text x={cx} y={top - 6} textAnchor="middle" className="val">
                        {d.pct}%
                      </text>
                    )}
                    <text x={cx} y={H - pad.b + 16} textAnchor="middle" className="tick">
                      {fmtDate(d.date, { day: 'numeric' })}
                    </text>
                    <text x={cx} y={H - pad.b + 29} textAnchor="middle" className="tick tick-sub">
                      {fmtDate(d.date, { weekday: 'narrow' })}
                    </text>
                  </g>
                );
              })}
              <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="axis" />
            </svg>
            {hover !== null && (
              <div className="tooltip" style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%`, top: `${(y(data[hover].pct) / H) * 100}%` }}>
                <b>{fmtDate(data[hover].date, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                <span>
                  {data[hover].booked} of {data[hover].rooms} rooms · {data[hover].pct}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
