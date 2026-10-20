import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import Icon from '../lib/Icon.jsx';
import Home from './Home.jsx';
import BookPage from './BookPage.jsx';
import FindBooking from './FindBooking.jsx';
import './site.css';

const InfoCtx = createContext(null);
export const useInfo = () => useContext(InfoCtx);

export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
export const waHref = (num, text = '') => {
  const d = String(num || '').replace(/\D/g, '');
  if (!d) return null;
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

/** True when guests pay the full amount online when they book (Razorpay switched on in admin). */
export const usePayOnline = () => !!useInfo()?.info?.payments?.online;

/** Default photos shipped with the site are 3D renders, not real photos of the hotel. */
export const isRepresentative = (url) => !url || url.startsWith('/images/');

export default function PublicApp() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const { pathname, hash } = useLocation();

  useEffect(() => {
    api('/public/info')
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (info) document.title = pathname.startsWith('/book') ? `Book your stay · ${info.settings.hotel_name}` : info.settings.hotel_name;
  }, [info, pathname]);

  // Scroll to top on page change, or to the #section in the link.
  useEffect(() => {
    if (hash) {
      requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' }));
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return (
    <InfoCtx.Provider value={{ info, error, openFind: () => setFindOpen(true) }}>
      <div className="site">
        <Header />
        {error && !info && (
          <p className="load-error" role="alert">
            We couldn't load room information. Please refresh the page, or call us to book.
          </p>
        )}
        <Routes>
          <Route path="book" element={<BookPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
        <Footer />
        <ContactFab />
        {findOpen && <FindBooking onClose={() => setFindOpen(false)} />}
      </div>
    </InfoCtx.Provider>
  );
}

/** Link to a section of the home page that also scrolls when the URL is already the same. */
export function SectionLink({ id, children, className }) {
  return (
    <Link
      to={`/#${id}`}
      className={className}
      onClick={() => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }))}
    >
      {children}
    </Link>
  );
}

function Header() {
  const { info, openFind } = useInfo();
  const online = usePayOnline();
  const [open, setOpen] = useState(false);
  const s = info?.settings;
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <div className="topbar">
        <div className="wrap topbar-row">
          <span>
            <Icon name="wallet" size={15} /> {online ? 'Book direct: best price, secure online payment' : 'Book direct: no prepayment, pay at the hotel'}
          </span>
          {s?.phone && (
            <a href={telHref(s.phone)}>
              <Icon name="phone" size={15} /> {s.phone}
            </a>
          )}
        </div>
      </div>
      <header className="header">
        <div className="wrap header-row">
          <Link to="/" className="logo" aria-label={s?.hotel_name || 'Hotel JD Residency'}>
            <span className="logo-mark">JD</span>
            <span className="logo-text">
              <b>JD Residency</b>
              <small>Hotel</small>
            </span>
          </Link>
          <nav className={`nav ${open ? 'is-open' : ''}`} aria-label="Main" onClick={() => setOpen(false)}>
            <SectionLink id="rooms">Rooms</SectionLink>
            <SectionLink id="amenities">Amenities</SectionLink>
            <SectionLink id="rules">House rules</SectionLink>
            <SectionLink id="location">Location</SectionLink>
            <SectionLink id="faq">FAQ</SectionLink>
            <button className="nav-link-btn" onClick={() => { setOpen(false); openFind(); }}>
              Manage booking
            </button>
          </nav>
          <div className="header-cta">
            {s?.phone && (
              <a className="btn btn-ghost btn-call" href={telHref(s.phone)}>
                <Icon name="phone" size={17} /> <span>Call</span>
              </a>
            )}
            <Link className="btn btn-primary" to="/book">
              Book now
            </Link>
            <button className="menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <Icon name={open ? 'x' : 'menu'} size={24} />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

function Footer() {
  const { info, openFind } = useInfo();
  const s = info?.settings;
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div>
          <div className="logo logo-light">
            <span className="logo-mark">JD</span>
            <span className="logo-text">
              <b>JD Residency</b>
              <small>Hotel</small>
            </span>
          </div>
          <p className="footer-about">{s?.tagline}</p>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            {s?.phone && (
              <li>
                <a href={telHref(s.phone)}>{s.phone}</a>
              </li>
            )}
            {s?.email && (
              <li>
                <a href={`mailto:${s.email}`}>{s.email}</a>
              </li>
            )}
            <li>{s?.address}</li>
          </ul>
        </div>
        <div>
          <h4>Your stay</h4>
          <ul>
            <li>
              <Link to="/book">Book a room</Link>
            </li>
            <li>
              <button className="linkish" onClick={openFind}>
                Find my booking
              </button>
            </li>
            <li>
              <SectionLink id="rules">House rules</SectionLink>
            </li>
            <li>
              <SectionLink id="faq">Questions &amp; policies</SectionLink>
            </li>
          </ul>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>
          © {new Date().getFullYear()} {s?.hotel_name || 'Hotel JD Residency'}
        </span>
        <a href="/admin">Staff login</a>
      </div>
    </footer>
  );
}

function ContactFab() {
  const { info } = useInfo();
  const s = info?.settings;
  const wa = waHref(s?.whatsapp, 'Hi, I would like to book a room at JD Residency.');
  if (!s) return null;
  return wa ? (
    <a className="fab fab-wa" href={wa} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp">
      <Icon name="whatsapp" size={26} />
    </a>
  ) : (
    <a className="fab" href={telHref(s.phone)} aria-label="Call the hotel">
      <Icon name="phone" size={24} />
    </a>
  );
}
