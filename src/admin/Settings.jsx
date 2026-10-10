import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAdmin } from './AdminApp.jsx';

const FIELDS = [
  ['hotel_name', 'Hotel name'],
  ['tagline', 'Tagline (shown under the big title)'],
  ['phone', 'Front desk phone'],
  ['whatsapp', 'WhatsApp number (optional)'],
  ['email', 'Email'],
  ['address', 'Address', 'wide'],
  ['map_query', 'Google Maps search text (what the map pin should find)', 'wide'],
  ['check_in_time', 'Check-in time', 'time'],
  ['check_out_time', 'Check-out time', 'time'],
  ['booking_note', 'Note shown when guests book', 'wide'],
];

export default function Settings() {
  const { notify, setAdmin } = useAdmin();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    api('/admin/settings')
      .then((d) => setS(d.settings))
      .catch((e) => setError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/admin/settings', { method: 'PUT', body: s });
      setS(d.settings);
      notify('Hotel details saved. The website shows them right away.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwError('');
    if (pw.new_password !== pw.confirm) return setPwError('New passwords do not match.');
    try {
      const d = await api('/admin/change-password', { method: 'POST', body: pw });
      setAdmin(d.admin);
      setPw({ current_password: '', new_password: '', confirm: '' });
      notify('Password changed');
    } catch (err) {
      setPwError(err.message);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">These details appear on the public website.</p>
        </div>
      </header>

      <section className="card">
        <h2 className="card-title">Hotel details</h2>
        {!s ? (
          <p className="muted">{error || 'Loading…'}</p>
        ) : (
          <form className="aform" onSubmit={save}>
            <div className="aform-grid">
              {FIELDS.map(([k, label, kind]) => (
                <label key={k} className={`afield ${kind === 'wide' ? 'span-2' : ''}`}>
                  <span>{label}</span>
                  <input type={kind === 'time' ? 'time' : 'text'} value={s[k] || ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
                </label>
              ))}
            </div>
            {error && <p className="aerror">{error}</p>}
            <div className="aform-foot">
              <button className="abtn abtn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="card narrow">
        <h2 className="card-title">Change password</h2>
        <form className="aform" onSubmit={changePassword}>
          <label className="afield">
            <span>Current password</span>
            <input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required />
          </label>
          <label className="afield">
            <span>New password (8+ characters)</span>
            <input type="password" autoComplete="new-password" minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required />
          </label>
          <label className="afield">
            <span>Repeat new password</span>
            <input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
          </label>
          {pwError && <p className="aerror">{pwError}</p>}
          <div className="aform-foot">
            <button className="abtn abtn-primary">Update password</button>
          </div>
        </form>
      </section>
    </div>
  );
}
