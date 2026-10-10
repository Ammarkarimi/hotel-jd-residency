import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { addDays, fmtDate, isoDate, money, time12 } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import BookingFlow from './BookingFlow.jsx';
import { AMENITIES, MARQUEE, NEARBY } from './content.js';
import { Cursor, Preloader, SceneBoundary, Tilt, hasWebGL, useInView, useRevealAll } from './effects.jsx';
import './site.css';

const HotelScene = lazy(() => import('../three/HotelScene.jsx'));
const RoomScene = lazy(() => import('../three/RoomScene.jsx'));

export default function Site() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState(null);
  const [findOpen, setFindOpen] = useState(false);
  const webgl = useMemo(hasWebGL, []);

  useEffect(() => {
    api('/public/info')
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (info) document.title = `${info.settings.hotel_name} · Book direct`;
  }, [info]);

  useRevealAll(info);

  const book = (p) => {
    setPreset({ ...p, at: Date.now() });
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' });
  };

  const s = info?.settings;

  return (
    <div className="site">
      <Preloader ready={!!info || !!error} />
      <Cursor />
      <div className="scene-bg" aria-hidden="true">
        {webgl ? (
          <SceneBoundary fallback={<div className="scene-fallback" />}>
            <Suspense fallback={<div className="scene-fallback" />}>
              <HotelScene name={s?.hotel_name || 'Hotel JD Residency'} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <div className="scene-fallback" />
        )}
      </div>
      <SceneDim />
      <div className="grain" aria-hidden="true" />

      <Nav onFind={() => setFindOpen(true)} name={s?.hotel_name} />

      <main>
        <Hero info={info} onSearch={book} />
        <Marquee />
        {error && <p className="load-error">Couldn't load live room data: {error}</p>}
        <Stats info={info} />
        <Rooms info={info} onBook={book} webgl={webgl} />
        <Amenities />
        <section id="book" className="section">
          <div className="wrap">
            <header className="section-head" data-reveal>
              <span className="eyebrow">Book direct</span>
              <h2>
                Lock in your <em>room</em>
              </h2>
              <p className="lead">No booking fees, no advance payment. Pick your dates and we will hold the room for you.</p>
            </header>
            <div data-reveal>
              <BookingFlow info={info} preset={preset} />
            </div>
          </div>
        </section>
        <Location info={info} />
      </main>

      <Footer info={info} onFind={() => setFindOpen(true)} />
      {findOpen && <FindBooking onClose={() => setFindOpen(false)} />}
    </div>
  );
}

