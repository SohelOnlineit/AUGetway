"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

type ShopId = "amarpin" | "uniqbd";
type Channel = "sms" | "email";

type Preview = {
  name: string;
  phone: string | null;
  email: string | null;
  orderNumber: string;
  product: string;
};

type Audience = {
  scanned: number;
  orders: number;
  phoneCount: number;
  emailCount: number;
  phones: Preview[];
  emails: Preview[];
  products: Array<{ id: string; title: string }>;
  bulkLimit: number;
};

type SendResult = {
  ok: boolean;
  sent: number;
  failed: number;
  remaining: number;
  message: string;
};

const SHOPS: Array<{ id: ShopId; label: string; domain: string }> = [
  { id: "amarpin", label: "AuGetway", domain: "amarpin.com" },
  { id: "uniqbd", label: "UniQbd", domain: "uniqbd.com" },
];

export default function CustomerMessagesPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [channel, setChannel] = useState<Channel>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("channel") === "email"
      ? "email"
      : "sms",
  );
  const [shop, setShop] = useState<ShopId>("amarpin");
  const [productId, setProductId] = useState("");
  const [audience, setAudience] = useState<Audience | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sms, setSms] = useState("Hi {name}, your {product} order {order} is ready.");
  const [subject, setSubject] = useState("Your {product} order");
  const [body, setBody] = useState("Hi {name},\n\nYour order {order} for {product} has an update.");
  const [pendingSms, setPendingSms] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const query = productId ? `?productId=${encodeURIComponent(productId)}` : "";
      const result = await adminFetch<Audience>(`/customer-messages${query}`);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAudience(result.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, sessionError, productId]);

  const site = SHOPS.find((item) => item.id === shop)!;
  const pending = channel === "sms" ? pendingSms : pendingEmail;
  const people = channel === "sms" ? audience?.phones ?? [] : audience?.emails ?? [];
  const selected = people.find((row) => (channel === "sms" ? row.phone === phone : row.email === email));
  const previewPerson = selected ?? { name: "Customer", product: productLabel(audience, productId), orderNumber: "AP-1001" };

  function chooseChannel(next: Channel) {
    setChannel(next);
    setNotice(null);
    setError(null);
    window.history.replaceState(null, "", next === "email" ? "/admin/messages?channel=email" : "/admin/messages");
  }

  function choosePerson(row: Preview) {
    if (channel === "sms") setPhone(row.phone || "");
    else setEmail(row.email || "");
    setNotice(null);
    setError(null);
  }

  async function send(path: string, payload: Record<string, string>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const smsSend = path.includes("/sms");
    if (smsSend) setPendingSms(true);
    else setPendingEmail(true);
    setError(null);
    setNotice(null);
    const result = await adminFetch<SendResult>(path, {
      method: "POST",
      body: JSON.stringify({
        shop,
        ...(productId ? { productId } : {}),
        ...payload,
      }),
    });
    if (smsSend) setPendingSms(false);
    else setPendingEmail(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (!result.data.ok) {
      setError(result.data.message);
      return;
    }
    setNotice(result.data.message);
  }

  return (
    <AdminShell title="Customer messages" permissions={permissions} bare>
      {!audience ? (
        <p className="sms-loading">{sessionError || error ? "" : "Loading customers from orders…"}</p>
      ) : (
        <div className="sms-page">
          <header className="sms-hero">
            <span className="sms-hero-icon" aria-hidden>
              <span className="sms-ring" />
              {channel === "email" ? <MailIcon /> : <PhoneIcon />}
            </span>
            <div>
              <p>Settings</p>
              <h1>{channel === "email" ? "Customer email" : "Customer SMS"}</h1>
              <p>
                {channel === "email"
                  ? `Write once. ${site.label} sends it to one address, or to everyone who bought the product.`
                  : `Write once. ${site.label} sends it to one mobile number, or to everyone who bought the product.`}
              </p>
            </div>
          </header>

          {sessionError || error ? <p className="msg-banner is-bad">{sessionError || error}</p> : null}
          {notice ? <p className="msg-banner is-ok">{notice}</p> : null}

          <div className="msg-switch" role="tablist" aria-label="Message type">
            <button type="button" role="tab" aria-selected={channel === "sms"} className={channel === "sms" ? "is-on" : ""} onClick={() => chooseChannel("sms")}>
              <span className="msg-mark" aria-hidden><PhoneIcon /></span>
              <span>
                <strong>SMS</strong>
                <em>{audience.phoneCount} unique mobile numbers</em>
              </span>
            </button>
            <button type="button" role="tab" aria-selected={channel === "email"} className={channel === "email" ? "is-on" : ""} onClick={() => chooseChannel("email")}>
              <span className="msg-mark" aria-hidden><MailIcon /></span>
              <span>
                <strong>Email</strong>
                <em>{audience.emailCount} unique email addresses</em>
              </span>
            </button>
          </div>

          <div className="sms-shops" role="tablist" aria-label="Site">
            {SHOPS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === shop}
                className={item.id === shop ? "is-on" : ""}
                onClick={() => {
                  setShop(item.id);
                  setNotice(null);
                  setError(null);
                }}
              >
                <span className={`sms-mark sms-mark--${item.id}`} aria-hidden>
                  <span className="sms-ring" />
                  {channel === "email" ? <MailIcon /> : <PhoneIcon />}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <em>{item.domain} sends this batch</em>
                </span>
              </button>
            ))}
          </div>

          <div className="msg-board">
            <aside className="msg-side">
              <div>
                <h2>From orders</h2>
                <p>The latest {audience.scanned} orders. Pick a product to narrow the list.</p>
              </div>
              <label className="field">
                Product
                <select value={productId} onChange={(event) => setProductId(event.target.value)}>
                  <option value="">All products</option>
                  {audience.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="msg-counts">
                <article>
                  <span>Orders</span>
                  <strong>{audience.orders}</strong>
                </article>
                <article>
                  <span>{channel === "sms" ? "Mobile numbers" : "Email addresses"}</span>
                  <strong>{channel === "sms" ? audience.phoneCount : audience.emailCount}</strong>
                </article>
                <article>
                  <span>Each bulk send</span>
                  <strong>{audience.bulkLimit}</strong>
                </article>
              </div>
            </aside>

            <section className="msg-composer">
              <div>
                <h2>{channel === "sms" ? `SMS · ${site.label}` : `Email · ${site.label}`}</h2>
                <p className="msg-lead">{"{name}"}, {"{product}"}, and {"{order}"} are filled from each customer's order.</p>
              </div>
              <div className="msg-preview">
                <span>Preview</span>
                {channel === "email" ? <strong>{fill(subject, previewPerson) || "Subject"}</strong> : null}
                <p>{fill(channel === "sms" ? sms : body, previewPerson) || "Your message appears here."}</p>
              </div>
              {channel === "sms" ? (
                <form
                  className="sms-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send("/customer-messages/sms", { phone, message: sms });
                  }}
                >
                  <label className="field">
                    Message
                    <textarea value={sms} onChange={(event) => setSms(event.target.value)} required maxLength={640} rows={4} />
                  </label>
                  <label className="field">
                    One mobile number
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" maxLength={30} />
                  </label>
                  <People
                    rows={audience.phones}
                    picked={phone}
                    empty="No mobile numbers for this product yet."
                    onPick={choosePerson}
                    value={(row) => row.phone || ""}
                  />
                  <div className="msg-actions">
                    <button type="submit" className="primary-btn" disabled={pending || !phone.trim()}>
                      {pending ? "Sending…" : "Send one SMS"}
                    </button>
                    <button
                      type="button"
                      className="sms-quiet"
                      disabled={pending || audience.phoneCount === 0}
                      onClick={() =>
                        void send(
                          "/customer-messages/sms-bulk",
                          { message: sms },
                          `Send this SMS to ${Math.min(audience.phoneCount, audience.bulkLimit)} mobile numbers through ${site.label}?`,
                        )
                      }
                    >
                      Send bulk SMS ({Math.min(audience.phoneCount, audience.bulkLimit)})
                    </button>
                  </div>
                </form>
              ) : (
                <form
                  className="sms-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send("/customer-messages/email", { email, subject, message: body });
                  }}
                >
                  <label className="field">
                    Subject
                    <input value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={140} />
                  </label>
                  <label className="field">
                    Message
                    <textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={4000} rows={5} />
                  </label>
                  <label className="field">
                    One email address
                    <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@email.com" maxLength={120} />
                  </label>
                  <People
                    rows={audience.emails}
                    picked={email}
                    empty="No email addresses for this product yet."
                    onPick={choosePerson}
                    value={(row) => row.email || ""}
                  />
                  <div className="msg-actions">
                    <button type="submit" className="primary-btn" disabled={pending || !email.trim()}>
                      {pending ? "Sending…" : "Send one email"}
                    </button>
                    <button
                      type="button"
                      className="sms-quiet"
                      disabled={pending || audience.emailCount === 0}
                      onClick={() =>
                        void send(
                          "/customer-messages/email-bulk",
                          { subject, message: body },
                          `Send this email to ${Math.min(audience.emailCount, audience.bulkLimit)} addresses through ${site.label}?`,
                        )
                      }
                    >
                      Send bulk email ({Math.min(audience.emailCount, audience.bulkLimit)})
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function People({
  rows,
  picked,
  empty,
  onPick,
  value,
}: {
  rows: Preview[];
  picked: string;
  empty: string;
  onPick: (row: Preview) => void;
  value: (row: Preview) => string;
}) {
  if (!rows.length) return <p className="msg-empty">{empty}</p>;
  return (
    <ul className="msg-people">
      {rows.map((row) => {
        const current = value(row);
        return (
          <li key={`${row.orderNumber}-${current}`}>
            <button type="button" className={current === picked ? "msg-person is-on" : "msg-person"} onClick={() => onPick(row)}>
              <strong>{current}</strong>
              <em>{row.name} · {row.product || row.orderNumber}</em>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function fill(template: string, row: { name: string; product: string; orderNumber: string }) {
  return template
    .replaceAll("{name}", row.name || "Customer")
    .replaceAll("{product}", row.product || "gift card")
    .replaceAll("{order}", row.orderNumber || "");
}

function productLabel(audience: Audience | null, productId: string) {
  return audience?.products.find((item) => item.id === productId)?.title || "gift card";
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}
