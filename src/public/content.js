// Website copy that isn't managed from the admin panel. Edit freely.
// Contact details, prices, rooms and photos are managed at /admin.

export const PERKS = [
  { icon: 'wallet', title: 'Pay at hotel', text: 'No advance payment' },
  { icon: 'tag', title: 'Best price direct', text: 'No booking fees' },
  { icon: 'bell', title: '24/7 front desk', text: 'Always someone to help' },
  { icon: 'wifi', title: 'Free Wi-Fi', text: 'In every room' },
];

export const AMENITIES = [
  { icon: 'wifi', title: 'Free high-speed Wi-Fi' },
  { icon: 'snow', title: 'Air-conditioned rooms' },
  { icon: 'bell', title: '24/7 front desk' },
  { icon: 'sparkle', title: 'Daily housekeeping' },
  { icon: 'drop', title: 'Hot water round the clock' },
  { icon: 'bolt', title: 'Power backup' },
  { icon: 'shield', title: 'CCTV & secure access' },
  { icon: 'car', title: 'Cab & travel help' },
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
  points: ['Walk to shops and local transport', 'Rooms for solo travellers, couples and families', 'Friendly staff, available around the clock'],
};

// {checkIn} and {checkOut} are replaced with the times set in the admin panel.
export const FAQ = [
  {
    q: 'What are the check-in and check-out times?',
    a: 'Check-in is from {checkIn} and check-out is until {checkOut}. Early check-in or late check-out depends on availability; just ask us.',
  },
  {
    q: 'Do I need to pay when I book online?',
    a: 'No. Booking on this website is free and needs no advance payment. You pay at the hotel when you check in.',
  },
  {
    q: 'How will I know my booking is confirmed?',
    a: 'You get a booking reference immediately. Once we have allocated your room, we send your confirmation on WhatsApp (or call you) on the number you give us.',
  },
  {
    q: 'What do I need to bring at check-in?',
    a: 'Please carry a valid government photo ID (Aadhaar, passport, driving licence or voter ID) for every adult guest.',
  },
  {
    q: 'How do I change or cancel my booking?',
    a: 'Call or WhatsApp the front desk with your booking reference and we will help you right away.',
  },
];
