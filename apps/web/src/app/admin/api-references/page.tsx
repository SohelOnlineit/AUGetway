const rows = [
  ["POST", "/api/auth/login", "Desk sign in"],
  ["GET", "/api/desk/summary", "Dashboard totals"],
  ["GET", "/api/desk/customers", "Customer list"],
  ["POST", "/api/desk/customers", "Add a customer"],
  ["GET", "/api/public/pay/:id", "Customer checkout"],
  ["POST", "/api/public/pay/:id/method", "Choose a gateway"],
  ["POST", "/api/public/pay/:id/proof", "Submit the wallet reference"],
  ["POST", "/api/v1/checkouts", "Create a checkout with x-merchant-key"],
  ["GET", "/api/v1/checkouts/:id", "Read a checkout with x-merchant-key"],
  ["POST", "/api/handset/notice", "Submit a payment message from the phone"],
];

export default function ApiReferencesPage() {
  return (
    <div className="stack">
      <h2>API References</h2>
      <p className="muted">Base URL http://127.0.0.1:4100</p>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Method</th><th>Path</th><th>Use</th></tr>
          </thead>
          <tbody>
            {rows.map(([method, path, use]) => (
              <tr key={path}>
                <td>{method}</td>
                <td className="token">{path}</td>
                <td>{use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
