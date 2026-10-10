import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from '../lib/api.js';
import Icon from '../lib/Icon.jsx';
import Dashboard from './Dashboard.jsx';
import Bookings from './Bookings.jsx';
import CalendarView from './Calendar.jsx';
import Rooms from './Rooms.jsx';
import Settings from './Settings.jsx';
import { BookingDrawer, NewBookingModal } from './BookingPanels.jsx';
import './admin.css';

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

export default function AdminApp() {
  const [admin, setAdmin] = useState(undefined);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const onLoggedOut = () =>
      setAdmin((a) => {
        if (a) setExpired(true);
        return null;
      });
    window.addEventListener('jd:logged-out', onLoggedOut);
    return () => window.removeEventListener('jd:logged-out', onLoggedOut);
  }, []);

  useEffect(() => {
    document.title = 'Admin · JD Residency';
    api('/admin/me')
      .then((d) => setAdmin(d.admin))
      .catch(() => setAdmin(null));
  }, []);

  if (admin === undefined) return <div className="adm adm-loading">Loading…</div>;
  if (!admin)
    return (
      <Login
        expired={expired}
        onLogin={(a) => {
          setExpired(false);
          setAdmin(a);
        }}
      />
    );
  return <Shell admin={admin} setAdmin={setAdmin} />;
}

function Login({ onLogin, expired }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { admin } = await api('/admin/login', { method: 'POST', body: form });
      onLogin(admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="adm adm-login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">JD</div>
        <h1>Staff login</h1>
        <p className="muted">Manage rooms and bookings for JD Residency.</p>
        {expired && <p className="banner-inline">Your session ended. Please sign in again to continue.</p>}
        <label className="afield">
          <span>Username</span>
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label className="afield">
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="aerror">{error}</p>}
        <button className="abtn abtn-primary abtn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <a href="/" className="login-back">
          ← Back to website
        </a>
      </form>
    </div>
  );
}

function Shell({ admin, setAdmin }) {
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [toast, setToast] = useState(null);
  const [openBooking, setOpenBooking] = useState(null);
  const [newBooking, setNewBooking] = useState(null);
  const [version, setVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const loadInventory = useCallback(async () => {
    const [t, r] = await Promise.all([api('/admin/room-types'), api('/admin/rooms')]);
    setRoomTypes(t.room_types);
    setRooms(r.rooms);
  }, []);

  useEffect(() => {
    loadInventory().catch(() => {});
  }, [loadInventory]);

  const notify = useCallback((message, kind = 'ok') => {
    setToast({ message, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Any change to bookings bumps `version` so open views reload.
  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    loadInventory().catch(() => {});
  }, [loadInventory]);

  async function logout() {
    await api('/admin/logout', { method: 'POST' }).catch(() => {});
    setAdmin(null);
  }

  const ctx = {
    admin,
    setAdmin,
    roomTypes,
    rooms,
    notify,
    version,
    changed,
    reloadInventory: loadInventory,
    openBooking: setOpenBooking,
    newBooking: (preset = {}) => setNewBooking(preset),
  };

  const links = [
    ['/admin', 'Dashboard', 'home', true],
    ['/admin/bookings', 'Bookings', 'list'],
    ['/admin/calendar', 'Calendar', 'calendar'],
    ['/admin/rooms', 'Rooms', 'door'],
    ['/admin/settings', 'Settings', 'settings'],
  ];

  return (
    <AdminCtx.Provider value={ctx}>
      <div className="adm adm-shell">
        <aside className={`side ${menuOpen ? 'is-open' : ''}`}>
          <div className="side-brand">
            <span className="side-mark">JD</span>
            <div>
              <b>JD Residency</b>
              <small>Front desk</small>
            </div>
          </div>
          <nav className="side-nav" onClick={() => setMenuOpen(false)}>
            {links.map(([to, label, icon, end]) => (
              <NavLink key={to} to={to} end={end}>
                <Icon name={icon} size={18} /> {label}
              </NavLink>
            ))}
          </nav>
          <button className="abtn abtn-primary side-new" onClick={() => setNewBooking({})}>
            <Icon name="plus" size={18} /> New booking
          </button>
          <div className="side-foot">
            <a href="/" target="_blank" rel="noreferrer">
              <Icon name="external" size={16} /> View website
            </a>
            <button onClick={logout}>
              <Icon name="logout" size={16} /> Log out ({admin.username})
            </button>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>
              <Icon name="menu" />
            </button>
            <span className="topbar-title">JD Residency</span>
            <button className="abtn abtn-primary abtn-sm" onClick={() => setNewBooking({})}>
              <Icon name="plus" size={16} /> Booking
            </button>
          </header>
          {admin.must_change_password && (
            <div className="banner">
              <Icon name="key" size={18} />
              <span>You are still using the default password. Please set your own password in Settings.</span>
              <NavLink to="/admin/settings" className="abtn abtn-sm">
                Change now
              </NavLink>
            </div>
          )}
          <div className="content">
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="calendar" element={<CalendarView />} />
              <Route path="rooms" element={<Rooms />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </div>
        </div>
        {menuOpen && <div className="side-scrim" onClick={() => setMenuOpen(false)} />}
        {openBooking && <BookingDrawer id={openBooking} onClose={() => setOpenBooking(null)} />}
        {newBooking && <NewBookingModal preset={newBooking} onClose={() => setNewBooking(null)} />}
        {toast && (
          <div className={`toast toast-${toast.kind}`} role="status" key={toast.id}>
            <Icon name={toast.kind === 'ok' ? 'check' : 'alert'} size={18} /> {toast.message}
          </div>
        )}
      </div>
    </AdminCtx.Provider>
  );
}

export function StatusPill({ status }) {
  const labels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    checked_in: 'Checked in',
    checked_out: 'Checked out',
    cancelled: 'Cancelled',
    no_show: 'No-show',
  };
  return <span className={`pill pill-${status}`}>{labels[status] || status}</span>;
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="amodal-backdrop" onMouseDown={onClose}>
      <div
        className={`amodal ${wide ? 'amodal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="amodal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
