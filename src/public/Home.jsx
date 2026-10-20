import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays, money, time12 } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { ABOUT, AMENITIES, FAQ, KEY_RULES, MUST_READ, NEARBY, PAY_ONLINE_PERK, PERKS, RULES } from './content.js';
import { isRepresentative, telHref, useInfo, usePayOnline, waHref } from './PublicApp.jsx';
import RoomDetails from './RoomDetails.jsx';
import { DateFields, GuestPicker, stayToParams, useToday } from './StaySearch.jsx';

export default function Home() {
  const { info } = useInfo();
  const online = usePayOnline();
  const [details, setDetails] = useState(null);
  const s = info?.settings;
  const types = info?.room_types || [];
  const from = types.length ? Math.min(...types.map((t) => t.price)) : null;
  const gallery = parseList(s?.gallery);

  return (
    <main>
      <Hero info={info} from={from} />
      <Perks />

      <section id="rooms" className="section">
        <div className="wrap">
          <SectionHead eyebrow="Rooms" title="Choose your room" text="Every room has air conditioning, free Wi-Fi, a private bathroom and fresh linen daily." />
          <div className="room-grid">
            {!info
              ? [0, 1, 2].map((i) => <div key={i} className="room-card skeleton" />)
              : types.map((t) => <RoomCard key={t.id} type={t} onDetails={() => setDetails(t)} />)}
          </div>
        </div>
      </section>

      <section className="section section-sand">
        <div className="wrap about">
          <div className="about-text">
            <span className="eyebrow">About us</span>
            <h2>{ABOUT.title}</h2>
            {ABOUT.text.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <ul className="checklist">
              {ABOUT.points.map((p) => (
                <li key={p}>
                  <Icon name="check" size={18} strokeWidth={2.2} /> {p}
                </li>
              ))}
            </ul>
          </div>
          <figure className="about-img">
            <img src={gallery[0] || types[1]?.image_url || '/images/rooms/executive.jpg'} alt="Inside a room at JD Residency" loading="lazy" />
            {!gallery[0] && <figcaption className="rep-tag">Representative image</figcaption>}
          </figure>
        </div>
      </section>

      <section id="amenities" className="section">
        <div className="wrap">
          <SectionHead eyebrow="Amenities" title="Everything you need for a good stay" text="Comfort, cleanliness and safety, taken care of from the moment you arrive." />
          <ul className="amenity-grid">
            {AMENITIES.map((a) => (
              <li key={a.title} className="amenity">
                <span className="amenity-icon">
                  <Icon name={a.icon} size={24} />
                </span>
                <span className="amenity-text">
                  <b>
                    {a.title}
                    {a.paid && <em className="paid-tag">Paid</em>}
                  </b>
                  <small>{a.text}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <HouseRules s={s} />

      {gallery.length > 1 && (
        <section className="section">
          <div className="wrap">
            <SectionHead eyebrow="Gallery" title="Take a look around" />
            <div className="gallery">
              {gallery.slice(0, 9).map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className={i === 0 ? 'g-big' : ''}>
                  <img src={src} alt={`Hotel photo ${i + 1}`} loading="lazy" />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Sections alternate white and sand; the gallery only shows once photos are added. */}
      <Location s={s} sand={gallery.length > 1} />
      <Faq s={s} sand={gallery.length <= 1} />

      <section className="cta-band">
        <div className="wrap cta-row">
          <div>
            <h2>Ready to book your stay?</h2>
            <p>{online ? 'It takes less than a minute. Pay securely with UPI, card or netbanking.' : 'It takes less than a minute. No payment needed now.'}</p>
          </div>
          <div className="cta-actions">
            <Link to="/book" className="btn btn-gold btn-lg">
              Check availability
            </Link>
            {s?.phone && (
              <a href={telHref(s.phone)} className="btn btn-outline-light btn-lg">
                <Icon name="phone" size={18} /> Call {s.phone}
              </a>
            )}
          </div>
        </div>
      </section>

      {from !== null && (
        <div className="mobile-bar">
          <div>
            <small>Rooms from</small>
            <b>
              {money(from)} <small>/ night</small>
            </b>
          </div>
          <Link to="/book" className="btn btn-primary">
            Book now
          </Link>
        </div>
      )}

      {details && <RoomDetails type={details} onClose={() => setDetails(null)} />}
    </main>
  );
}

export function parseList(json) {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function SectionHead({ eyebrow, title, text }) {
  return (
    <header className="section-head">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </header>
  );
}

function Hero({ info, from }) {
  const navigate = useNavigate();
  const online = usePayOnline();
  const today = useToday();
  const [stay, setStay] = useState({ check_in: today, check_out: addDays(today, 1), adults: 2, children: 0 });
  // Once the hotel's date is known, move a check-in that is now in the past.
  useEffect(() => {
    setStay((s) => (s.check_in < today ? { ...s, check_in: today, check_out: s.check_out <= today ? addDays(today, 1) : s.check_out } : s));
  }, [today]);
  const s = info?.settings;
  const area = s?.address?.split(',').slice(-2).join(',').replace(/\d{6}/, '').trim();
  const heroImg = s?.hero_image || '/images/hero.jpg';
  return (
    <section className="hero">
      <div className="hero-media">
        <img src={heroImg} alt="" />
        {isRepresentative(s?.hero_image) && <span className="rep-tag">Representative image</span>}
      </div>
      <div className="wrap hero-inner">
        <div className="hero-copy">
          {area && (
            <p className="hero-loc">
              <Icon name="pin" size={16} /> {area}
            </p>
          )}
          <h1>{s?.hotel_name || 'Hotel JD Residency'}</h1>
          <p className="hero-sub">{s?.tagline || 'Comfortable, clean rooms in the heart of the city.'} {online ? 'Book direct; full payment at the time of booking.' : 'Book direct and pay at the hotel.'}</p>
        </div>

        <form
          className="search-card"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/book?${stayToParams(stay)}`);
          }}
        >
          <h2 className="search-title">Check availability</h2>
          <div className="search-fields">
            <DateFields stay={stay} onChange={setStay} />
            <GuestPicker stay={stay} onChange={setStay} />
            <button className="btn btn-primary btn-lg search-btn">
              <Icon name="search" size={18} /> Search rooms
            </button>
          </div>
          {from !== null && (
            <p className="search-note">
              <Icon name="check" size={16} strokeWidth={2.2} />
              <span>
                Rooms from <b>{money(from)}</b>/night · {online ? 'Full payment at the time of booking' : 'No prepayment · Pay at hotel'}
              </span>
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function Perks() {
  const online = usePayOnline();
  const perks = online ? [PAY_ONLINE_PERK, ...PERKS.slice(1)] : PERKS;
  return (
    <section className="perks" aria-label="Why book with us">
      <ul className="wrap perk-row">
        {perks.map((p) => (
          <li key={p.title}>
            <span className="perk-icon">
              <Icon name={p.icon} size={22} />
            </span>
            <div>
              <b>{p.title}</b>
              <small>{p.text}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoomImage({ type, className = '' }) {
  if (!type.image_url) {
    return (
      <div className={`room-img room-img-empty ${className}`}>
        <Icon name="bed" size={40} />
      </div>
    );
  }
  return (
    <div className={`room-img ${className}`}>
      <img src={type.image_url} alt={type.name} loading="lazy" />
      {isRepresentative(type.image_url) && <span className="rep-tag">3D illustration</span>}
    </div>
  );
}

function RoomCard({ type, onDetails }) {
  const online = usePayOnline();
  return (
    <article className="room-card">
      <button className="room-card-img" onClick={onDetails} aria-label={`View details of ${type.name}`}>
        <RoomImage type={type} />
      </button>
      <div className="room-card-body">
        <h3>{type.name}</h3>
        {type.tagline && <p className="muted">{type.tagline}</p>}
        <ul className="room-facts">
          <li>
            <Icon name="users" size={17} /> Up to {type.max_guests} guests
          </li>
          {type.beds && (
            <li>
              <Icon name="bed" size={17} /> {type.beds}
            </li>
          )}
          {type.size_sqft && (
            <li>
              <Icon name="ruler" size={17} /> {type.size_sqft} sq ft
            </li>
          )}
        </ul>
        <ul className="tags">
          {type.amenities.slice(0, 4).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <div className="room-card-foot">
          <div className="price">
            <b>{money(type.price)}</b>
            <span> / night</span>
            <small>{online ? 'Full payment at booking' : 'Pay at hotel'}</small>
          </div>
          <div className="room-card-actions">
            <button className="btn btn-ghost" onClick={onDetails}>
              Details
            </button>
            <Link className="btn btn-primary" to={`/book?room=${type.id}`}>
              Book now
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function Location({ s, sand }) {
  const query = s ? s.map_query || s.address : '';
  const wa = waHref(s?.whatsapp);
  return (
    <section id="location" className={`section ${sand ? 'section-sand' : ''}`}>
      <div className="wrap">
        <SectionHead eyebrow="Location" title="How to find us" />
        <div className="location">
          <div className="map">
            {s && (
              <iframe
                title="Map showing the hotel"
                src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            )}
          </div>
          <div className="contact-card">
            <h3>Hotel JD Residency</h3>
            <p className="address">
              <Icon name="pin" size={18} /> <span>{s?.address}</span>
            </p>
            <div className="contact-actions">
              <a className="btn btn-primary" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">
                <Icon name="pin" size={17} /> Get directions
              </a>
              {s?.phone && (
                <a className="btn btn-ghost" href={telHref(s.phone)}>
                  <Icon name="phone" size={17} /> Call
                </a>
              )}
              {wa && (
                <a className="btn btn-ghost" href={wa} target="_blank" rel="noreferrer">
                  <Icon name="whatsapp" size={17} /> WhatsApp
                </a>
              )}
            </div>
            <dl className="times">
              <div>
                <dt>Check-in</dt>
                <dd>from {time12(s?.check_in_time)}</dd>
              </div>
              <div>
                <dt>Check-out</dt>
                <dd>until {time12(s?.check_out_time)}</dd>
              </div>
            </dl>
            <h4>Nearby</h4>
            <ul className="nearby">
              {NEARBY.map((n) => (
                <li key={n.place}>
                  <span>{n.place}</span>
                  <span className="muted">{n.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const RULE_ICON = { no: 'ban', yes: 'check', info: 'info', fee: 'rupee' };
const RULE_LABEL = { no: 'Not allowed', yes: 'Allowed', info: 'Note', fee: 'Extra charge' };

/** Puts the hotel's check-in and check-out times (from the admin panel) into website text. */
export const fillTimes = (text, s) =>
  text.replaceAll('{checkIn}', time12(s?.check_in_time) || '9:00 AM').replaceAll('{checkOut}', time12(s?.check_out_time) || '11:00 AM');

function RuleItem({ kind, text, strong, s }) {
  return (
    <li className={`rule rule-${kind} ${strong ? 'rule-strong' : ''}`}>
      <span className="rule-mark" role="img" aria-label={RULE_LABEL[kind]}>
        <Icon name={RULE_ICON[kind]} size={16} strokeWidth={2.2} />
      </span>
      <span>{fillTimes(text, s)}</span>
    </li>
  );
}

/** The rules shown in red: on the home page and on the booking form. */
export function KeyRules({ compact = false }) {
  return (
    <ul className={`key-rules ${compact ? 'key-rules-compact' : ''}`} role="note" aria-label="Important rules">
      {KEY_RULES.map((r) => (
        <li key={r.title} className="key-rule">
          <span className="key-rule-icon">
            <Icon name="ban" size={compact ? 18 : 26} strokeWidth={2.2} />
          </span>
          <div>
            <b>{r.title}</b>
            {!compact && <p>{r.text}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function HouseRules({ s }) {
  const [showAll, setShowAll] = useState(false);
  return (
    <section id="rules" className="section section-sand">
      <div className="wrap">
        <SectionHead eyebrow="House rules" title="Please read before you book" text="These rules help us keep JD Residency safe, quiet and comfortable for every guest." />

        <KeyRules />

        <div className="must-read">
          <h3>
            <Icon name="alert" size={20} /> Must-read rules
          </h3>
          <ul className="rule-list">
            {MUST_READ.map((r) => (
              <RuleItem key={r.text} {...r} s={s} />
            ))}
          </ul>
        </div>

        <div className={`rule-grid ${showAll ? 'is-all' : ''}`}>
          {RULES.map((g) => (
            <article key={g.title} className="rule-card">
              <h3>
                <span className="rule-card-icon">
                  <Icon name={g.icon} size={20} />
                </span>
                {g.title}
              </h3>
              <ul className="rule-list">
                {g.items.map((r) => (
                  <RuleItem key={r.text} {...r} s={s} />
                ))}
              </ul>
            </article>
          ))}
        </div>
        {!showAll && (
          <button className="btn btn-ghost btn-block rules-more" onClick={() => setShowAll(true)}>
            Show all house rules <Icon name="plus" size={18} />
          </button>
        )}
      </div>
    </section>
  );
}

function Faq({ s, sand }) {
  const online = usePayOnline();
  const fill = (t) => fillTimes(t, s);
  return (
    <section id="faq" className={`section ${sand ? 'section-sand' : ''}`}>
      <div className="wrap">
        <SectionHead eyebrow="Good to know" title="Questions & policies" />
        <div className="faq">
          {FAQ.map((f, i) => (
            <details key={f.q} open={i === 0}>
              <summary>
                {f.q}
                <Icon name="plus" size={18} />
              </summary>
              <p>{fill((online && f.aOnline) || f.a)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
