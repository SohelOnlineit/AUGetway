const rows = [
  ["POST", "/api/auth/login", "Desk sign in"],
  ["GET", "/api/desk/summary", "Dashboard totals"],
  ["GET", "/api/desk/customers", "Customer list"],
  ["POST", "/api/desk/customers", "Add a customer"],
  ["GET", "/api/public/pay/:id", "Customer checkout"],
  ["POST", "/api/public/pay/:id/method", "Choose a gateway"],
  ["POST", "/api/public/pay/:id/proof", "Submit the wallet reference"],
  ["POST", "/api/checkout-v2", "Uddokta Pay checkout. Header RT-UDDOKTAPAY-API-KEY"],
  ["POST", "/api/verify-payment", "Uddokta Pay verify. Body invoice_id"],
  ["POST", "/api/v1/checkouts", "Create a checkout with x-merchant-key"],
  ["GET", "/api/v1/checkouts/:id", "Read a checkout with x-merchant-key"],
  ["POST", "/api/handset/notice", "Submit a payment message from the phone"],
] as const;

export default function ApiReferencesPage() {
  return (
    <div className="ref-page">
      <header className="ref-hero">
        <span className="ref-hero-ico" aria-hidden="true">
          <svg className="ref-code" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m8 8-4 4 4 4" />
            <path d="m16 8 4 4-4 4" />
            <path d="m13 6-2 12" />
          </svg>
          <i />
        </span>
        <div>
          <p className="keys-crumb">Desk <span>›</span> API References</p>
          <h2>API References</h2>
          <p className="muted">Base URL <span className="token">http://127.0.0.1:4100</span></p>
        </div>
      </header>
      <section className="ref-card">
        <table className="ref-table">
          <thead>
            <tr><th>Method</th><th>Path</th><th>Use</th></tr>
          </thead>
          <tbody>
            {rows.map(([method, path, use]) => (
              <tr key={`${method} ${path}`}>
                <td><span className={`ref-method ${method.toLowerCase()}`}><CodeIcon />{method}</span></td>
                <td className="token">{path}</td>
                <td>{use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function CodeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 8-3 4 3 4M15 8l3 4-3 4" /></svg>;
}
