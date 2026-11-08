export default function IntegrationsPage() {
  return (
    <div className="stack">
      <h2>Integrations</h2>
      <article className="card">
        <strong>Your store server</strong>
        <p>Create a key under Api Keys, then call the desk from your shop with the header <span className="token">x-merchant-key</span>.</p>
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
