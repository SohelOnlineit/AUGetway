"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export type LinkField = { label: string; type: "text" | "email" | "phone" | "number" | "textarea"; required: boolean };

export type LinkDraft = {
  slug: string;
  title: string;
  detail: string;
  amount: string;
  currency: string;
  active: boolean;
  quantity: number;
  expireOn: string;
  redirectUrl: string;
  image: string;
  fields: LinkField[];
};

type FieldRow = LinkField & { id: string };

const currencies = ["BDT", "USD", "EUR", "GBP"] as const;
const marks: Record<string, string> = { BDT: "৳", USD: "$", EUR: "€", GBP: "£" };
const fieldTypes = [
  ["text", "Text"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["number", "Number"],
  ["textarea", "Textarea"],
] as const;

let fieldSeed = 1;
function nextId() {
  fieldSeed += 1;
  return `field-${fieldSeed}`;
}

export function LinkForm({ mode, initial }: { mode: "create" | "edit"; initial?: LinkDraft }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [currency, setCurrency] = useState(currencies.includes(initial?.currency as (typeof currencies)[number]) ? initial!.currency : "BDT");
  const [amount, setAmount] = useState(initial ? Number(initial.amount) || 0 : 0);
  const [expireOn, setExpireOn] = useState(initial?.expireOn ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [redirectUrl, setRedirectUrl] = useState(initial?.redirectUrl ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [suffix] = useState(() => Math.random().toString(16).slice(2, 6));
  const [image, setImage] = useState(initial?.image ?? "");
  const [fields, setFields] = useState<FieldRow[]>((initial?.fields ?? []).map((field) => ({ ...field, id: nextId() })));
  const [dragging, setDragging] = useState(false);
  const [host, setHost] = useState("your-domain");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  function onTitle(value: string) {
    setTitle(value);
    if (mode === "create" && !slugTouched) {
      const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      setSlug(base ? `${base}-${suffix}` : "");
    }
  }

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setImage(await shrinkImage(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read image");
    }
  }

  function reset() {
    setTitle("");
    setQuantity(1);
    setDetail("");
    setCurrency("BDT");
    setAmount(0);
    setExpireOn("");
    setActive(true);
    setRedirectUrl("");
    setSlug("");
    setSlugTouched(false);
    setImage("");
    setFields([]);
  }

  async function save(again: boolean) {
    const name = title.trim();
    const description = detail.trim();
    const price = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
    const count = Math.max(1, Math.round(Number.isFinite(quantity) ? quantity : 1));
    const redirect = redirectUrl.trim();
    const custom = slug.trim().toLowerCase();
    if (name.length < 2) {
      setError("Product name needs at least 2 characters");
      return;
    }
    if (description.length < 2) {
      setError("Add a product description");
      return;
    }
    if (price < 1 || price > 250000) {
      setError("Amount must be between 1 and 250,000");
      return;
    }
    if (price * count > 250000) {
      setError("Quantity times amount cannot pass 250,000");
      return;
    }
    if (redirect && !/^https?:\/\//i.test(redirect)) {
      setError("Redirect URL must start with http:// or https://");
      return;
    }
    if (custom && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(custom)) {
      setError("Slug can use lowercase letters, numbers, and dashes");
      return;
    }
    if (fields.some((field) => !field.label.trim())) {
      setError("Each customer field needs a label");
      return;
    }
    const body: Record<string, unknown> = {
      title: name,
      detail: description,
      amount: price,
      currency,
      quantity: count,
      active,
      expireOn,
      redirectUrl: redirect,
      image,
      fields: fields.map((field) => ({ label: field.label.trim(), type: field.type, required: field.required })),
    };
    if (custom) body.slug = custom;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "edit" && initial) {
        await api(`/desk/links/${initial.slug}`, { method: "PATCH", body: JSON.stringify(body) });
        router.push("/admin/payment-links");
        return;
      }
      await api("/desk/links", { method: "POST", body: JSON.stringify(body) });
      if (again) {
        reset();
        setMessage("Payment link created. You can create another.");
      } else {
        router.push("/admin/payment-links");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save payment link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pl-page plf">
      <header className="pl-head">
        <div>
          <p className="pl-crumb">Payment Links <span>›</span> {mode === "edit" ? "Edit" : "Create"}</p>
          <h2>{mode === "edit" ? "Edit Payment Link" : "Create Payment Link"}</h2>
        </div>
      </header>

      <div className="plf-grid">
        <section className="plf-card">
          <header>
            <h3>Product Information</h3>
            <p>What the customer is paying for</p>
          </header>
          <div className="plf-split">
            <label className="plf-field">
              <span>Product name <i>*</i></span>
              <input value={title} maxLength={80} placeholder="e.g. Premium Subscription" onChange={(event) => onTitle(event.target.value)} />
            </label>
            <label className="plf-field">
              <span>Quantity <i>*</i></span>
              <input type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
            </label>
          </div>
          <label className="plf-field">
            <span>Product description <i>*</i></span>
            <textarea value={detail} rows={4} maxLength={400} placeholder="Enter detailed product description..." onChange={(event) => setDetail(event.target.value)} />
          </label>
          <div className="plf-split">
            <label className="plf-field">
              <span>Currency <i>*</i></span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {currencies.map((code) => <option key={code} value={code}>{code} ({marks[code]})</option>)}
              </select>
            </label>
            <label className="plf-field">
              <span>Amount <i>*</i></span>
              <span className="plf-money">
                <b>{currency}</b>
                <input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
              </span>
            </label>
          </div>
          <div className="plf-split plf-status-row">
            <label className="plf-field">
              <span>Expire Date</span>
              <input type="date" value={expireOn} onChange={(event) => setExpireOn(event.target.value)} />
            </label>
            <div className="plf-status">
              <button className={active ? "plf-switch on" : "plf-switch"} type="button" role="switch" aria-checked={active} onClick={() => setActive((on) => !on)}>
                <i />
              </button>
              <span>Status <em>*</em></span>
            </div>
          </div>
          <label className="plf-field">
            <span>Redirect URL</span>
            <input value={redirectUrl} maxLength={300} placeholder="https://example.com/thank-you" onChange={(event) => setRedirectUrl(event.target.value)} />
            <small>The URL to redirect after the payment is completed. Leave empty to use the default URL.</small>
          </label>
          <label className="plf-field">
            <span>Custom URL Slug</span>
            <input
              value={slug}
              maxLength={60}
              placeholder="auto-generated-or-custom"
              onChange={(event) => { setSlugTouched(true); setSlug(event.target.value.toLowerCase()); }}
            />
            <small>Unique checkout slug for: {host}/l/{slug || "{slug}"}</small>
          </label>
        </section>

        <section className="plf-card">
          <header>
            <h3>Product Image</h3>
            <p>Shown beside the product on the payment page</p>
          </header>
          <div className="plf-field">
            <span>Image</span>
            <label
              className={dragging ? "plf-drop on" : "plf-drop"}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); void chooseImage(event.dataTransfer.files[0]); }}
            >
              {image ? <img src={image} alt="" /> : <span>Drag & Drop your files or <b>Browse</b></span>}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                onChange={(event) => { void chooseImage(event.target.files?.[0]); event.target.value = ""; }}
              />
            </label>
            <small>Image should be in JPG, JPEG, PNG or WEBP format.</small>
            {image ? <button className="plf-clear" type="button" onClick={() => setImage("")}>Remove image</button> : null}
          </div>
        </section>
      </div>

      <section className="plf-card">
        <header>
          <h3>User input fields</h3>
          <p>Configure additional fields the customer fills in during payment</p>
        </header>
        <div className="plf-fields">
          <strong>User input fields</strong>
          {fields.map((field, index) => (
            <div className="plf-field-row" key={field.id}>
              <label className="plf-field">
                <span>Field Label</span>
                <input
                  value={field.label}
                  maxLength={80}
                  placeholder="e.g. Student ID, Domain Name, Note"
                  onChange={(event) => setFields(fields.map((row, rowIndex) => (rowIndex === index ? { ...row, label: event.target.value } : row)))}
                />
              </label>
              <label className="plf-field">
                <span>Field Type</span>
                <select
                  value={field.type}
                  onChange={(event) => setFields(fields.map((row, rowIndex) => (rowIndex === index ? { ...row, type: event.target.value as LinkField["type"] } : row)))}
                >
                  {fieldTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="plf-required">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => setFields(fields.map((row, rowIndex) => (rowIndex === index ? { ...row, required: event.target.checked } : row)))}
                />
                Required Field
              </label>
              <button type="button" aria-label="Remove field" onClick={() => setFields(fields.filter((row) => row.id !== field.id))}>Remove</button>
            </div>
          ))}
          <button className="plf-add" type="button" onClick={() => setFields([...fields, { id: nextId(), label: "", type: "text", required: true }])}>Add new field</button>
        </div>
      </section>

      {message ? <p className="pl-note">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="plf-actions">
        <button className="pl-new" type="button" disabled={busy} onClick={() => save(false)}>{mode === "edit" ? "Save" : "Create"}</button>
        {mode === "create" ? <button className="btn-line" type="button" disabled={busy} onClick={() => save(true)}>Create & create another</button> : null}
        <button className="btn-line" type="button" disabled={busy} onClick={() => router.push("/admin/payment-links")}>Cancel</button>
      </div>
    </div>
  );
}

function shrinkImage(file: File) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return Promise.reject(new Error("Image should be JPG, JPEG, PNG, or WEBP"));
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        const max = 960;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not read image"));
          return;
        }
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.72);
        if (data.length > 180000) reject(new Error("Use a smaller image"));
        else resolve(data);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
