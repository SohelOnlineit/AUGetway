"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type GatewayDetail = {
  id: string;
  label: string;
  internalLabel: string;
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
  payWindow: number;
  uniqueSlots: number;
  uniqueKind: string;
  acceptProof: boolean;
  holdUnmatched: boolean;
  holdAbove: string;
  underTolerance: string;
  overTolerance: string;
};

type FormState = {
  internalLabel: string;
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
  payWindow: string;
  uniqueSlots: string;
  uniqueKind: string;
  acceptProof: boolean;
  holdUnmatched: boolean;
  holdAbove: string;
  underTolerance: string;
  overTolerance: string;
};

function plain(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : "";
}

function slotHelp() {
  const sample = [0, 1, 2].map((index) => (100 + index * 0.01).toFixed(2)).join(", ");
  return `The first checkout shows the invoice amount. Each later checkout of that same amount adds 0.01, up to 500 at once. Example: ${sample}.`;
}

function fromDetail(row: GatewayDetail): FormState {
  return {
    internalLabel: row.internalLabel,
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
    payWindow: String(row.payWindow),
    uniqueSlots: String(row.uniqueSlots),
    uniqueKind: row.uniqueKind,
    acceptProof: row.acceptProof,
    holdUnmatched: row.holdUnmatched,
    holdAbove: plain(row.holdAbove),
    underTolerance: plain(row.underTolerance),
    overTolerance: plain(row.overTolerance),
  };
}

export default function EditGatewayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [tab, setTab] = useState<"account" | "verification" | "advanced">("account");
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
          accountNumber: form.accountNumber,
          instructions: form.instructions,
          minAmount: Number(form.minAmount),
          maxAmount: Number(form.maxAmount),
          fixedDiscount: Number(form.fixedDiscount || 0),
          percentageDiscount: Number(form.percentageDiscount || 0),
          fixedCharge: Number(form.fixedCharge || 0),
          percentageCharge: Number(form.percentageCharge || 0),
          qrImage: form.qrImage,
          verifyBy: form.verifyBy,
          payWindow: Number(form.payWindow),
          uniqueSlots: Number(form.uniqueSlots),
          uniqueKind: form.uniqueKind,
          acceptProof: form.acceptProof,
          holdUnmatched: form.holdUnmatched,
          holdAbove: Number(form.holdAbove || 0),
          underTolerance: Number(form.underTolerance || 0),
          overTolerance: Number(form.overTolerance || 0),
        }),
      });
      router.push("/admin/gateways");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  if (!form) return error ? <p className="error">{error}</p> : null;

  return (
    <form className="gw-edit" onSubmit={save}>
      <section className="gw-section">
        <h3>Gateway Information</h3>
        <p className="sub">Basic gateway configuration and settings</p>
        <div className="gw-grid">
          <label>
            <span className="gw-label">Label</span>
            <input value={form.internalLabel} onChange={(event) => patch({ internalLabel: event.target.value })} />
            <p className="gw-help">Shown above the account number on checkout. Leave it empty to keep the default line.</p>
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
        <h3>Configuration</h3>
        <p className="sub">Gateway-specific configuration parameters</p>
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
          <button className={tab === "advanced" ? "on" : ""} type="button" onClick={() => setTab("advanced")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="8" cy="7" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="10" cy="17" r="2" fill="currentColor" /></svg>
            Advanced
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
              <select value={form.verifyBy} onChange={(event) => patch({ verifyBy: event.target.value })}>
                <option value="transaction_id">Transaction ID</option>
                <option value="sender_number">Sender number</option>
                <option value="unique_amount">Unique amount</option>
              </select>
              <p className="gw-help">How the customer is matched to their deposit. Every option is matched against your recorded SMS automatically; they differ in what the customer gives you, and when.</p>
            </label>
            <label>
              <span className="gw-label">Payment Window (Minutes)<i>*</i></span>
              <input required type="number" min={1} max={1440} value={form.payWindow} onChange={(event) => patch({ payWindow: event.target.value })} />
              <p className="gw-help">How long the customer has to pay while the page waits for their deposit. They see a countdown, and a deposit arriving after it is no longer matched to that checkout.</p>
            </label>
            {form.verifyBy === "unique_amount" ? (
              <>
                <label>
                  <span className="gw-label">Unique Amount Type<i>*</i></span>
                  <select value={form.uniqueKind} onChange={(event) => patch({ uniqueKind: event.target.value })}>
                    <option value="integer">Integer (e.g. 11)</option>
                    <option value="decimal">Decimal (e.g. 100.04)</option>
                  </select>
                  <p className="gw-help">The first customer pays the invoice amount. Each later customer with the same amount pays 0.01 more, and the checkout verifies itself when an SMS arrives for that exact amount.</p>
                </label>
                <label>
                  <span className="gw-label">Unique Amount Slots<i>*</i></span>
                  <input required type="number" min={1} max={40} value={form.uniqueSlots} onChange={(event) => patch({ uniqueSlots: event.target.value })} />
                  <p className="gw-help">{slotHelp()}</p>
                </label>
              </>
            ) : null}
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
        {tab === "advanced" ? (
          <div className="gw-grid">
            <label>
              <span className="gw-label">Enable Pending Payment</span>
              <select value={form.holdUnmatched ? "enable" : "disable"} onChange={(event) => patch({ holdUnmatched: event.target.value === "enable" })}>
                <option value="" disabled>Select an option</option>
                <option value="disable">Disable</option>
                <option value="enable">Enable</option>
              </select>
              <p className="gw-help">What to do when a customer submits a transaction ID that matches none of your recorded SMS. Enable to keep the ID and hold the payment as Pending for you to check; disable to tell the customer it was not found.</p>
            </label>
            <label>
              <span className="gw-label">Auto-Pending Above Amount</span>
              <input type="number" min={0} step="0.01" placeholder="" value={Number(form.holdAbove) === 0 ? "" : form.holdAbove} onChange={(event) => patch({ holdAbove: event.target.value })} />
              <p className="gw-help">Hold payments larger than this for your approval instead of completing them at once. Leave at 0 to complete every matched payment.</p>
            </label>
            <label>
              <span className="gw-label">Underpaid Tolerance</span>
              <input type="number" min={0} step="0.01" value={Number(form.underTolerance) === 0 ? "" : form.underTolerance} onChange={(event) => patch({ underTolerance: event.target.value })} />
              <p className="gw-help">How much less than the invoice you will still accept. Leave at 0 to refuse any shortfall.</p>
            </label>
            <label>
              <span className="gw-label">Overpaid Tolerance</span>
              <input type="number" min={0} step="0.01" value={Number(form.overTolerance) === 0 ? "" : form.overTolerance} onChange={(event) => patch({ overTolerance: event.target.value })} />
              <p className="gw-help">How much more than the invoice you will still accept. Unlike the field beside it, 0 means no limit — any overpayment is accepted.</p>
            </label>
          </div>
        ) : null}
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}
      <div className="row">
        <button className="btn" disabled={pending} type="submit">Save changes</button>
        <Link className="btn btn-quiet" href="/admin/gateways">Cancel</Link>
      </div>
    </form>
  );
}