/** Darkens the 3D city once the visitor scrolls past the hero so text stays readable. */
function SceneDim() {
  const ref = useRef(null);
  useEffect(() => {
    const on = () => {
      const t = Math.min(1, window.scrollY / (window.innerHeight * 0.8));
      if (ref.current) ref.current.style.opacity = String(t * 0.62);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return <div ref={ref} className="scene-dim" aria-hidden="true" />;
}

function Nav({ onFind, name }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const links = [
    ['#rooms', 'Rooms'],
    ['#amenities', 'Amenities'],
    ['#location', 'Location'],
  ];
  return (
    <header className={`nav ${scrolled ? 'is-scrolled' : ''} ${open ? 'is-open' : ''}`}>
      <a href="#top" className="brand" aria-label={name || 'Hotel JD Residency'}>
        <span className="brand-mark">JD</span>
        <span className="brand-name">Residency</span>
      </a>
      <nav className="nav-links" onClick={() => setOpen(false)}>
        {links.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
        <button className="linkish" onClick={onFind}>
          Find my booking
        </button>
        <a href="#book" className="btn btn-gold btn-sm">
          Book now
        </a>
      </nav>
      <button className="nav-toggle" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? 'x' : 'menu'} size={24} />
      </button>
    </header>
  );
}

function Hero({ info, onSearch }) {
  const today = isoDate();
  const [q, setQ] = useState({ check_in: today, check_out: addDays(today, 1), adults: 2 });
  const from = info?.room_types.length ? Math.min(...info.room_types.map((t) => t.price)) : null;
  const words = ['HOTEL', 'JD', 'RESIDENCY'];
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow hero-eyebrow">
          <span className="pulse" /> {info?.settings.address?.split(',').slice(-2).join(',').trim() || 'Now taking bookings'}
        </p>
        <h1 className="hero-title" aria-label={info?.settings.hotel_name || 'Hotel JD Residency'}>
          {words.map((w, wi) => (
            <span className={`hero-word w${wi}`} key={w} aria-hidden="true">
              {[...w].map((ch, i) => (
                <span className="ch" key={i} style={{ '--d': `${wi * 0.18 + i * 0.045 + 1.2}s` }}>
                  {ch}
                </span>
              ))}
            </span>
          ))}
        </h1>
        <p className="hero-sub">
          {info?.settings.tagline || 'Stay above the ordinary.'}{' '}
          <em>Clean, quiet, ridiculously comfortable rooms</em> right where the city happens.
        </p>
      </div>

      <form
        className="quick glass"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch({ stay: { ...q, children: 0 } });
        }}
      >
        <label className="field">
          <span>
            <Icon name="calendar" size={14} /> Check-in
          </span>
          <input
            type="date"
            min={today}
            value={q.check_in}
            onChange={(e) =>
              setQ((s) => ({ ...s, check_in: e.target.value, check_out: s.check_out <= e.target.value ? addDays(e.target.value, 1) : s.check_out }))
            }
          />
        </label>
        <label className="field">
          <span>
            <Icon name="calendar" size={14} /> Check-out
          </span>
          <input type="date" min={addDays(q.check_in, 1)} value={q.check_out} onChange={(e) => setQ((s) => ({ ...s, check_out: e.target.value }))} />
        </label>
        <label className="field">
          <span>
            <Icon name="users" size={14} /> Guests
          </span>
          <select value={q.adults} onChange={(e) => setQ((s) => ({ ...s, adults: e.target.value }))}>
            {[1, 2, 3, 4].map((v) => (
              <option key={v} value={v}>
                {v} adult{v > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-gold">
          Find rooms <Icon name="arrow" size={18} />
        </button>
        {from !== null && <p className="quick-from">Rooms from {money(from)}/night · pay at hotel</p>}
      </form>

      <a href="#rooms" className="scroll-cue" aria-label="Scroll down">
        <span />
      </a>
    </section>
  );
}

function Marquee() {
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {items.map((t, i) => (
          <span key={i}>
            {t} <b>✦</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function CountUp({ to, prefix = '', suffix = '' }) {
  const [ref, inView] = useInView({ rootMargin: '0px' });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView || !to) return;
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 1200);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);
  return (
    <span ref={ref}>
      {prefix}
      {n.toLocaleString('en-IN')}
      {suffix}
    </span>
  );
}

function Stats({ info }) {
  const from = info?.room_types.length ? Math.min(...info.room_types.map((t) => t.price)) : 0;
  const stats = [
    { value: <CountUp to={info?.room_count || 0} />, label: 'Rooms ready for you' },
    { value: <CountUp to={24} suffix="/7" />, label: 'Front desk, always on' },
    { value: <CountUp to={from} prefix="₹" />, label: 'Per night, starting' },
    { value: <CountUp to={0} prefix="₹" />, label: 'Booking fees. Ever.' },
  ];
  return (
    <section className="section stats-section">
      <div className="wrap stats">
        {stats.map((s, i) => (
          <div className="stat" key={i} data-reveal style={{ '--delay': `${i * 0.08}s` }}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rooms({ info, onBook, webgl }) {
  const types = info?.room_types || [];
  const [active, setActive] = useState(0);
  const [stageRef, inView] = useInView();
  // Mount the 3D room the first time it's near the viewport, then keep it (paused when off-screen).
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (inView) setSeen(true);
  }, [inView]);
  const t = types[active];
  if (!info) return <section id="rooms" className="section rooms-section" />;
  return (
    <section id="rooms" className="section rooms-section">
      <div className="wrap">
        <header className="section-head" data-reveal>
          <span className="eyebrow">The rooms</span>
          <h2>
            Step <em>inside</em> before you arrive
          </h2>
          <p className="lead">Drag to look around. Every room comes with AC, free Wi-Fi and fresh linen daily.</p>
        </header>

        <div className="room-tabs" role="tablist" data-reveal>
          {types.map((rt, i) => (
            <button
              key={rt.id}
              role="tab"
              aria-selected={i === active}
              className={`room-tab ${i === active ? 'is-active' : ''}`}
              style={{ '--accent': rt.accent }}
              onClick={() => setActive(i)}
            >
              <span className="room-tab-dot" />
              {rt.name}
              <small>{money(rt.price)}</small>
            </button>
          ))}
        </div>

        {t && (
          <div className="room-stage" data-reveal style={{ '--accent': t.accent }}>
            <div className="room-3d" ref={stageRef}>
              {t.image_url ? (
                <img src={t.image_url} alt={t.name} className="room-photo" />
              ) : webgl && seen ? (
                <SceneBoundary fallback={<RoomArt type={t} />}>
                  <Suspense fallback={<div className="room-loading">Building your room…</div>}>
                    <RoomScene type={t} active={inView} />
                  </Suspense>
                </SceneBoundary>
              ) : (
                <RoomArt type={t} />
              )}
              {!t.image_url && webgl && <span className="drag-hint">Drag to explore ↔</span>}
            </div>
            <div className="room-info glass" key={t.id}>
              <h3>{t.name}</h3>
              <p className="room-tagline">{t.tagline}</p>
              <p>{t.description}</p>
              <ul className="room-facts">
                <li>
                  <Icon name="users" size={18} /> Up to {t.max_guests} guests
                </li>
                {t.beds && (
                  <li>
                    <Icon name="bed" size={18} /> {t.beds}
                  </li>
                )}
                {t.size_sqft && (
                  <li>
                    <Icon name="ruler" size={18} /> {t.size_sqft} sq ft
                  </li>
                )}
              </ul>
              <ul className="chips">
                {t.amenities.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <div className="room-buy">
                <div>
                  <span className="price">{money(t.price)}</span>
                  <span className="muted"> / night</span>
                </div>
                <button className="btn btn-gold" onClick={() => onBook({ room_type_id: t.id, stay: {} })}>
                  Book this room <Icon name="arrow" size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function RoomArt({ type }) {
  return (
    <div className="room-art" style={{ '--accent': type.accent }}>
      <span>{type.name}</span>
    </div>
  );
}

function Amenities() {
  return (
    <section id="amenities" className="section">
      <div className="wrap">
        <header className="section-head" data-reveal>
          <span className="eyebrow">Amenities</span>
          <h2>
            The little things, <em>done right</em>
          </h2>
        </header>
        <div className="amenity-grid">
          {AMENITIES.map((a, i) => (
            <Tilt key={a.title} className="amenity glass" data-reveal style={{ '--delay': `${(i % 4) * 0.07}s` }}>
              <div className="amenity-icon">
                <Icon name={a.icon} size={26} />
              </div>
              <h3>{a.title}</h3>
              <p>{a.text}</p>
            </Tilt>
          ))}
        </div>
      </div>
    </section>
  );
}

function Location({ info }) {
  const s = info?.settings;
  const mapSrc = s ? `https://www.google.com/maps?q=${encodeURIComponent(s.map_query || s.address)}&output=embed` : null;
  const mapLink = s ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.map_query || s.address)}` : '#';
  const wa = s?.whatsapp?.replace(/\D/g, '');
  return (
    <section id="location" className="section">
      <div className="wrap">
        <header className="section-head" data-reveal>
          <span className="eyebrow">Find us</span>
          <h2>
            Right in the <em>middle</em> of it all
          </h2>
        </header>
        <div className="location" data-reveal>
          <div className="map glass">
            {mapSrc && <iframe title="Map" src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />}
          </div>
          <div className="contact glass">
            <ul className="contact-list">
              <li>
                <Icon name="pin" />
                <div>
                  <b>Address</b>
                  <span>{s?.address}</span>
                  <a href={mapLink} target="_blank" rel="noreferrer" className="small-link">
                    Get directions <Icon name="external" size={14} />
                  </a>
                </div>
              </li>
              <li>
                <Icon name="phone" />
                <div>
                  <b>Call the front desk</b>
                  <a href={`tel:${s?.phone?.replace(/\s/g, '')}`}>{s?.phone}</a>
                </div>
              </li>
              {wa && (
                <li>
                  <Icon name="whatsapp" />
                  <div>
                    <b>WhatsApp</b>
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                      {s.whatsapp}
                    </a>
                  </div>
                </li>
              )}
              {s?.email && (
                <li>
                  <Icon name="mail" />
                  <div>
                    <b>Email</b>
                    <a href={`mailto:${s.email}`}>{s.email}</a>
                  </div>
                </li>
              )}
              <li>
                <Icon name="clock" />
                <div>
                  <b>Check-in / Check-out</b>
                  <span>
                    {time12(s?.check_in_time)} / {time12(s?.check_out_time)}
                  </span>
                </div>
              </li>
            </ul>
            <div className="nearby">
              <b>Nearby</b>
              <ul>
                {NEARBY.map((n) => (
                  <li key={n.place}>
                    <span>{n.place}</span>
                    <span className="dots" />
                    <span className="muted">{n.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ info, onFind }) {
  const s = info?.settings;
  return (
    <footer className="footer">
      <div className="footer-giant" aria-hidden="true">
        JD RESIDENCY
      </div>
      <div className="wrap footer-row">
        <span>
          © {new Date().getFullYear()} {s?.hotel_name || 'Hotel JD Residency'}
        </span>
        <span className="footer-links">
          <button className="linkish" onClick={onFind}>
            Find my booking
          </button>
          <a href={`tel:${s?.phone?.replace(/\s/g, '')}`}>{s?.phone}</a>
          <a href="/admin">Staff login</a>
        </span>
      </div>
    </footer>
  );
}

function FindBooking({ onClose }) {
  const [ref, setRef] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const labels = {
    pending: 'Awaiting confirmation',
    confirmed: 'Confirmed',
    checked_in: 'Checked in',
    checked_out: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
  };
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal glass" role="dialog" aria-modal="true" aria-labelledby="find-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        <h3 id="find-title">Find my booking</h3>
        <form onSubmit={submit} className="find-form">
          <label className="field">
            <span>Booking reference</span>
            <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="JDXXXXXX" required autoFocus />
          </label>
          <label className="field">
            <span>Phone number</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <button className="btn btn-gold" disabled={busy}>
            <Icon name="search" size={18} /> {busy ? 'Searching…' : 'Find'}
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
        {result && (
          <div className="find-result">
            <span className={`status-pill s-${result.status}`}>{labels[result.status]}</span>
            <h4>{result.room_type_name}</h4>
            <p>
              {fmtDate(result.check_in)} → {fmtDate(result.check_out)} · {result.adults + result.children} guest(s)
            </p>
            <p className="total">{money(result.total_amount)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
