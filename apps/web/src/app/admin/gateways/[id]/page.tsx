"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type GatewayDetail = {
  id: string;
  label: string;
  internalLabel: string;
  logoCaption: string;
  accountNumber: string;
  instructions: string;
  minAmount: string;
  maxAmount: string;
  fixedCharge: string;
  percentageCharge: string;
  fixedDiscount: string;
  percentageDiscount: string;
  qrImage: string;
  verifyBy: string;
  askPayerNumber: boolean;
  checkBalance: boolean;
  payWindow: number;
  uniqueSlots: number;
  uniqueKind: string;
  acceptProof: boolean;
};

type FormState = {
  internalLabel: string;
  logoCaption: string;
  label: string;
  minAmount: string;
  maxAmount: string;
  fixedDiscount: string;
  percentageDiscount: string;
  fixedCharge: string;
  percentageCharge: string;
  qrImage: string;
  accountNumber: string;
  instructions: string;
  verifyBy: string;
  askPayerNumber: boolean;
  checkBalance: boolean;
  payWindow: string;
  uniqueSlots: string;
  uniqueKind: string;
  acceptProof: boolean;
};

function plain(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : "";
}

function markKind(label: string) {
  const value = label.toLowerCase();
  if (value.includes("bkash") || value.includes("bikash")) return "bkash";
  if (value.includes("nagad")) return "nagad";
  if (value.includes("rocket")) return "rocket";
  if (value.includes("upay") || value.includes("upai")) return "upay";
  if (value.includes("qr")) return "banglaqr";
  return "bank";
}

function moneyText(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return amount.toLocaleString("en-US", { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 });
}

function fromDetail(row: GatewayDetail): FormState {
  return {
    internalLabel: row.internalLabel,
    logoCaption: row.logoCaption,
    label: row.label,
    minAmount: plain(row.minAmount),
    maxAmount: plain(row.maxAmount),
    fixedDiscount: plain(row.fixedDiscount),
    percentageDiscount: plain(row.percentageDiscount),
    fixedCharge: plain(row.fixedCharge),
    percentageCharge: plain(row.percentageCharge),
    qrImage: row.qrImage,
    accountNumber: row.accountNumber,
    instructions: row.instructions,
    verifyBy: row.verifyBy,
    askPayerNumber: row.askPayerNumber !== false,
    checkBalance: row.checkBalance !== false,
    payWindow: String(row.payWindow),
    uniqueSlots: String(row.uniqueSlots),
    uniqueKind: row.uniqueKind,
    acceptProof: row.acceptProof,
  };
}

