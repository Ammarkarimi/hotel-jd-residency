export function money(n, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);
}

export function compactMoney(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n}`;
}

export function fmtDate(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!s) return '';
  return new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', opts);
}

export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(s, n) {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function nights(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400e3);
}

export function time12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export const SOURCE_LABELS = {
  website: 'Website',
  walk_in: 'Walk-in',
  phone: 'Phone',
  ota: 'OTA (MakeMyTrip etc.)',
  other: 'Other',
};
