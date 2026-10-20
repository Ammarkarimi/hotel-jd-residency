import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from '../lib/Icon.jsx';
import { useAdmin } from './AdminApp.jsx';
import PhotoField from './PhotoField.jsx';
import PaymentSettings from './PaymentSettings.jsx';
import WhatsAppSettings from './WhatsAppSettings.jsx';
import { uploadPhoto } from './photos.js';

const FIELDS = [
  ['hotel_name', 'Hotel name'],
  ['tagline', 'Tagline (shown under the big title)'],
  ['phone', 'Front desk phone'],
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
      // Only this form's fields: photos and WhatsApp are saved by their own sections.
      const body = Object.fromEntries(FIELDS.map(([k]) => [k, s[k]]));
      const d = await api('/admin/settings', { method: 'PUT', body });
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

      <PaymentSettings />
      <WhatsAppSettings />

      {s && <WebsitePhotos settings={s} onSaved={setS} />}

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

function parseList(json) {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function WebsitePhotos({ settings, onSaved }) {
  const { notify } = useAdmin();
  const gallery = parseList(settings.gallery);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(patch, message) {
    setError('');
    try {
      const d = await api('/admin/settings', { method: 'PUT', body: patch });
      onSaved(d.settings);
      notify(message);
    } catch (err) {
      setError(err.message);
    }
  }

  async function addPhotos(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadPhoto(f));
      await save({ gallery: [...gallery, ...urls] }, `${urls.length} photo${urls.length > 1 ? 's' : ''} added`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const move = (i, d) => {
    const next = [...gallery];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    save({ gallery: next }, 'Gallery order saved');
  };

  return (
    <section className="card">
      <h2 className="card-title">Website photos</h2>
      <p className="muted small">
        Real photos help guests decide. Until you add your own, the website shows 3D illustrations marked
        &ldquo;Representative image&rdquo;.
      </p>
      <PhotoField
        label="Main banner photo (top of the homepage)"
        hint="A wide photo of the building, reception or your best room works well."
        value={settings.hero_image}
        fallback="/images/hero.jpg"
        onChange={(url) => save({ hero_image: url }, url ? 'Banner photo updated' : 'Banner photo removed')}
      />
      <div className="afield gallery-field">
        <span>Gallery ({gallery.length})</span>
        <p className="muted small">The first photo also appears in the &ldquo;About us&rdquo; section. The gallery shows once you add 2 or more photos.</p>
        <div className="gallery-admin">
          {gallery.map((src, i) => (
            <figure key={src}>
              <img src={src} alt={`Gallery photo ${i + 1}`} />
              <figcaption>
                <button type="button" className="icon-btn" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>
                  <Icon name="chevronLeft" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove photo"
                  onClick={() => save({ gallery: gallery.filter((g) => g !== src) }, 'Photo removed')}
                >
                  <Icon name="trash" size={16} />
                </button>
                <button type="button" className="icon-btn" aria-label="Move later" disabled={i === gallery.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="chevronRight" size={16} />
                </button>
              </figcaption>
            </figure>
          ))}
          <label className={`gallery-add ${busy ? 'is-busy' : ''}`}>
            <Icon name="plus" size={22} />
            <span>{busy ? 'Uploading…' : 'Add photos'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addPhotos} disabled={busy} />
          </label>
        </div>
      </div>
      {error && <p className="aerror">{error}</p>}
    </section>
  );
}
