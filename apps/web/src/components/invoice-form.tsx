"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export type InvoiceLine = { description: string; quantity: number; price: number; discount: number; vat: number };

export type InvoiceDraft = {
  number: string;
  customerName: string;
  customerEmail: string | null;
  title: string;
  total: string;
  currency: string;
  status: string;
  note: string;
  dueOn: string | null;
  items: InvoiceLine[];
  shipping: number;
  vatTotal: number;
  discountTotal: number;
  redirectUrl: string;
  privateNote: string;
};

type Customer = { id: string; name: string; email: string | null };
type Line = InvoiceLine & { id: string };

const currencies = ["BDT", "USD", "EUR", "GBP"];

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function round2(value: number) {
  return Math.round((finite(value) + Number.EPSILON) * 100) / 100;
}

function inAWeek() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

let lineSeed = 1;
function nextId() {
  lineSeed += 1;
  return `line-${lineSeed}`;
}

function blankLine(): Line {
  return { id: nextId(), description: "", quantity: 1, price: 0, discount: 0, vat: 0 };
}

function moneyText(value: number) {
  return round2(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function figure(items: Line[], shipping: number, vat: number, discount: number, vatTouched: boolean, discountTouched: boolean) {
  let subtotal = 0;
  let autoVat = 0;
  let autoDiscount = 0;
  for (const item of items) {
    const qty = Math.max(0, item.quantity || 0);
    const price = Math.max(0, item.price || 0);
    const lineDiscount = Math.max(0, item.discount || 0);
    subtotal += qty * price;
    autoDiscount += lineDiscount;
    autoVat += Math.max(0, qty * price - lineDiscount) * (Math.max(0, item.vat || 0) / 100);
  }
  const vatTotal = vatTouched ? vat : round2(autoVat);
  const discountTotal = discountTouched ? discount : round2(autoDiscount);
  const payable = Math.max(0, round2(subtotal - discountTotal + vatTotal + Math.max(0, shipping)));
  return { vatTotal, discountTotal, payable };
}

export function InvoiceForm({ mode, initial }: { mode: "create" | "edit"; initial?: InvoiceDraft }) {
  const router = useRouter();
  const seeded = seed(initial);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState(seeded.customerName);
  const [customerName, setCustomerName] = useState(seeded.customerName);
  const [customerEmail, setCustomerEmail] = useState(seeded.customerEmail);
  const [openList, setOpenList] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currency, setCurrency] = useState(seeded.currency);
  const [dueOn, setDueOn] = useState(seeded.dueOn);
  const [status, setStatus] = useState(seeded.status);
  const [items, setItems] = useState<Line[]>(seeded.items);
  const [shipping, setShipping] = useState(seeded.shipping);
  const [vat, setVat] = useState(seeded.vat);
  const [discount, setDiscount] = useState(seeded.discount);
  const [total, setTotal] = useState(seeded.total);
  const [vatTouched, setVatTouched] = useState(seeded.vatTouched);
  const [discountTouched, setDiscountTouched] = useState(seeded.discountTouched);
  const [totalTouched, setTotalTouched] = useState(seeded.totalTouched);
  const [notesOpen, setNotesOpen] = useState(Boolean(seeded.note || seeded.redirectUrl || seeded.privateNote));
  const [note, setNote] = useState(seeded.note);
  const [redirectUrl, setRedirectUrl] = useState(seeded.redirectUrl);
  const [privateNote, setPrivateNote] = useState(seeded.privateNote);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Customer[]>("/desk/customers").then(setCustomers).catch(() => setCustomers([]));
  }, []);

  const totals = useMemo(
    () => figure(items, shipping, vat, discount, vatTouched, discountTouched),
    [items, shipping, vat, discount, vatTouched, discountTouched],
  );

  useEffect(() => {
    if (!vatTouched) setVat(totals.vatTotal);
    if (!discountTouched) setDiscount(totals.discountTotal);
    if (!totalTouched) setTotal(totals.payable);
  }, [totals, vatTouched, discountTouched, totalTouched]);

  const matches = customers.filter((customer) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return customer.name.toLowerCase().includes(needle) || (customer.email ?? "").toLowerCase().includes(needle);
  }).slice(0, 8);

  function pick(customer: Customer) {
    setCustomerName(customer.name);
    setCustomerEmail(customer.email ?? "");
    setQuery(customer.name);
    setOpenList(false);
    setAdding(false);
  }

  function changeItems(next: Line[]) {
    setTotalTouched(false);
    setItems(next);
  }

  async function addCustomer() {
    const name = newName.trim();
    if (name.length < 2) {
      setError("Customer name needs at least 2 characters");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api<Customer>("/desk/customers", {
        method: "POST",
        body: JSON.stringify({ name, ...(newEmail.trim() ? { email: newEmail.trim() } : {}) }),
      });
      setCustomers((current) => [created, ...current]);
      pick(created);
      setNewName("");
      setNewEmail("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add customer");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    const fresh = seed();
    setQuery("");
    setCustomerName("");
    setCustomerEmail("");
    setAdding(false);
    setCurrency(fresh.currency);
    setDueOn(fresh.dueOn);
    setStatus(fresh.status);
    setItems(fresh.items);
    setShipping(0);
    setVat(0);
    setDiscount(0);
    setTotal(0);
    setVatTouched(false);
    setDiscountTouched(false);
    setTotalTouched(false);
    setNotesOpen(false);
    setNote("");
    setRedirectUrl("");
    setPrivateNote("");
  }

  async function save(again: boolean) {
    const name = customerName.trim();
    const lines = items
      .map((item) => ({
        description: item.description.trim(),
        quantity: Math.max(1, Math.round(finite(item.quantity) || 1)),
        price: round2(Math.max(0, finite(item.price))),
        discount: round2(Math.max(0, finite(item.discount))),
        vat: round2(Math.min(100, Math.max(0, finite(item.vat)))),
      }))
      .filter((item) => item.description);
    const payable = round2(totalTouched ? finite(total) : totals.payable);
    if (name.length < 2) {
      setError("Select a customer");
      return;
    }
    if (!lines.length) {
      setError("Add at least one line item");
      return;
    }
    if (payable < 1 || payable > 250000) {
      setError("Total payable must be between 1 and 250,000");
      return;
    }
    const redirect = redirectUrl.trim();
    if (redirect && !/^https?:\/\//i.test(redirect)) {
      setError("Redirect URL must start with http:// or https://");
      return;
    }
    const title = (lines.find((item) => item.description.length >= 2)?.description ?? "Invoice").slice(0, 120);
    const email = customerEmail.trim();
    const body: Record<string, unknown> = {
      customerName: name,
      title,
      total: payable,
      note: note.trim(),
      dueOn,
      currency,
      status,
      items: lines,
      shipping: round2(Math.max(0, shipping || 0)),
      vatTotal: round2(Math.max(0, vat || 0)),
      discountTotal: round2(Math.max(0, discount || 0)),
      redirectUrl: redirect,
      privateNote: privateNote.trim(),
    };
    if (mode === "edit" || email) body.customerEmail = email;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "edit" && initial) {
        await api(`/desk/bills/${initial.number}`, { method: "PATCH", body: JSON.stringify(body) });
        router.push("/admin/invoices");
        return;
      }
      await api("/desk/bills", { method: "POST", body: JSON.stringify(body) });
      if (again) {
        reset();
        setMessage("Invoice created. You can create another.");
      } else {
        router.push("/admin/invoices");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inv-page inv-build">
      <header className="inv-head">
        <div>
          <p className="inv-crumb">Invoices <span>›</span> {mode === "edit" ? "Edit" : "Create"}</p>
          <h2>{mode === "edit" ? "Edit Invoice" : "Create Invoice"}</h2>
          {initial ? <p className="inv-build-num">{initial.number}</p> : null}
        </div>
      </header>

      <div className="inv-build-grid">
        <div className="inv-build-main">
          <section className="inv-sec">
            <div className="inv-sec-head">
              <span className="inv-sec-ico" aria-hidden="true"><PersonIcon /></span>
              <div>
                <h3>Customer & Billing Terms</h3>
                <p>Select the customer and configure invoice schedule</p>
              </div>
            </div>
            <label className="inv-field">
              <span>Billed To (Customer) <i>*</i></span>
              <div className="inv-pick">
                <input
                  value={query}
                  placeholder="Search or select a customer..."
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setCustomerName(event.target.value);
                    setOpenList(true);
                  }}
                  onFocus={() => setOpenList(true)}
                  onBlur={() => setOpenList(false)}
                />
                <button className="inv-plus" type="button" aria-label="Add customer" onClick={() => { setAdding((open) => !open); setNewName(customerName); }}>
                  +
                </button>
                {openList && matches.length ? (
                  <ul className="inv-suggest">
                    {matches.map((customer) => (
                      <li key={customer.id}>
                        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => pick(customer)}>
                          <strong>{customer.name}</strong>
                          {customer.email ? <small>{customer.email}</small> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </label>
            {adding ? (
              <div className="inv-add">
                <label className="inv-field"><span>Name</span><input value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} /></label>
                <label className="inv-field"><span>Email</span><input value={newEmail} type="email" maxLength={120} onChange={(event) => setNewEmail(event.target.value)} /></label>
                <button className="inv-new" type="button" disabled={busy} onClick={addCustomer}>Add</button>
              </div>
            ) : null}
            <div className="inv-terms">
              <label className="inv-field">
                <span>Currency <i>*</i></span>
                <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  {currencies.map((code) => <option key={code} value={code}>{code} {code === "BDT" ? "(৳)" : ""}</option>)}
                </select>
              </label>
              <label className="inv-field">
                <span>Due Date <i>*</i></span>
                <input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
              </label>
              <label className="inv-field">
                <span>Status <i>*</i></span>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="due">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>
          </section>

          <section className="inv-sec">
            <div className="inv-sec-head">
              <span className="inv-sec-ico" aria-hidden="true"><BoxIcon /></span>
              <div>
                <h3>Invoice Items</h3>
                <p>Add goods, services, or line items with quantities and unit rates</p>
              </div>
            </div>
            <p className="inv-items-label">Items</p>
            <div className="inv-lines">
              {items.map((item, index) => (
                <article className="inv-line" key={item.id}>
                  <div className="inv-line-top">
                    <strong>Line Item ({item.quantity || 0} × {moneyText(item.price || 0)})</strong>
                    <div>
                      <button type="button" aria-label="Duplicate line" onClick={() => changeItems(items.flatMap((row) => (row.id === item.id ? [row, { ...row, id: nextId() }] : [row])))}>
                        <CopyIcon />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete line"
                        onClick={() => changeItems(items.length === 1 ? [blankLine()] : items.filter((row) => row.id !== item.id))}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  <label className="inv-field">
                    <span>Item Description / Service Name <i>*</i></span>
                    <input
                      value={item.description}
                      maxLength={160}
                      placeholder="e.g. Web Development, Subscription, Service Fee"
                      onChange={(event) => changeItems(items.map((row, rowIndex) => (rowIndex === index ? { ...row, description: event.target.value } : row)))}
                    />
                  </label>
                  <div className="inv-line-grid">
                    <label className="inv-field">
                      <span>Quantity <i>*</i></span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={item.quantity}
                        onChange={(event) => changeItems(items.map((row, rowIndex) => (rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row)))}
                      />
                    </label>
                    <label className="inv-field">
                      <span>Unit Price (Amount) <i>*</i></span>
                      <span className="inv-money">
                        <b>{currency}</b>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.price}
                          onChange={(event) => changeItems(items.map((row, rowIndex) => (rowIndex === index ? { ...row, price: Number(event.target.value) } : row)))}
                        />
                      </span>
                    </label>
                    <label className="inv-field">
                      <span>Discount</span>
                      <span className="inv-money">
                        <b>{currency}</b>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.discount}
                          onChange={(event) => changeItems(items.map((row, rowIndex) => (rowIndex === index ? { ...row, discount: Number(event.target.value) } : row)))}
                        />
                      </span>
                    </label>
                    <label className="inv-field">
                      <span>VAT (%)</span>
                      <span className="inv-money">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={item.vat}
                          onChange={(event) => changeItems(items.map((row, rowIndex) => (rowIndex === index ? { ...row, vat: Number(event.target.value) } : row)))}
                        />
                        <b>%</b>
                      </span>
                    </label>
                  </div>
                </article>
              ))}
            </div>
            <button className="inv-add-line" type="button" onClick={() => changeItems([...items, blankLine()])}>+ Add Line Item</button>
          </section>

          <section className="inv-sec inv-notes">
            <button type="button" className="inv-notes-toggle" onClick={() => setNotesOpen((open) => !open)}>
              <span className="inv-sec-ico" aria-hidden="true"><NoteIcon /></span>
              <span>
                <strong>Payment & Notes</strong>
                <small>Public instructions and post-payment redirection</small>
              </span>
              <em aria-hidden="true">{notesOpen ? "▴" : "▾"}</em>
            </button>
            {notesOpen ? (
              <div className="inv-notes-body">
                <label className="inv-field">
                  <span>Payment Redirect URL</span>
                  <input value={redirectUrl} maxLength={300} placeholder="https://" onChange={(event) => setRedirectUrl(event.target.value)} />
                </label>
                <label className="inv-field">
                  <span>Public Notes & Payment Instructions</span>
                  <textarea value={note} rows={3} maxLength={400} onChange={(event) => setNote(event.target.value)} />
                </label>
                <label className="inv-field">
                  <span>Internal Admin Notes</span>
                  <textarea value={privateNote} rows={3} maxLength={400} onChange={(event) => setPrivateNote(event.target.value)} />
                </label>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="inv-build-side">
          <section className="inv-sec">
            <div className="inv-sec-head">
              <span className="inv-sec-ico" aria-hidden="true"><SumIcon /></span>
              <div>
                <h3>Invoice Summary</h3>
                <p>Totals and payment balance breakdown</p>
              </div>
            </div>
            <label className="inv-field">
              <span>Shipping & Handling</span>
              <span className="inv-money">
                <b>{currency}</b>
                <input type="number" min={0} step="0.01" value={shipping} onChange={(event) => { setTotalTouched(false); setShipping(Number(event.target.value)); }} />
              </span>
            </label>
            <label className="inv-field">
              <span>Tax / VAT Total</span>
              <span className="inv-money">
                <b>{currency}</b>
                <input type="number" min={0} step="0.01" value={vat} onChange={(event) => { setVatTouched(true); setTotalTouched(false); setVat(Number(event.target.value)); }} />
              </span>
            </label>
            <label className="inv-field">
              <span>Discount Total</span>
              <span className="inv-money">
                <b>{currency}</b>
                <input type="number" min={0} step="0.01" value={discount} onChange={(event) => { setDiscountTouched(true); setTotalTouched(false); setDiscount(Number(event.target.value)); }} />
              </span>
            </label>
            <label className="inv-field">
              <span>Total Payable Amount <i>*</i></span>
              <span className="inv-money inv-payable">
                <b>{currency}</b>
                <input type="number" min={0} step="0.01" value={total} onChange={(event) => { setTotalTouched(true); setTotal(Number(event.target.value)); }} />
              </span>
              <small>Auto-calculated from items above, or adjust directly.</small>
            </label>
          </section>
          <section className="inv-help">
            <strong>Instant Payment Link</strong>
            <p>Once created, a secure public payment link will be automatically generated. You can copy and share it directly with your customer.</p>
          </section>
        </aside>
      </div>

      {message ? <p className="inv-note">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="inv-build-actions">
        <button className="inv-new" type="button" disabled={busy} onClick={() => save(false)}>{mode === "edit" ? "Save" : "Create"}</button>
        {mode === "create" ? <button className="btn-line" type="button" disabled={busy} onClick={() => save(true)}>Create & create another</button> : null}
        <button className="btn-line" type="button" disabled={busy} onClick={() => router.push("/admin/invoices")}>Cancel</button>
      </div>
    </div>
  );
}

function seed(initial?: InvoiceDraft) {
  const items = initial?.items?.length
    ? initial.items.map((item) => ({ ...item, id: nextId() }))
    : initial
      ? [{ id: nextId(), description: initial.title, quantity: 1, price: Number(initial.total) || 0, discount: 0, vat: 0 }]
      : [blankLine()];
  const shipping = initial?.shipping ?? 0;
  const vat = initial?.vatTotal ?? 0;
  const discount = initial?.discountTotal ?? 0;
  const total = initial ? Number(initial.total) || 0 : 0;
  const auto = figure(items, shipping, 0, 0, false, false);
  return {
    customerName: initial?.customerName ?? "",
    customerEmail: initial?.customerEmail ?? "",
    currency: currencies.includes(initial?.currency ?? "") ? initial!.currency : "BDT",
    dueOn: initial?.dueOn || inAWeek(),
    status: initial?.status === "paid" || initial?.status === "cancelled" ? initial.status : "due",
    items,
    shipping,
    vat,
    discount,
    total,
    vatTouched: Boolean(initial) && Math.abs(vat - auto.vatTotal) > 0.009,
    discountTouched: Boolean(initial) && Math.abs(discount - auto.discountTotal) > 0.009,
    totalTouched: Boolean(initial) && Math.abs(total - auto.payable) > 0.009,
    note: initial?.note ?? "",
    redirectUrl: initial?.redirectUrl ?? "",
    privateNote: initial?.privateNote ?? "",
  };
}

function PersonIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.2" /><path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" /></svg>;
}
function BoxIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z" /><path d="M3 7.5V16.5L12 21l9-4.5V7.5" /><path d="M12 12v9" /></svg>;
}
function NoteIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" /><path d="M14 3.5V9h5.5" /></svg>;
}
function SumIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
}
function CopyIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></svg>;
}
function TrashIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13" /></svg>;
}
