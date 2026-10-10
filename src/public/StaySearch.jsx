import { useEffect, useRef, useState } from 'react';
import { addDays, fmtDate, isoDate, nights } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { useInfo } from './PublicApp.jsx';

/** The hotel's current date (from the server), falling back to the visitor's own. */
export function useToday() {
  return useInfo()?.info?.today || isoDate();
}

export function stayFromParams(params, today = isoDate()) {
  let checkIn = params.get('check_in') || today;
  if (checkIn < today) checkIn = today;
  let checkOut = params.get('check_out') || addDays(checkIn, 1);
  if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);
  const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number.parseInt(v, 10) || d));
  return {
    check_in: checkIn,
    check_out: checkOut,
    adults: clamp(params.get('adults'), 1, 6, 2),
    children: clamp(params.get('children'), 0, 4, 0),
  };
}

export function stayToParams(stay, extra = {}) {
  const p = new URLSearchParams({
    check_in: stay.check_in,
    check_out: stay.check_out,
    adults: String(stay.adults),
    children: String(stay.children),
  });
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
}

function Stepper({ label, hint, value, min, max, onChange }) {
  return (
    <div className="stepper">
      <div>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
      <div className="stepper-ctl">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Icon name="minus" size={16} />
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  );
}

export function guestsLabel(s) {
  const a = `${s.adults} adult${s.adults > 1 ? 's' : ''}`;
  return s.children ? `${a}, ${s.children} child${s.children > 1 ? 'ren' : ''}` : a;
}

export function GuestPicker({ stay, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="field guest-field" ref={ref}>
      <span className="field-label">Guests</span>
      <button type="button" className="field-box" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="users" size={18} />
        <span>{guestsLabel(stay)}</span>
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Choose guests">
          <Stepper label="Adults" value={stay.adults} min={1} max={6} onChange={(v) => onChange({ ...stay, adults: v })} />
          <Stepper label="Children" hint="Age 0–12" value={stay.children} min={0} max={4} onChange={(v) => onChange({ ...stay, children: v })} />
          <button type="button" className="btn btn-primary btn-block" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export function DateFields({ stay, onChange }) {
  const today = useToday();
  const n = nights(stay.check_in, stay.check_out);
  return (
    <>
      <label className="field">
        <span className="field-label">Check-in</span>
        <span className="field-box date-box">
          <Icon name="calendar" size={18} />
          <input
            type="date"
            min={today}
            value={stay.check_in}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              onChange({ ...stay, check_in: v, check_out: stay.check_out <= v ? addDays(v, 1) : stay.check_out });
            }}
            required
          />
        </span>
        <small className="field-hint">{fmtDate(stay.check_in, { weekday: 'long' })}</small>
      </label>
      <label className="field">
        <span className="field-label">Check-out</span>
        <span className="field-box date-box">
          <Icon name="calendar" size={18} />
          <input
            type="date"
            min={addDays(stay.check_in, 1)}
            value={stay.check_out}
            onChange={(e) => e.target.value && onChange({ ...stay, check_out: e.target.value })}
            required
          />
        </span>
        <small className="field-hint">
          {fmtDate(stay.check_out, { weekday: 'long' })} · {n} night{n === 1 ? '' : 's'}
        </small>
      </label>
    </>
  );
}
