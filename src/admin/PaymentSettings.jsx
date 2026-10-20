import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from '../lib/Icon.jsx';
import { useAdmin } from './AdminApp.jsx';

const MODES = [
  ['hotel', 'Pay at the hotel', 'Guests book without paying. Website bookings come to you as Pending straight away.'],
  [
    'razorpay',
    'Full payment online (Razorpay)',
    'Guests pay the whole amount when they book, by UPI, card, netbanking or wallet. The booking reaches you as Pending only after the money is received.',
  ],
];

export default function PaymentSettings() {
  const { notify } = useAdmin();
  const [f, setF] = useState(null);
  const [secret, setSecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/payments')
      .then((d) => setF(d.payments))
      .catch((e) => setError(e.message));
  }, []);

  if (!f) return <section className="card">{error || 'Loading payment settings…'}</section>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isOnline = f.pay_mode === 'razorpay';
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => notify('Copied'));

  async function save(e, extra = {}) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        pay_mode: f.pay_mode,
        ...(f.from_env.rzp_key_id ? {} : { rzp_key_id: f.rzp_key_id }),
        ...(secret ? { rzp_key_secret: secret } : {}),
        ...(webhookSecret ? { rzp_webhook_secret: webhookSecret } : {}),
        ...extra,
      };
      const d = await api('/admin/payments', { method: 'PUT', body });
      setF(d.payments);
      setSecret('');
      setWebhookSecret('');
      notify('Payment settings saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const secretField = (key, label, value, setValue, placeholder) => (
    <label className="afield">
      <span>{label}</span>
      {f.from_env[key] ? (
        <input value="Set on the server" disabled />
      ) : (
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={f[`${key}_set`] ? '•••••••• saved (type to replace)' : placeholder}
        />
      )}
      {f[`${key}_set`] && !f.from_env[key] && (
        <button type="button" className="linky small" onClick={(e) => save(e, { [`${key}_clear`]: true, pay_mode: key === 'rzp_key_secret' ? 'hotel' : f.pay_mode })}>
          Remove saved {label.toLowerCase()}
        </button>
      )}
    </label>
  );

  return (
    <section className="card">
      <h2 className="card-title">
        <Icon name="wallet" size={20} /> Online payments
      </h2>
      <p className="muted small">Choose whether guests pay when they book on the website, or at the hotel.</p>

      <form className="aform" onSubmit={save}>
        <div className="mode-pick" role="radiogroup" aria-label="Payment option">
          {MODES.map(([value, label, text]) => (
            <label key={value} className={`mode-option ${f.pay_mode === value ? 'is-on' : ''}`}>
              <input type="radio" name="pay_mode" value={value} checked={f.pay_mode === value} onChange={set('pay_mode')} />
              <b>{label}</b>
              <small>{text}</small>
            </label>
          ))}
        </div>

        {isOnline && (
          <div className="aform-grid">
            <div className={`api-status span-2 ${f.online ? 'is-ready' : ''}`}>
              <Icon name={f.online ? 'check' : 'alert'} size={16} />
              {f.online
                ? f.test_mode
                  ? 'Test mode: payments are simulated and no real money moves. Switch to Live keys when you are ready.'
                  : 'Live: guests pay real money into your Razorpay account.'
                : 'Add your Razorpay Key ID and Key Secret, then save.'}
            </div>
            <label className="afield">
              <span>Key ID</span>
              <input
                value={f.rzp_key_id}
                onChange={set('rzp_key_id')}
                disabled={f.from_env.rzp_key_id}
                placeholder="rzp_live_…"
                autoComplete="off"
              />
            </label>
            {secretField('rzp_key_secret', 'Key Secret', secret, setSecret, 'Paste the Key Secret')}
            {secretField('rzp_webhook_secret', 'Webhook secret', webhookSecret, setWebhookSecret, 'The secret you typed when adding the webhook')}
            <label className="afield">
              <span>Webhook URL (paste this in Razorpay)</span>
              <div className="copy-row">
                <input value={f.webhook_url} readOnly onFocus={(e) => e.target.select()} />
                <button type="button" className="abtn abtn-sm" onClick={() => copy(f.webhook_url)}>
                  Copy
                </button>
              </div>
            </label>
            {!f.rzp_webhook_secret_set && f.online && (
              <p className="aerror span-2">
                Add the webhook too. Without it, a guest who pays and then closes the page before returning stays “Awaiting
                payment” and their room is released.
              </p>
            )}
          </div>
        )}

        {error && <p className="aerror">{error}</p>}
        <div className="aform-foot">
          <button className="abtn abtn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save payment settings'}
          </button>
        </div>
      </form>

      {isOnline && (
        <details className="setup-help">
          <summary>How to set up Razorpay (one time)</summary>
          <ol>
            <li>
              Sign up at <a href="https://dashboard.razorpay.com/signup" target="_blank" rel="noreferrer">razorpay.com</a> with the
              hotel's details. You can test straight away; to take real payments, finish the KYC (PAN, bank account, business
              proof). Approval usually takes a few working days.
            </li>
            <li>
              In the Razorpay Dashboard, go to <b>Account &amp; Settings → API Keys</b>, generate a key and copy the{' '}
              <b>Key ID</b> and <b>Key Secret</b> into the boxes above. Use <b>Test mode</b> keys first, and try a booking with
              Razorpay's test UPI ID <code>success@razorpay</code>.
            </li>
            <li>
              Go to <b>Account &amp; Settings → Webhooks → Add new webhook</b>. Paste the webhook URL above, type any secret
              (also paste it above), and tick the events <b>payment.captured</b> and <b>order.paid</b>.
            </li>
            <li>
              Under <b>Account &amp; Settings → Payment capture</b>, keep <b>automatic capture</b> on (the website also captures
              payments itself if it is off).
            </li>
            <li>When test bookings work, repeat steps 2 and 3 in Live mode and save the live keys here.</li>
          </ol>
          <p className="muted small">
            Razorpay charges a fee per payment (about 2% for most methods), deducted before the money reaches your bank.
            Refunds for cancellations are made from the Razorpay Dashboard: open the payment from the booking and choose
            Refund.
          </p>
        </details>
      )}
    </section>
  );
}
