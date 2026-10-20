// Website copy that isn't managed from the admin panel. Edit freely.
// Contact details, prices, rooms and photos are managed at /admin.

export const PERKS = [
  { icon: 'wallet', title: 'Pay at hotel', text: 'No advance payment' },
  { icon: 'tag', title: 'Best price direct', text: 'No booking fees' },
  { icon: 'bell', title: '24/7 front desk', text: 'Always someone to help' },
  { icon: 'wifi', title: 'Free Wi-Fi', text: 'In every room' },
];

// Replaces the first perk when guests pay online.
export const PAY_ONLINE_PERK = { icon: 'wallet', title: 'Full payment at booking', text: 'Secure UPI, cards & netbanking' };

export const AMENITIES = [
  { icon: 'snow', title: 'Air conditioning', text: 'In every room' },
  { icon: 'wifi', title: 'WiFi', text: 'Stay connected' },
  { icon: 'tv', title: 'TV', text: 'In your room' },
  { icon: 'flame', title: 'Geyser', text: 'Hot water for your bath' },
  { icon: 'bottle', title: 'Mineral water', text: 'Safe drinking water' },
  { icon: 'tooth', title: 'Dental kit', text: 'Toothbrush and toothpaste' },
  { icon: 'sparkle', title: 'Housekeeping', text: 'Clean rooms, fresh linen' },
  { icon: 'cloche', title: 'Room service', text: 'Ask the front desk' },
  { icon: 'shirt', title: 'Laundry service', text: 'Charged separately', paid: true },
  { icon: 'luggage', title: 'Cloak room', text: 'Keep your luggage safe' },
  { icon: 'bolt', title: 'Power backup', text: 'No power cuts' },
  { icon: 'cctv', title: 'CCTV', text: 'Secure premises' },
];

// House rules. kind: 'no' = not allowed, 'yes' = allowed, 'info' = good to know, 'fee' = extra charge.
// `strong` rules are shown in red. {checkIn} and {checkOut} are replaced with the times set in the admin panel.

// The most important rules: shown in red on the home page and on the booking form.
export const KEY_RULES = [
  { title: 'Unmarried couples are not allowed', text: 'Applies to all rooms, including hourly stay rooms.' },
  { title: 'Alcohol is not allowed', text: 'No alcohol consumption anywhere on the property.' },
  { title: 'Local IDs are not accepted', text: 'Only Passport and Aadhaar are accepted as ID proof.' },
];

export const MUST_READ = [
  { kind: 'no', text: 'Unmarried couples are not allowed', strong: true },
  { kind: 'no', text: 'Alcohol consumption is not allowed within the property premises', strong: true },
  { kind: 'no', text: 'Local IDs are not allowed', strong: true },
  { kind: 'yes', text: 'Passport and Aadhaar are accepted as ID proof' },
  { kind: 'info', text: 'Primary guest should be at least 18 years of age' },
  { kind: 'yes', text: 'Groups with only male guests are allowed' },
  { kind: 'no', text: 'Pets are not allowed' },
  { kind: 'fee', text: 'Early check-in (before {checkIn}): ₹1,000 extra' },
];

