import { Link } from 'react-router-dom';
import { money } from '../lib/format.js';
import Icon from '../lib/Icon.jsx';
import { useEscape } from './effects.jsx';
import { RoomImage } from './Home.jsx';
import { usePayOnline } from './PublicApp.jsx';

export default function RoomDetails({ type, onClose }) {
  const online = usePayOnline();
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-room" role="dialog" aria-modal="true" aria-labelledby="room-title" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        <div className="room-media">
          <RoomImage type={type} />
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
              <small>{online ? 'Full payment at the time of booking' : 'No prepayment · Pay at hotel'}</small>
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
