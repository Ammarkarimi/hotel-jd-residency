import { useRef, useState } from 'react';
import Icon from '../lib/Icon.jsx';
import { uploadPhoto } from './photos.js';

/** Photo preview with Upload / Remove buttons. `value` is the photo URL ('' for none). */
export default function PhotoField({ label, hint, value, onChange, fallback, wide = false }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shown = value || fallback;

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await uploadPhoto(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`afield photo-field ${wide ? 'span-2' : ''}`}>
      <span>{label}</span>
      <div className="photo-row">
        <div className="photo-thumb">
          {shown ? <img src={shown} alt="" /> : <Icon name="image" size={28} />}
          {!value && fallback && <small>Default</small>}
        </div>
        <div className="photo-actions">
          <button type="button" className="abtn abtn-sm" onClick={() => input.current?.click()} disabled={busy}>
            <Icon name="plus" size={16} /> {busy ? 'Uploading…' : value ? 'Replace photo' : 'Upload photo'}
          </button>
          {value && (
            <button type="button" className="abtn abtn-sm" onClick={() => onChange('')}>
              Remove
            </button>
          )}
          {hint && <small className="muted">{hint}</small>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      </div>
      {error && <p className="aerror">{error}</p>}
    </div>
  );
}