export const RULES = [
  {
    icon: 'clock',
    title: 'Check-in & check-out',
    items: [
      { kind: 'info', text: 'Check-in from {checkIn}' },
      { kind: 'info', text: 'Check-out by {checkOut}' },
      { kind: 'fee', text: 'Early check-in (before {checkIn}): ₹1,000 extra, subject to availability' },
    ],
  },
  {
    icon: 'users',
    title: 'Guest profile',
    items: [
      { kind: 'no', text: 'Unmarried couples are not allowed', strong: true },
      { kind: 'info', text: 'Primary guest should be at least 18 years of age' },
      { kind: 'yes', text: 'Groups with only male guests are allowed' },
    ],
  },
  {
    icon: 'clock',
    title: 'Hourly stays',
    items: [{ kind: 'no', text: 'Unmarried couples are not allowed in hourly stay rooms', strong: true }],
  },
  {
    icon: 'idcard',
    title: 'ID proof',
    items: [
      { kind: 'yes', text: 'Passport and Aadhaar are accepted as ID proof' },
      { kind: 'no', text: 'Local IDs are not allowed', strong: true },
    ],
  },
  {
    icon: 'glass',
    title: 'Smoking & alcohol',
    items: [
      { kind: 'no', text: 'Alcohol consumption is not allowed within the property premises', strong: true },
      { kind: 'yes', text: 'Smoking within the premises is allowed' },
    ],
  },
  {
    icon: 'leaf',
    title: 'Food',
    items: [
      { kind: 'yes', text: 'Outside food is allowed' },
      { kind: 'no', text: 'Food delivery service is not available at the property' },
      { kind: 'no', text: 'In-room dining is not available' },
    ],
  },
  {
    icon: 'paw',
    title: 'Pets',
    items: [
      { kind: 'no', text: 'Pets are not allowed' },
      { kind: 'info', text: 'There are no pets living on the property' },
    ],
  },
  {
    icon: 'wheelchair',
    title: 'Accessibility',
    items: [{ kind: 'no', text: 'The property is not accessible to guests who use a wheelchair. Please make arrangements accordingly' }],
  },
  {
    icon: 'list',
    title: 'Other rules',
    items: [
      { kind: 'no', text: 'Private parties or events are not allowed' },
      { kind: 'no', text: 'Please do not invite outside visitors to your room during your stay' },
    ],
  },
  {
    icon: 'baby',
    title: 'Infants',
    items: [{ kind: 'info', text: '1 infant (0–2 yrs) is counted in the room capacity' }],
  },
  {
    icon: 'bed',
    title: 'Children & extra bed',
    items: [
      { kind: 'no', text: 'No extra bed is provided for a child included in the booking' },
      { kind: 'yes', text: 'An extra bed is provided for any additional guest included in the booking' },
      { kind: 'fee', text: '₹1,000 per guest for an extra mattress, paid at the property' },
    ],
  },
];

// Approximate travel times; please verify for your exact address.
export const NEARBY = [
  { place: 'Andheri Railway Station', time: '5 min' },
  { place: 'Andheri Metro (Line 1)', time: '7 min' },
  { place: 'Lokhandwala Market', time: '12 min' },
  { place: 'Juhu Beach', time: '15 min' },
  { place: 'Mumbai Airport (T1 / T2)', time: '20 min' },
];

export const ABOUT = {
  title: 'A comfortable base in the heart of the city',
  text: [
    'Hotel JD Residency is a friendly, no-fuss hotel for business travellers, families and anyone visiting the city. Our rooms are clean, quiet and air-conditioned, with fresh linen, fast Wi-Fi and hot water at any hour.',
    'We are close to the station, markets and the airport, and our front desk is open all day and night to help with check-in, cabs and local tips.',
  ],
  points: ['Walk to shops and local transport', 'Rooms for solo travellers, families and groups', 'Friendly staff, available around the clock'],
};

// {checkIn} and {checkOut} are replaced with the times set in the admin panel.
// `aOnline` is shown instead of `a` when online payment is switched on.
export const FAQ = [
  {
    q: 'What are the check-in and check-out times?',
    a: 'Check-in is from {checkIn} and check-out is until {checkOut}. Early check-in (before {checkIn}) costs ₹1,000 extra and depends on availability. For a late check-out, just ask us.',
  },
  {
    q: 'Do I need to pay when I book online?',
    a: 'No. Booking on this website is free and needs no advance payment. You pay at the hotel when you check in.',
    aOnline:
      'Yes. The full amount is paid online when you book, securely through Razorpay with UPI, cards, netbanking or wallets. Your booking is confirmed once the payment is received.',
  },
  {
    q: 'How will I know my booking is confirmed?',
    a: 'You get a booking reference immediately. Once we have allocated your room, we send your confirmation on WhatsApp (or call you) on the number you give us.',
  },
  {
    q: 'What do I need to bring at check-in?',
    a: 'Please carry a Passport or Aadhaar card for every adult guest. Local IDs are not accepted. The primary guest must be at least 18 years old.',
  },
  {
    q: 'Can I get an extra bed?',
    a: 'Yes, for an additional guest included in the booking. An extra mattress costs ₹1,000 per guest, paid at the hotel. No extra bed is provided for a child included in the booking.',
  },
  {
    q: 'How do I change or cancel my booking?',
    a: 'Call or WhatsApp the front desk with your booking reference and we will help you right away.',
  },
];
