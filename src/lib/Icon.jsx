const PATHS = {
  wifi: 'M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01',
  snow: 'M12 2v20M4.9 6l14.2 12M4.9 18 19.1 6M9 3l3 3 3-3M9 21l3-3 3 3',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4M12 3v2',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z',
  car: 'M5 16V11l2-5h10l2 5v5M3 16h18v3h-3v-1H6v1H3zM7.5 13h.01M16.5 13h.01',
  phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  bed: 'M3 18V6M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-7v1M7 11a2 2 0 1 0 0-.01',
  ruler: 'M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  check: 'M4 12.5 9 17.5 20 6.5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  x: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  home: 'M3 11 12 4l9 7v9h-6v-6H9v6H3z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  door: 'M5 21V3h11v18M16 5h3v16M12 12h.01M3 21h18',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  external: 'M14 4h6v6M20 4 10 14M18 14v6H4V6h6',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  key: 'M15 8a5 5 0 1 0-4.6 7L8 17.5V20h3v-2h2v-2l1.4-1.4A5 5 0 0 0 15 8zM16 7h.01',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  whatsapp: 'M4 20l1.3-4A8 8 0 1 1 8.4 19zM9 9.5c.3 2 2.3 4.3 4.6 5l1.4-1.3-1.8-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-1.8z',
};

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.7 }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || ''} />
    </svg>
  );
}
