"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminCustomerDetail, AdminOrderDetail, OrderStatusPublic } from "@amarpin/types";
import { ManualGiftDelivery } from "@/components/admin/ManualGiftDelivery";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";
import { formatBangladeshDateTime } from "@/lib/datetime";

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [customer, setCustomer] = useState<AdminCustomerDetail | null>(null);
  const [nextStatus, setNextStatus] = useState<OrderStatusPublic | "">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteDetail, setNoteDetail] = useState<string | null>(null);
  const [noteSent, setNoteSent] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);
  const [pending, setPending] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingInput, setSavingInput] = useState(false);
  const [addedUnits, setAddedUnits] = useState<Array<{ id: string; packageValueId: string | null }>>([]);
  const [stockRevision, setStockRevision] = useState(0);
  const canWrite = can(permissions, "admin:orders:write");
  function copyField(key: string, value: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedKey(null), 1600);
    });
  }

  const onAddedUnits = useCallback(
    (items: Array<{ id: string; packageValueId: string | null }>) => setAddedUnits(items),
    [],
  );

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    void (async () => {
      const result = await adminFetch<AdminOrderDetail>(`/orders/${params.id}`);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOrder(result.data);
      setNextStatus(result.data.status);
      const profile = await adminFetch<AdminCustomerDetail>(`/customers/${result.data.customerId}`);
      if (!cancelled && profile.ok) setCustomer(profile.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, params.id, sessionError]);

  async function updateStatus() {
    if (!order) return;
    const delivering = nextStatus === "FULFILLED" && addedUnits.length > 0;
    if (nextStatus === order.status && !delivering) {
      setError(null);
      setNotice(`Order is already ${statusLabel(order.status).toLowerCase()}.`);
      return;
    }
    setPending(true);
    const result = await adminFetch<AdminOrderDetail>(`/orders/${order.id}/actions`, {
      method: "POST",
      body: JSON.stringify({
        action: "SET_STATUS",
        status: nextStatus,
        inventoryItems: nextStatus === "FULFILLED"
          ? addedUnits.map((item) => ({
              id: item.id,
              packageValueId: item.packageValueId ?? undefined,
            }))
          : undefined,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const attached = (result.data.giftCards?.length ?? 0) > (order.giftCards?.length ?? 0);
    setOrder(result.data);
    setNextStatus(result.data.status);
    if (result.data.status === "FULFILLED") setStockRevision((value) => value + 1);
    setError(null);
    setNotice(
      attached
        ? "Cards stay on this order. They left the available list and moved to sold stock."
        : `Order status set to ${statusLabel(result.data.status)}.`,
    );
  }

  async function sendNote() {
    if (!order) return;
    const message = note.trim();
    if (!message) {
      setNoteSent(false);
      setNoteDetail("Write a message before sending the note.");
      return;
    }
    setSendingNote(true);
    const result = await adminFetch<{ delivered: boolean; detail: string }>(`/orders/${order.id}/customer-note`, {
      method: "POST",
      body: JSON.stringify({ senderType: "Orders", message }),
    });
    setSendingNote(false);
    if (!result.ok) {
      setNoteSent(false);
      setNoteDetail(result.message);
      return;
    }
    setNoteSent(result.data.delivered);
    setNoteDetail(result.data.detail);
    if (result.data.delivered) setNote("");
  }

  async function saveCustomerInput(itemId: string, index: number) {
    if (!order) return;
    const value = editValue.trim();
    if (!value) {
      setNotice(null);
      setError("Enter a value before saving.");
      return;
    }
    setSavingInput(true);
    const result = await adminFetch<AdminOrderDetail>(
      `/orders/${order.id}/items/${itemId}/customer-inputs`,
      { method: "PATCH", body: JSON.stringify({ index, value }) },
    );
    setSavingInput(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOrder(result.data);
    setEditKey(null);
    setError(null);
    setNotice("Customer answer updated.");
  }

  const name = customer?.displayName?.trim() || order?.customerName?.trim() || order?.customerEmail.split("@")[0] || "";
  const history = customer?.recentOrders ?? [];
  const revenue = history.reduce((sum, item) => sum + item.totalMinor, 0);

  return (
    <AdminShell title="Order" permissions={permissions} bare>
      <div className="order-view">
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {notice ? <p className="form-success">{notice}</p> : null}
        {!order ? <p className="manual-help">Loading order…</p> : null}
        {order ? (
          <>
          <header className="order-hero">
            <div>
              <h1>Order #{orderLabel(order.orderNumber)}</h1>
              <p>{formatBangladeshDateTime(order.createdAt)} · {originLabel(order.origin)}</p>
            </div>
            <Link href="/admin/orders">← Orders</Link>
          </header>
          <div className="order-view-grid">
            <div>
              <section className="order-card order-items">
                <header>
                  <span><BagIcon /></span>
                  <div>
                    <h2>Order items</h2>
                    <p>{order.items.length} product{order.items.length === 1 ? "" : "s"} in this order</p>
                  </div>
                </header>
                <div className="order-lines">
                  {order.items.map((item) => (
                    <article key={item.id}>
                      <div className="order-line-top">
                        <span className="order-line-thumb">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt="" />
                          ) : (
                            <BagIcon />
                          )}
                        </span>
                        <div className="order-line-copy">
                          <strong>{item.titleSnapshot}</strong>
                          <ul>
                            {item.region ? (
                              <li>
                                Region <b>{item.region}</b>
                              </li>
                            ) : null}
                            {item.packageName ? (
                              <li>
                                Gift Card Amount <b>{item.packageName}</b>
                              </li>
                            ) : null}
                            <li>
                              Quantity <b>{item.quantity}</b>
                            </li>
                            {item.deliveryLabel ? <li>{item.deliveryLabel}</li> : null}
                          </ul>
                        </div>
                        <div className="order-line-prices">
                          <span>
                            {taka(item.unitPriceMinor)}
                            <em>× {item.quantity}</em>
                          </span>
                          <b>{taka(item.lineTotalMinor)}</b>
                        </div>
                      </div>
                      {(item.customerInputs ?? []).length ? (
                        <div className="order-line-fields">
                          {item.customerInputs.map((input, index) => {
                            const key = `${item.id}:${index}`;
                            const editing = editKey === key;
                            const copied = copiedKey === key;
                            return (
                              <label key={key}>
                                <span>{input.label}</span>
                                <div>
                                  <input
                                    readOnly={!editing}
                                    value={editing ? editValue : input.value}
                                    autoFocus={editing}
                                    onChange={(event) => setEditValue(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") void saveCustomerInput(item.id, index);
                                      if (event.key === "Escape") setEditKey(null);
                                    }}
                                  />
                                  {canWrite ? (
                                    <button
                                      type="button"
                                      disabled={savingInput}
                                      aria-label={editing ? `Save ${input.label}` : `Edit ${input.label}`}
                                      onClick={() => {
                                        if (editing) {
                                          void saveCustomerInput(item.id, index);
                                          return;
                                        }
                                        setEditKey(key);
                                        setEditValue(input.value);
                                      }}
                                    >
                                      {editing ? <CheckIcon /> : <PencilIcon />}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className={copied ? "is-copied" : undefined}
                                    aria-label={copied ? "Copied" : `Copy ${input.label}`}
                                    onClick={() => void copyField(key, editing ? editValue : input.value)}
                                  >
                                    {copied ? <CheckIcon /> : <CopyIcon />}
                                  </button>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
                <div className="order-items-foot">
                  <p>
                    <span>Items Subtotal:</span>
                    <b>{taka(order.subtotalMinor)}</b>
                  </p>
                  {order.subtotalMinor > order.totalMinor ? (
                    <p>
                      <span>Discount:</span>
                      <b>−{taka(order.subtotalMinor - order.totalMinor)}</b>
                    </p>
                  ) : null}
                  <p className="is-strong">
                    <span>Order Total:</span>
                    <b>{taka(order.totalMinor)}</b>
                  </p>
                  <p className="is-strong">
                    <span>Paid:</span>
                    <b>{order.paidAt ? taka(order.totalMinor) : taka(0)}</b>
                  </p>
                  <small>
                    {order.paidAt
                      ? `${formatBangladeshDateTime(order.paidAt)}${order.paymentMethod ? ` via ${order.paymentMethod}` : ""}${order.transactionId ? ` · ${order.transactionId}` : ""}`
                      : "Not paid"}
                  </small>
                </div>
              </section>

              <ManualGiftDelivery
                orderId={order.id}
                onAddedUnits={onAddedUnits}
                onOrderChange={(next) => {
                  setOrder(next);
                  setStockRevision((value) => value + 1);
                }}
                savedCards={order.giftCards ?? []}
                stockRevision={stockRevision}
              />

              <section className="order-card order-note">
                <header>
                  <span><MailIcon /></span>
                  <h2>Customer note</h2>
                </header>
                <label>
                  Message
                  <textarea
                    value={note}
                    rows={5}
                    placeholder="Select a saved note above or write your own message..."
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <button type="button" className="order-note-send" disabled={!canWrite || sendingNote} onClick={() => void sendNote()}>
                  {sendingNote ? "Sending…" : "Send Note To Customer"}
                </button>
                {noteDetail ? <p className={noteSent ? "form-success" : "form-error"}>{noteDetail}</p> : null}
              </section>
            </div>

            <aside>
              <section className="order-card">
                <header>
                  <span><CheckIcon /></span>
                  <h2>Order status</h2>
                </header>
                <p className="orders-kicker">Status</p>
                <span className={`orders-pill orders-pill--${pillKey(order.status)}`}>{statusLabel(order.status)}</span>
                <label>
                  Change
                  <FilterMenu
                    label="Change status"
                    value={nextStatus}
                    onChange={(value) => setNextStatus(value as OrderStatusPublic)}
                    options={statusChoices(order.status).map(([value, label]) => ({ value, label }))}
                  />
                </label>
                <div className="order-status-actions">
                  <button type="button" disabled={!canWrite || pending} onClick={() => void updateStatus()}>
                    <UpdateStatusIcon />
                    {pending ? "Updating…" : "Update Status"}
                  </button>
                  <button type="button" className="is-danger" onClick={() => setNotice("Orders are not moved to trash. Cancel a pending order instead.")}>
                    <TrashIcon />
                    Move to trash
                  </button>
                </div>
              </section>
              <section className="order-card">
                <header>
                  <span><HistoryIcon /></span>
                  <h2>Customer history</h2>
                </header>
                <dl className="order-side-list">
                  <div><dt>Total orders</dt><dd>{customer?.orderCount ?? order.itemCount}</dd></div>
                  <div><dt>Total revenue</dt><dd>{taka(revenue || order.totalMinor)}</dd></div>
                  <div><dt>Average order value</dt><dd>{taka(customer?.orderCount ? Math.round(revenue / customer.orderCount) : order.totalMinor)}</dd></div>
                </dl>
              </section>

              <section className="order-card">
                <header>
                  <span><CardIcon /></span>
                  <div>
                    <h2>Payment details</h2>
                    <p>{order.paidAt ? "Paid" : statusLabel(order.status)}</p>
                  </div>
                </header>
                <div className="order-customer">
                  <div>
                    <small>Payment method</small>
                    <strong>{order.paymentMethod || "—"}</strong>
                  </div>
                  <div>
                    <small>Transaction ID</small>
                    <strong className="order-trx">{order.transactionId || "—"}</strong>
                    {order.transactionId ? (
                      <button
                        type="button"
                        className={copiedKey === "transaction-id" ? "is-copied" : undefined}
                        aria-label={copiedKey === "transaction-id" ? "Copied" : "Copy transaction ID"}
                        onClick={() => copyField("transaction-id", order.transactionId || "")}
                      >
                        {copiedKey === "transaction-id" ? <CheckIcon /> : <CopyIcon />}
                      </button>
                    ) : null}
                  </div>
                  <div>
                    <small>Paid on</small>
                    <strong>{order.paidAt ? formatBangladeshDateTime(order.paidAt) : "Not paid"}</strong>
                  </div>
                  <div>
                    <small>Deliveries recorded</small>
                    <strong>{order.deliveryCount} · codes hidden</strong>
                  </div>
                </div>
              </section>

              <section className="order-card">
                <header>
                  <span><UserIcon /></span>
                  <div>
                    <h2>Customer details</h2>
                  </div>
                  <Link href={`/admin/customers/${order.customerId}`}>View customer →</Link>
                </header>
                <div className="order-customer">
                  <div>
                    <small>Customer name</small>
                    <strong>{name}</strong>
                  </div>
                  <div>
                    <small>Contact number</small>
                    <strong>{customer?.phoneMasked || "—"}</strong>
                    {customer?.phoneMasked ? (
                      <button
                        type="button"
                        className={copiedKey === "customer-phone" ? "is-copied" : undefined}
                        aria-label={copiedKey === "customer-phone" ? "Copied" : "Copy contact number"}
                        onClick={() => copyField("customer-phone", customer.phoneMasked || "")}
                      >
                        {copiedKey === "customer-phone" ? <CheckIcon /> : <CopyIcon />}
                      </button>
                    ) : null}
                  </div>
                  <div>
                    <small>Contact email</small>
                    <strong>{order.customerEmail}</strong>
                    <button
                      type="button"
                      className={copiedKey === "customer-email" ? "is-copied" : undefined}
                      aria-label={copiedKey === "customer-email" ? "Copied" : "Copy contact email"}
                      onClick={() => copyField("customer-email", order.customerEmail)}
                    >
                      {copiedKey === "customer-email" ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                </div>
              </section>

              <section className="order-card">
                <header>
                  <span><PinIcon /></span>
                  <h2>Order origin</h2>
                </header>
                <dl className="order-side-list">
                  <div><dt>Origin</dt><dd>{originLabel(order.origin)}</dd></div>
                  <div><dt>Web Domain</dt><dd>{order.webDomain}</dd></div>
                  <div><dt>Customer</dt><dd>{name}</dd></div>
                  <div><dt>Fulfillment</dt><dd>{order.fulfillmentStatus.replaceAll("_", " ")}</dd></div>
                </dl>
              </section>
            </aside>
          </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}

function statusChoices(current: OrderStatusPublic): Array<[OrderStatusPublic, string]> {
  const choices: Array<[OrderStatusPublic, string]> = [
    ["PENDING_PAYMENT", "Pending"],
    ["PAID", "Paid"],
    ["FULFILLED", "Completed"],
    ["CANCELLED", "Cancelled"],
    ["REFUNDED", "Refunded"],
  ];
  if (choices.some(([value]) => value === current)) return choices;
  return [[current, statusLabel(current)], ...choices];
}

function originLabel(origin: string) {
  if (!origin || origin === "DIRECT") return "Direct";
  if (origin === "WALLET") return "Wallet";
  return origin;
}

function statusLabel(status: OrderStatusPublic) {
  if (status === "PENDING_PAYMENT") return "Pending";
  if (status === "PAID") return "Paid";
  if (status === "FULFILLED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  return "Refunded";
}

function pillKey(status: OrderStatusPublic) {
  if (status === "PENDING_PAYMENT") return "pending";
  if (status === "PAID") return "paid";
  if (status === "FULFILLED") return "completed";
  if (status === "CANCELLED") return "cancelled";
  return "refunded";
}

function orderLabel(value: string) {
  return value.replace(/^#/, "").replace(/^UQ-/i, "");
}

function taka(minor: number) {
  const major = minor / 100;
  return `${Number.isInteger(major) ? major.toLocaleString("en-US") : major.toFixed(2)}৳`;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 20h4l10.2-10.2a1.8 1.8 0 0 0 0-2.6l-1.4-1.4a1.8 1.8 0 0 0-2.6 0L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m12.8 6.2 5 5" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 15.5H5.5A1.5 1.5 0 0 1 4 14V5.5A1.5 1.5 0 0 1 5.5 4H14a1.5 1.5 0 0 1 1.5 1.5V6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6.5 8.5h11l-.8 10.2a1.5 1.5 0 0 1-1.5 1.3H8.8a1.5 1.5 0 0 1-1.5-1.3L6.5 8.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 18.5c1.4-2.6 3.6-3.8 6.5-3.8s5.1 1.2 6.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4.5 7 7.5 6 7.5-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 7.5h14M9.2 7.4V5.8A1.3 1.3 0 0 1 10.5 4.5h3a1.3 1.3 0 0 1 1.3 1.3v1.6M8 7.5l.7 11.1a1.4 1.4 0 0 0 1.4 1.3h3.8a1.4 1.4 0 0 0 1.4-1.3L16 7.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function UpdateStatusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.22" />
      <path d="m7.6 12.2 2.8 2.8 6-6.2" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8.2 12.2 2.4 2.4 5-5.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 12a7 7 0 1 0 2-4.9M5 5v3.5H8.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="11" r="1.6" fill="currentColor" />
    </svg>
  );
}
