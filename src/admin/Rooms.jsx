import { useState } from 'react';
import { api } from '../lib/api.js';
import { fmtDate, money } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { Modal, useAdmin } from './AdminApp.jsx';
import PhotoField from './PhotoField.jsx';

export default function Rooms() {
  const { roomTypes, rooms, reloadInventory, notify, openBooking } = useAdmin();
  const [editType, setEditType] = useState(null);
  const [editRoom, setEditRoom] = useState(null);

  async function act(promise, message) {
    try {
      await promise;
      notify(message);
      await reloadInventory();
    } catch (e) {
      notify(e.message, 'err');
    }
  }

  const toggleMaintenance = (r) =>
    act(
      api(`/admin/rooms/${r.id}`, { method: 'PUT', body: { ...r, status: r.status === 'active' ? 'maintenance' : 'active' } }),
      r.status === 'active' ? `Room ${r.number} blocked for maintenance` : `Room ${r.number} back in service`,
    );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Rooms</h1>
          <p className="muted">Room types are what guests book on the website. Rooms are your physical rooms.</p>
        </div>
      </header>

      <section>
        <div className="section-bar">
          <h2>Room types &amp; prices</h2>
          <button className="abtn abtn-primary" onClick={() => setEditType({})}>
            <Icon name="plus" size={16} /> Add room type
          </button>
        </div>
        <div className="type-grid">
          {roomTypes.map((t) => (
            <article key={t.id} className={`card type-card ${t.active ? '' : 'is-off'}`} style={{ '--accent': t.accent }}>
              <div className="type-top">
                <span className="type-dot" />
                <h3>{t.name}</h3>
                {!t.active && <span className="pill">Hidden</span>}
              </div>
              <div className="type-price">
                {money(t.price)}
                <small> / night</small>
              </div>
              <p className="muted small">
                Up to {t.max_guests} guests · {t.beds || 'beds not set'} · {t.room_count} room{t.room_count === 1 ? '' : 's'}
              </p>
              <div className="type-actions">
                <button className="abtn abtn-sm" onClick={() => setEditType(t)}>
                  <Icon name="edit" size={16} /> Edit
                </button>
                <button
                  className="abtn abtn-sm"
                  onClick={() =>
                    act(
                      api(`/admin/room-types/${t.id}`, { method: 'PUT', body: { ...t, active: !t.active } }),
                      t.active ? `${t.name} hidden from website` : `${t.name} shown on website`,
                    )
                  }
                >
                  {t.active ? 'Hide from website' : 'Show on website'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="section-bar">
          <h2>All rooms ({rooms.length})</h2>
          <button className="abtn abtn-primary" onClick={() => setEditRoom({})} disabled={!roomTypes.length}>
            <Icon name="plus" size={16} /> Add room
          </button>
        </div>
        <div className="room-grid">
          {rooms.map((r) => {
            const state = r.status === 'maintenance' ? 'maint' : r.current_guest ? 'occupied' : 'free';
            return (
              <article key={r.id} className={`room-tile st-${state}`} style={{ '--accent': r.accent }}>
                <header>
                  <span className="room-no">{r.number}</span>
                  <span className={`room-state st-${state}`}>
                    {state === 'maint' ? 'Maintenance' : state === 'occupied' ? 'Occupied' : 'Vacant'}
                  </span>
                </header>
                <p className="room-type-name">{r.room_type_name}</p>
                {r.floor && <p className="muted small">Floor {r.floor}</p>}
                {r.current_guest ? (
                  <button className="linky" onClick={() => openBooking(r.current_booking_id)}>
                    {r.current_guest}
                  </button>
                ) : r.next_arrival ? (
                  <p className="muted small">Next arrival {fmtDate(r.next_arrival, { day: 'numeric', month: 'short' })}</p>
                ) : null}
                {r.notes && <p className="small room-notes">{r.notes}</p>}
                <footer>
                  <button className="icon-btn" title="Edit room" aria-label={`Edit room ${r.number}`} onClick={() => setEditRoom(r)}>
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="abtn abtn-xs" onClick={() => toggleMaintenance(r)}>
                    {r.status === 'active' ? 'Block' : 'Unblock'}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      </section>

      {editType && (
        <RoomTypeModal
          type={editType}
          onClose={() => setEditType(null)}
          onSaved={async (msg) => {
            setEditType(null);
            notify(msg);
            await reloadInventory();
          }}
        />
      )}
      {editRoom && (
        <RoomModal
          room={editRoom}
          types={roomTypes}
          onClose={() => setEditRoom(null)}
          onSaved={async (msg) => {
            setEditRoom(null);
            notify(msg);
            await reloadInventory();
          }}
        />
      )}
    </div>
  );
}

function RoomTypeModal({ type, onClose, onSaved }) {
  const isNew = !type.id;
  const [f, setF] = useState({
    name: type.name || '',
    tagline: type.tagline || '',
    description: type.description || '',
    price: type.price ?? '',
    max_guests: type.max_guests ?? 2,
    beds: type.beds || '',
    size_sqft: type.size_sqft ?? '',
    amenities: (type.amenities || []).join(', '),
    image_url: type.image_url || '',
    accent: type.accent || '#e8b04b',
    sort_order: type.sort_order ?? 0,
    active: type.active ?? true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(isNew ? '/admin/room-types' : `/admin/room-types/${type.id}`, { method: isNew ? 'POST' : 'PUT', body: f });
      onSaved(isNew ? 'Room type added' : 'Room type saved');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${type.name}?`)) return;
    try {
      await api(`/admin/room-types/${type.id}`, { method: 'DELETE' });
      onSaved('Room type deleted');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={isNew ? 'Add room type' : `Edit ${type.name}`} onClose={onClose} wide>
      <form className="aform" onSubmit={save}>
        <div className="aform-grid">
          <label className="afield span-2">
            <span>Name</span>
            <input value={f.name} onChange={set('name')} required placeholder="Deluxe Room" />
          </label>
          <label className="afield">
            <span>Price per night (₹)</span>
            <input type="number" min="0" value={f.price} onChange={set('price')} required />
          </label>
          <label className="afield">
            <span>Max guests</span>
            <input type="number" min="1" max="12" value={f.max_guests} onChange={set('max_guests')} required />
          </label>
          <label className="afield">
            <span>Beds</span>
            <input value={f.beds} onChange={set('beds')} placeholder="1 King bed" />
          </label>
          <label className="afield">
            <span>Size (sq ft)</span>
            <input type="number" min="0" value={f.size_sqft} onChange={set('size_sqft')} />
          </label>
          <label className="afield span-2">
            <span>Tagline</span>
            <input value={f.tagline} onChange={set('tagline')} placeholder="A short catchy line" />
          </label>
          <label className="afield span-2">
            <span>Description</span>
            <textarea rows={3} value={f.description} onChange={set('description')} />
          </label>
          <label className="afield span-2">
            <span>Amenities (comma separated)</span>
            <input value={f.amenities} onChange={set('amenities')} placeholder="Air conditioning, Free Wi-Fi, Smart TV" />
          </label>
          <PhotoField
            wide
            label="Room photo"
            hint="Shown on the website. Use a bright, landscape photo of the actual room."
            value={f.image_url.startsWith('/images/') ? '' : f.image_url}
            fallback={f.image_url.startsWith('/images/') ? f.image_url : ''}
            onChange={(url) => setF({ ...f, image_url: url })}
          />
          <label className="afield">
            <span>Colour (calendar &amp; 3D view)</span>
            <input type="color" value={f.accent} onChange={set('accent')} />
          </label>
          <label className="afield">
            <span>Display order</span>
            <input type="number" value={f.sort_order} onChange={set('sort_order')} />
          </label>
          <label className="acheck span-2">
            <input type="checkbox" checked={!!f.active} onChange={set('active')} /> Show on website and allow online booking
          </label>
        </div>
        {error && <p className="aerror">{error}</p>}
        <div className="aform-foot">
          {!isNew && (
            <button type="button" className="link-danger" onClick={remove}>
              <Icon name="trash" size={16} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="abtn" onClick={onClose}>
            Cancel
          </button>
          <button className="abtn abtn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RoomModal({ room, types, onClose, onSaved }) {
  const isNew = !room.id;
  const [f, setF] = useState({
    number: room.number || '',
    room_type_id: room.room_type_id || types[0]?.id,
    floor: room.floor || '',
    status: room.status || 'active',
    notes: room.notes || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(isNew ? '/admin/rooms' : `/admin/rooms/${room.id}`, { method: isNew ? 'POST' : 'PUT', body: f });
      onSaved(isNew ? `Room ${f.number} added` : `Room ${f.number} saved`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete room ${room.number}?`)) return;
    try {
      await api(`/admin/rooms/${room.id}`, { method: 'DELETE' });
      onSaved(`Room ${room.number} deleted`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={isNew ? 'Add room' : `Edit room ${room.number}`} onClose={onClose}>
      <form className="aform" onSubmit={save}>
        <div className="aform-grid">
          <label className="afield">
            <span>Room number</span>
            <input value={f.number} onChange={set('number')} required autoFocus={isNew} />
          </label>
          <label className="afield">
            <span>Floor</span>
            <input value={f.floor} onChange={set('floor')} />
          </label>
          <label className="afield span-2">
            <span>Room type</span>
            <select value={f.room_type_id} onChange={set('room_type_id')}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="afield span-2">
            <span>Status</span>
            <select value={f.status} onChange={set('status')}>
              <option value="active">In service</option>
              <option value="maintenance">Blocked / maintenance (not bookable)</option>
            </select>
          </label>
          <label className="afield span-2">
            <span>Notes</span>
            <input value={f.notes} onChange={set('notes')} placeholder="e.g. AC being serviced" />
          </label>
        </div>
        {error && <p className="aerror">{error}</p>}
        <div className="aform-foot">
          {!isNew && (
            <button type="button" className="link-danger" onClick={remove}>
              <Icon name="trash" size={16} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="abtn" onClick={onClose}>
            Cancel
          </button>
          <button className="abtn abtn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
