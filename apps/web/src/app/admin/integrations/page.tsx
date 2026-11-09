export default function IntegrationsPage() {
  return (
    <div className="stack">
      <h2>Integrations</h2>
      <article className="card">
        <strong>Uddokta Pay</strong>
        <p>In the shop’s payment gateway, set the base URL to <span className="token">https://pay.uniqbd.com</span> and paste a Checkout API key from Api Keys. The secret is shown once, when the key is created.</p>
        <strong>Your store server</strong>
        <p>The same key also works with the header <span className="token">x-merchant-key</span>.</p>
        <p className="token">POST http://127.0.0.1:4100/api/v1/checkouts</p>
        <pre className="token">{`{
  "reference": "order-19",
  "amount": 250,
  "currency": "BDT"
}`}</pre>
      </article>
      <article className="card">
        <strong>Android handset</strong>
        <p>The UniqBD Pay app signs in with this desk account and submits a payment message you received on that phone.</p>
      </article>
    </div>
  );
}
