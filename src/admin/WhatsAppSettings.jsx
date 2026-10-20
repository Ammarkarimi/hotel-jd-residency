import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from '../lib/Icon.jsx';
import { useAdmin } from './AdminApp.jsx';

// The exact text to submit as message templates in WhatsApp Manager (category: Utility).
// The {{n}} order matches ownerTemplateParams / guestTemplateParams / reviewTemplateParams in server/whatsapp.js.
export const TEMPLATE_TEXT = {
  owner:
    'New booking {{1}} received. Guest: {{2}} ({{3}}). Room: {{4}}. Check-in: {{5}}. Check-out: {{6}}. Guests: {{7}}. Total: {{8}}. Please open the admin panel to confirm it.',
  guest:
    'Hello {{1}}, your booking {{2}} at {{3}} is confirmed. Room: {{4}}. Check-in: {{5}} from {{6}}. Check-out: {{7}}. Total: {{8}}. Address: {{9}}. Please carry a Passport or Aadhaar for each adult. We look forward to hosting you.',
  review:
    'Hello {{1}}, thank you for staying at {{2}}. We hope you had a comfortable stay. If you have a minute, please share your experience in a Google review: {{3}} We look forward to welcoming you again.',
};

const PLACEHOLDERS = ['name', 'full_name', 'ref', 'hotel', 'room', 'check_in', 'check_in_time', 'check_out', 'check_out_time', 'guests', 'total', 'payment', 'address', 'phone'];
const on = (v) => v === true || v === '1';

const MODES = [
  ['off', 'Off', 'No WhatsApp messages.'],
  ['link', 'Ready-made message', 'No setup. "Send confirmation" opens WhatsApp with the message written for you; staff press Send from the hotel\'s WhatsApp.'],
  [
    'api',
    'Automatic (WhatsApp Business API)',
    'The owner gets a WhatsApp alert for every website booking, and confirmations are sent by the website itself. Needs a one-time setup with Meta.',
  ],
];

