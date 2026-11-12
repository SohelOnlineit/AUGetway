export default function IntegrationsPage() {
  return (
    <div className="int-page">
      <header className="int-hero">
        <span className="int-hero-ico" aria-hidden="true">
          <svg className="int-plug" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 8V4M16 8V4M7 8h10v4a5 5 0 0 1-10 0z" />
            <path d="M12 17v3" />
          </svg>
          <i />
        </span>
        <div>
          <p className="keys-crumb">Desk <span>›</span> Integrations</p>
          <h2>Integrations</h2>
          <p className="muted">Connect the shop, your own server, or the AU-Getway phone to this desk.</p>
        </div>
      </header>
      <div className="int-grid">
        <article className="int-card">
          <span className="int-ico shop" aria-hidden="true"><ShopIcon /></span>
          <strong>Uddokta Pay</strong>
          <p>In the shop’s payment gateway, set the base URL to <span className="token">https://pay.uniqbd.com</span> and paste a Checkout API key from Api Keys. The secret is shown once, when the key is created.</p>
        </article>
        <article className="int-card">
          <span className="int-ico server" aria-hidden="true"><ServerIcon /></span>
          <strong>Your store server</strong>
          <p>The same key also works with the header <span className="token">x-merchant-key</span>.</p>
          <p className="token">POST http://127.0.0.1:4100/api/v1/checkouts</p>
          <pre className="token">{`{
  "reference": "order-19",
  "amount": 250,
  "currency": "BDT"
}`}</pre>
        </article>
        <article className="int-card">
          <span className="int-ico phone" aria-hidden="true"><PhoneIcon /></span>
          <strong>Android handset</strong>
          <p>The AU-Getway app signs in with this desk account and submits a payment message you received on that phone.</p>
        </article>
      </div>
    </div>
  );
}

function ShopIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M4 9h16l-1 11H5z" /><path d="M8 9V7a4 4 0 0 1 8 0v2" /></svg>;
}
function ServerIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><path d="M8 7h.01M8 17h.01" /></svg>;
}
function PhoneIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></svg>;
}