export default function EditGatewayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [tab, setTab] = useState<"account" | "verification">("account");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<GatewayDetail>(`/desk/methods/${params.id}`)
      .then((row) => setForm(fromDetail(row)))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }, [params.id]);

  function patch(next: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...next } : current));
  }

  function readImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Use an image file");
      return;
    }
    if (file.size > 1_200_000) {
      setError("Image must be under 1.2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patch({ qrImage: String(reader.result) });
    reader.readAsDataURL(file);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    if (form.accountNumber.split(/[\s,;]+/).filter(Boolean).length === 0) {
      setTab("account");
      setError("Add at least one account number");
      return;
    }
    setPending(true);
    setError("");
    try {
      await api(`/desk/methods/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: form.label,
          internalLabel: form.internalLabel,
          logoCaption: form.logoCaption,
          accountNumber: form.accountNumber,
          instructions: form.instructions,
          minAmount: Number(form.minAmount),
          maxAmount: Number(form.maxAmount),
          fixedDiscount: Number(form.fixedDiscount || 0),
          percentageDiscount: Number(form.percentageDiscount || 0),
          fixedCharge: Number(form.fixedCharge || 0),
          percentageCharge: Number(form.percentageCharge || 0),
          qrImage: form.qrImage,
          verifyBy: "transaction_id",
          askPayerNumber: form.askPayerNumber,
          checkBalance: form.checkBalance,
          payWindow: Number(form.payWindow),
          acceptProof: form.acceptProof,
        }),
      });
      router.push("/admin/gateways/manual");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  if (!form) return error ? <p className="error">{error}</p> : null;

  const accounts = form.accountNumber.split(/[\s,;]+/).filter(Boolean).length;
  const verify = "Transaction ID";

  return (
    <form className="gw-edit" onSubmit={save}>
      <header className="ogw-head">
        <div className="gif-title">
          <span className={`ogw-mark ogw-mark--${markKind(form.label)}`} aria-hidden>{(form.label || "G").slice(0, 1)}</span>
          <div>
            <p className="ogw-kicker">Manual Gateway</p>
            <h2>Gateway Information</h2>
            <p>{form.label || "Name, limits and how this gateway is matched."}</p>
          </div>
        </div>
        <Link className="ogw-back" href="/admin/gateways/manual">Manual Gateway</Link>
      </header>
      <div className="ogw-stats">
        <article><b>{moneyText(form.minAmount)}</b><small>Minimum</small></article>
        <article><b>{moneyText(form.maxAmount)}</b><small>Maximum</small></article>
        <article><b>{accounts}</b><small>{accounts === 1 ? "Account" : "Accounts"}</small></article>
        <article><b className="gif-stat">{verify}</b><small>Matching</small></article>
      </div>
      <section className="gw-section">
        <div className="gif-section-head">
          <h3>Gateway Information</h3>
          <p className="sub">Basic gateway configuration and settings</p>
        </div>
        <div className="gw-grid">
          <label>
            <span className="gw-label">Label</span>
            <input value={form.internalLabel} onChange={(event) => patch({ internalLabel: event.target.value })} />
            <p className="gw-help">Shown above the account number on checkout. Leave it empty to keep the default line.</p>
          </label>
          <label>
            <span className="gw-label">Logo text</span>
            <input maxLength={80} value={form.logoCaption} onChange={(event) => patch({ logoCaption: event.target.value })} />
            <p className="gw-help">Shown under this gateway's logo on the payment options. bKash, Nagad, Rocket and the others each keep their own line.</p>
          </label>
          <label className="wide">
            <span className="gw-label">Payment rules</span>
            <textarea rows={4} maxLength={2000} value={form.instructions} onChange={(event) => patch({ instructions: event.target.value })} placeholder="How the customer should pay with this gateway" />
            <p className="gw-help">Shown when the customer taps the info button beside this gateway's number. Each gateway keeps its own rules.</p>
          </label>
          <label>
            <span className="gw-label">Display Name<i>*</i></span>
            <input required value={form.label} onChange={(event) => patch({ label: event.target.value })} />
            <p className="gw-help">The name displayed to users during checkout</p>
          </label>
          <label>
            <span className="gw-label">Minimum Amount<i>*</i></span>
            <span className="money"><b>BDT</b><input required type="number" min={0} step="0.01" value={form.minAmount} onChange={(event) => patch({ minAmount: event.target.value })} /></span>
            <p className="gw-help">The minimum transaction amount allowed</p>
          </label>
          <label>
            <span className="gw-label">Maximum Amount<i>*</i></span>
            <span className="money"><b>BDT</b><input required type="number" min={0} step="0.01" value={form.maxAmount} onChange={(event) => patch({ maxAmount: event.target.value })} /></span>
            <p className="gw-help">The maximum transaction amount allowed</p>
          </label>
          <label>
            <span className="gw-label">Fixed Discount<i>*</i></span>
            <span className="money"><b>BDT</b><input required type="number" min={0} step="0.01" value={form.fixedDiscount} onChange={(event) => patch({ fixedDiscount: event.target.value })} /></span>
            <p className="gw-help">Fixed discount amount applied per transaction</p>
          </label>
          <label>
            <span className="gw-label">Percentage Discount<i>*</i></span>
            <span className="money"><input required type="number" min={0} max={100} step="0.01" value={form.percentageDiscount} onChange={(event) => patch({ percentageDiscount: event.target.value })} /><em>%</em></span>
            <p className="gw-help">Percentage discount applied per transaction</p>
          </label>
          <label>
            <span className="gw-label">Fixed Charge<i>*</i></span>
            <span className="money"><b>BDT</b><input required type="number" min={0} step="0.01" value={form.fixedCharge} onChange={(event) => patch({ fixedCharge: event.target.value })} /></span>
            <p className="gw-help">Fixed fee charged per transaction</p>
          </label>
          <label>
            <span className="gw-label">Percentage Charge<i>*</i></span>
            <span className="money"><input required type="number" min={0} max={100} step="0.01" value={form.percentageCharge} onChange={(event) => patch({ percentageCharge: event.target.value })} /><em>%</em></span>
            <p className="gw-help">Percentage fee charged per transaction</p>
          </label>
          <div className="wide">
            <span className="gw-label">QR Code</span>
            <label
              className="drop"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                readImage(event.dataTransfer.files[0]);
              }}
            >
              {form.qrImage ? <img src={form.qrImage} alt="QR code" /> : <span>Drag & Drop your files or <span>Browse</span></span>}
              <input hidden type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0])} />
            </label>
            {form.qrImage ? <button className="edit-link" type="button" onClick={() => patch({ qrImage: "" })}>Remove image</button> : null}
            <p className="gw-help">Upload a QR code image. Crop it down to just the QR code for the most reliable read.</p>
          </div>
        </div>
      </section>

      <section className="gw-section">
        <div className="gif-section-head">
          <h3>Configuration</h3>
          <p className="sub">Gateway-specific configuration parameters</p>
        </div>
        <div className="gw-box">
        <div className="gw-tabs">
          <button className={tab === "account" ? "on" : ""} type="button" onClick={() => setTab("account")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>
            Account
          </button>
          <button className={tab === "verification" ? "on" : ""} type="button" onClick={() => setTab("verification")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></svg>
            Verification
          </button>
        </div>
        {tab === "account" ? (
            <label>
              <span className="gw-label">Account Numbers<i>*</i></span>
              <input required placeholder="01XXXXXXXXX" value={form.accountNumber} onChange={(event) => patch({ accountNumber: event.target.value })} />
              <p className="gw-help">The wallet numbers customers send money to. Add more than one and each checkout is given one of them in turn, spreading payments across your accounts.</p>
            </label>
        ) : null}
        {tab === "verification" ? (
          <div className="gw-grid">
            <label>
              <span className="gw-label">Verification Method<i>*</i></span>
              <input value="Transaction ID" readOnly />
              <p className="gw-help">The customer enters the transaction ID from the payment SMS. The website matches that ID to the SMS, the amount, and the saved balance.</p>
            </label>
            <label>
              <span className="gw-label">Wallet number</span>
              <select value={form.askPayerNumber ? "enable" : "disable"} onChange={(event) => patch({ askPayerNumber: event.target.value === "enable" })}>
                <option value="enable">Enable</option>
                <option value="disable">Disable</option>
              </select>
              <p className="gw-help">On asks the customer for the wallet number they paid from. That number must appear in the payment SMS. Off hides the box and skips that check.</p>
            </label>
            <label>
              <span className="gw-label">Balance verify</span>
              <select value={form.checkBalance ? "enable" : "disable"} onChange={(event) => patch({ checkBalance: event.target.value === "enable" })}>
                <option value="enable">Enable</option>
                <option value="disable">Disable</option>
              </select>
              <p className="gw-help">On: the website reads the payment SMS and approves it only when the balance in that SMS equals the balance saved on the server plus this payment. The phone only delivers the SMS. Off: the balance check is skipped. The transaction ID is still required.</p>
            </label>
            <label>
              <span className="gw-label">Payment Window (Minutes)<i>*</i></span>
              <input required type="number" min={1} max={1440} value={form.payWindow} onChange={(event) => patch({ payWindow: event.target.value })} />
              <p className="gw-help">How long the customer has to pay while the page waits for their deposit. They see a countdown, and a deposit arriving after it is no longer matched to that checkout.</p>
            </label>
            <label>
              <span className="gw-label">Receipt image upload</span>
              <select value={form.acceptProof ? "enable" : "disable"} onChange={(event) => patch({ acceptProof: event.target.value === "enable" })}>
                <option value="disable">Disable</option>
                <option value="enable">Enable</option>
              </select>
              <p className="gw-help">Off unless you enable it. Enable to let the customer upload a receipt image on the checkout. Disable hides that file field.</p>
            </label>
          </div>
        ) : null}
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}
      <div className="gif-actions">
        <Link className="ogw-back" href="/admin/gateways/manual">Cancel</Link>
        <button className="mgw-new" disabled={pending} type="submit">{pending ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  );
}