export default function WhatsAppSettings() {
  const { notify, setWa } = useAdmin();
  const [f, setF] = useState(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    api('/admin/whatsapp')
      .then((d) => setF(d.whatsapp))
      .catch((e) => setError(e.message));
  }, []);

  if (!f) return <section className="card">{error || 'Loading WhatsApp settings…'}</section>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const isApi = f.wa_mode === 'api';

  async function save(e, extra = {}) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        wa_mode: f.wa_mode,
        sender: f.sender,
        wa_owner_numbers: f.wa_owner_numbers,
        wa_guest_message: f.wa_guest_message,
        wa_phone_number_id: f.wa_phone_number_id,
        wa_template_owner: f.wa_template_owner,
        wa_template_guest: f.wa_template_guest,
        wa_template_review: f.wa_template_review,
        wa_template_lang: f.wa_template_lang,
        wa_auto_confirm: on(f.wa_auto_confirm),
        wa_auto_review: on(f.wa_auto_review),
        review_url: f.review_url,
        wa_review_message: f.wa_review_message,
        ...(token ? { wa_token: token } : {}),
        ...extra,
      };
      const d = await api('/admin/whatsapp', { method: 'PUT', body });
      setF(d.whatsapp);
      setWa(d.whatsapp);
      setToken('');
      notify('WhatsApp settings saved');
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!(await save())) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { results } = await api('/admin/whatsapp/test', { method: 'POST' });
      setTestResult(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  const copy = (text) => navigator.clipboard?.writeText(text).then(() => notify('Copied'));

  return (
    <section className="card">
      <h2 className="card-title">
        <Icon name="whatsapp" size={20} /> WhatsApp messages
      </h2>
      <p className="muted small">
        Let the owner know about new bookings, send guests their booking confirmation, and ask them for a Google review after
        they check out.
      </p>

      <form className="aform" onSubmit={save}>
        <div className="mode-pick" role="radiogroup" aria-label="WhatsApp mode">
          {MODES.map(([value, label, text]) => (
            <label key={value} className={`mode-option ${f.wa_mode === value ? 'is-on' : ''}`}>
              <input type="radio" name="wa_mode" value={value} checked={f.wa_mode === value} onChange={set('wa_mode')} />
              <b>{label}</b>
              <small>{text}</small>
            </label>
          ))}
        </div>

        {f.wa_mode !== 'off' && (
          <div className="aform-grid">
            <label className="afield">
              <span>Hotel WhatsApp number (guests get messages from this number)</span>
              <input value={f.sender || ''} onChange={set('sender')} placeholder="+91 98XXX XXXXX" />
              <small className="muted">
                {isApi
                  ? 'Must be the number you registered with Meta for the WhatsApp Business API.'
                  : 'Open WhatsApp on the phone or computer logged in to this number before pressing "Send confirmation". It is also shown on the website.'}
              </small>
            </label>
            <label className="afield">
              <span>Owner WhatsApp number(s) for new-booking alerts</span>
              <input value={f.wa_owner_numbers || ''} onChange={set('wa_owner_numbers')} placeholder="+91 98XXX XXXXX, +91 97XXX XXXXX" />
              <small className="muted">
                {isApi ? 'Separate several numbers with commas.' : 'Alerts are only sent automatically in Automatic mode.'}
              </small>
            </label>

            <label className="afield span-2">
              <span>Google review link (sent to guests after check-out)</span>
              <input type="url" value={f.review_url || ''} onChange={set('review_url')} placeholder="https://g.page/r/…/review" />
              <small className="muted">
                In Google Business Profile, choose “Ask for reviews” and copy the link.{' '}
                {f.review_url && (
                  <a href={f.review_url} target="_blank" rel="noreferrer">
                    Test the link
                  </a>
                )}
              </small>
            </label>

            {!isApi && (
              <>
                <label className="afield span-2">
                  <span>Confirmation message</span>
                  <textarea rows={9} value={f.wa_guest_message} onChange={set('wa_guest_message')} />
                </label>
                <label className="afield span-2">
                  <span>Review request message (after check-out)</span>
                  <textarea rows={7} value={f.wa_review_message} onChange={set('wa_review_message')} />
                  <small className="muted">
                    Words in curly brackets are filled in for each booking:{' '}
                    {[...PLACEHOLDERS, 'review_link'].map((p) => (
                      <code key={p}>{`{${p}}`} </code>
                    ))}
                  </small>
                </label>
              </>
            )}

            {isApi && (
              <>
                <div className={`api-status span-2 ${f.api_ready ? 'is-ready' : ''}`}>
                  <Icon name={f.api_ready ? 'check' : 'alert'} size={16} />
                  {f.api_ready ? 'Connected details saved.' : 'Add the phone number ID and access token from Meta to start sending.'}
                </div>
                <label className="afield">
                  <span>Phone number ID (from Meta)</span>
                  <input value={f.wa_phone_number_id || ''} onChange={set('wa_phone_number_id')} inputMode="numeric" placeholder="e.g. 106540352242922" />
                </label>
                <label className="afield">
                  <span>Access token</span>
                  {f.wa_token_from_env ? (
                    <input value="Set on the server (WHATSAPP_TOKEN)" disabled />
                  ) : (
                    <input
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={f.wa_token_set ? '•••••••• saved (type to replace)' : 'Paste the permanent access token'}
                    />
                  )}
                  {f.wa_token_set && !f.wa_token_from_env && (
                    <button type="button" className="linky small" onClick={(e) => save(e, { wa_token_clear: true })}>
                      Remove saved token
                    </button>
                  )}
                </label>
                <label className="afield">
                  <span>Owner alert template name</span>
                  <input value={f.wa_template_owner} onChange={set('wa_template_owner')} />
                </label>
                <label className="afield">
                  <span>Guest confirmation template name</span>
                  <input value={f.wa_template_guest} onChange={set('wa_template_guest')} />
                </label>
                <label className="afield">
                  <span>Review request template name</span>
                  <input value={f.wa_template_review} onChange={set('wa_template_review')} />
                </label>
                <label className="afield">
                  <span>Template language code</span>
                  <input value={f.wa_template_lang} onChange={set('wa_template_lang')} placeholder="en" />
                </label>
                <label className="acheck span-2">
                  <input type="checkbox" checked={on(f.wa_auto_confirm)} onChange={set('wa_auto_confirm')} />
                  Send the confirmation automatically when I confirm a booking
                </label>
                <label className="acheck span-2">
                  <input type="checkbox" checked={on(f.wa_auto_review)} onChange={set('wa_auto_review')} />
                  Send the Google review link automatically when a guest checks out
                </label>
              </>
            )}
          </div>
        )}

        {error && <p className="aerror">{error}</p>}
        {testResult && (
          <ul className="wa-log">
            {testResult.map((r) => (
              <li key={r.to} className={r.ok ? 'wa-sent' : 'wa-failed'}>
                <Icon name={r.ok ? 'check' : 'alert'} size={14} strokeWidth={2.2} />
                <div>
                  <span>
                    +{r.to}: {r.url ? 'opening WhatsApp with a sample alert' : r.ok ? 'test alert sent. Check WhatsApp.' : r.error}
                  </span>
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer" className="small">
                      Open sample in WhatsApp
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="aform-foot">
          {isApi && (
            <button type="button" className="abtn" onClick={test} disabled={busy || testing}>
              {testing ? 'Sending test…' : 'Save & send test alert to owner'}
            </button>
          )}
          <button className="abtn abtn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save WhatsApp settings'}
          </button>
        </div>
      </form>

      {isApi && (
        <details className="setup-help">
          <summary>How to set up automatic WhatsApp messages (one time, about 30 minutes)</summary>
          <ol>
            <li>
              Go to <a href="https://business.facebook.com" target="_blank" rel="noreferrer">business.facebook.com</a>, create a
              Meta Business account for the hotel, then in <b>developers.facebook.com</b> create an app and add the{' '}
              <b>WhatsApp</b> product.
            </li>
            <li>
              Add and verify the hotel's phone number. This becomes the number guests receive messages from. It can't be
              in use on the normal WhatsApp app at the same time.
            </li>
            <li>
              Copy the <b>Phone number ID</b> into the box above, and create a <b>permanent access token</b> (Business
              Settings → System users → Generate token, with the <code>whatsapp_business_messaging</code> permission).
            </li>
            <li>
              In <b>WhatsApp Manager → Message templates</b>, create these three templates, category <b>Utility</b>, language{' '}
              <b>English</b>, and wait for approval (usually minutes). Meta may file the review request under Marketing,
              which is fine:
              <div className="template-box">
                <div>
                  <b>{f.wa_template_owner}</b>
                  <button type="button" className="linky small" onClick={() => copy(TEMPLATE_TEXT.owner)}>
                    Copy text
                  </button>
                </div>
                <p>{TEMPLATE_TEXT.owner}</p>
              </div>
              <div className="template-box">
                <div>
                  <b>{f.wa_template_guest}</b>
                  <button type="button" className="linky small" onClick={() => copy(TEMPLATE_TEXT.guest)}>
                    Copy text
                  </button>
                </div>
                <p>{TEMPLATE_TEXT.guest}</p>
              </div>
              <div className="template-box">
                <div>
                  <b>{f.wa_template_review}</b>
                  <button type="button" className="linky small" onClick={() => copy(TEMPLATE_TEXT.review)}>
                    Copy text
                  </button>
                </div>
                <p>{TEMPLATE_TEXT.review}</p>
              </div>
            </li>
            <li>Save here and press “Send test alert to owner”.</li>
          </ol>
          <p className="muted small">
            Meta charges a small per-message fee for messages a business sends first. See the “Pricing” page in Meta's
            WhatsApp Business documentation for current rates in India.
          </p>
        </details>
      )}
    </section>
  );
}
