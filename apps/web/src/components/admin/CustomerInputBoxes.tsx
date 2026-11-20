"use client";

import type { CustomerInputDraft } from "@/components/admin/ProductVariations";

export function CustomerInputBoxes({
  boxes,
  onChange,
}: {
  boxes: CustomerInputDraft[];
  onChange: (boxes: CustomerInputDraft[]) => void;
}) {
  function update(id: string, patch: Partial<CustomerInputDraft>) {
    onChange(boxes.map((box) => (box.id === id ? { ...box, ...patch } : box)));
  }

  return (
    <div className="customer-inputs">
      <p className="product-editor-kicker">Checkout fields</p>
      {boxes.length === 0 ? (
        <p className="customer-inputs-empty">No input boxes yet. Add one if the customer should send extra details with this product.</p>
      ) : (
        boxes.map((box, index) => (
          <article key={box.id} className="customer-input-box">
            <header>
              <span>Box {index + 1}</span>
              <button type="button" onClick={() => onChange(boxes.filter((item) => item.id !== box.id))}>
                <TrashIcon />
                Delete
              </button>
            </header>
            <div className="customer-input-grid">
              <label>
                Label (question)
                <input
                  value={box.label}
                  placeholder="e.g. Enter your game email ID"
                  onChange={(event) => update(box.id, { label: event.target.value })}
                />
              </label>
              <label>
                Placeholder (example text)
                <input
                  value={box.placeholder}
                  placeholder="e.g. Example ID: test@gmail.com"
                  onChange={(event) => update(box.id, { placeholder: event.target.value })}
                />
              </label>
            </div>
            <label className="customer-input-required">
              <input
                type="checkbox"
                checked={box.required}
                onChange={(event) => update(box.id, { required: event.target.checked })}
              />
              Required (customer must fill this box)
            </label>
          </article>
        ))
      )}
      <button
        type="button"
        className="customer-inputs-add"
        disabled={boxes.length >= 12}
        onClick={() =>
          onChange([
            ...boxes,
            {
              id: `input-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              label: "",
              placeholder: "",
              required: false,
            },
          ])
        }
      >
        + Add input box
      </button>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 7.5h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.5 7.2V5.8A1.3 1.3 0 0 1 10.8 4.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 7.5 8.7 18a1.4 1.4 0 0 0 1.4 1.2h3.8a1.4 1.4 0 0 0 1.4-1.2l.7-10.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
