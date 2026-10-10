import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { SceneBoundary, hasWebGL, useEscape } from './effects.jsx';
import { RoomImage } from './Home.jsx';

const RoomScene = lazy(() => import('../three/RoomScene.jsx'));

export default function RoomDetails({ type, onClose }) {
  const webgl = useMemo(hasWebGL, []);
  const [view, setView] = useState('photo');
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-room" role="dialog" aria-modal="true" aria-labelledby="room-title" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        <div className="room-media">
          {view === '3d' && webgl ? (
            <div className="room-3d">
              <SceneBoundary fallback={<RoomImage type={type} />}>
                <Suspense fallback={<div className="room-3d-loading">Loading 3D view…</div>}>
                  <RoomScene type={type} />
                </Suspense>
              </SceneBoundary>
              <span className="drag-hint">Drag to look around</span>
            </div>
          ) : (
            <RoomImage type={type} />
          )}
          {webgl && (
            <div className="media-switch" role="tablist" aria-label="Room view">
              <button role="tab" aria-selected={view === 'photo'} onClick={() => setView('photo')}>
                <Icon name="image" size={16} /> Photo
              </button>
              <button role="tab" aria-selected={view === '3d'} onClick={() => setView('3d')}>
                <Icon name="cube" size={16} /> 3D view
              </button>
            </div>
          )}
        </div>
        <div className="room-detail-body">
          <h2 id="room-title">{type.name}</h2>
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
          <p>{type.description}</p>
          <h3>In this room</h3>
          <ul className="amenity-list">
            {type.amenities.map((a) => (
              <li key={a}>
                <Icon name="check" size={16} strokeWidth={2.2} /> {a}
              </li>
            ))}
          </ul>
          <div className="room-card-foot">
            <div className="price">
              <b>{money(type.price)}</b>
              <span> / night</span>
              <small>No prepayment · Pay at hotel</small>
            </div>
            <Link className="btn btn-primary btn-lg" to={`/book?room=${type.id}`}>
              Book this room
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
