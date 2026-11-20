"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type {
  AdminInventoryUnit,
  AdminOrderDetail,
  AdminPage,
  AdminProductDetail,
  AdminProductListItem,
  AdminProductPackage,
} from "@amarpin/types";
import { adminFetch } from "@/lib/admin/api";
import { sameRegion } from "@/lib/catalog/regions";
import { FilterMenu } from "@/components/ui/FilterMenu";

type Line = {
  key: string;
  unitId: string | null;
  packageValueId: string | null;
  title: string;
  region: string | null;
  faceValue: string | null;
  mask: string;
  amount: string;
};

export type SavedGiftCard = {
  inventoryItemId: string;
  title: string;
  region: string | null;
  faceValue: string | null;
  codeMasked: string;
  amountMinor: number | null;
};

export function ManualGiftDelivery({
  orderId,
  onAddedUnits,
  onOrderChange,
  savedCards = [],
  stockRevision = 0,
}: {
  orderId?: string;
  onAddedUnits?: (items: Array<{ id: string; packageValueId: string | null }>) => void;
  onOrderChange?: (order: AdminOrderDetail) => void;
  savedCards?: SavedGiftCard[];
  /** Bumps after the order is marked complete so sold codes leave this list. */
  stockRevision?: number;
}) {
  const [products, setProducts] = useState<AdminProductListItem[]>([]);
  const [fieldId, setFieldId] = useState("");
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<"regions" | "packages" | "codes">("regions");
  const [detail, setDetail] = useState<AdminProductDetail | null>(null);
  const [region, setRegion] = useState("");
  const [packageId, setPackageId] = useState("");
  const [units, setUnits] = useState<AdminInventoryUnit[]>([]);
  const [availableCodes, setAvailableCodes] = useState<Map<string, number>>(new Map());
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [manualPackageId, setManualPackageId] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [addingCode, setAddingCode] = useState(false);
  const [fullCodes, setFullCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    for (const card of savedCards) {
      if (fullCodes[card.inventoryItemId]) continue;
      void adminFetch<{ code: string }>(`/inventory/${card.inventoryItemId}/code`).then((result) => {
        if (cancelled || !result.ok) return;
        setFullCodes((current) =>
          current[card.inventoryItemId] ? current : { ...current, [card.inventoryItemId]: result.data.code },
        );
      });
    }
    return () => {
      cancelled = true;
    };
  }, [savedCards, fullCodes]);

  useEffect(() => {
    onAddedUnits?.(
      lines.flatMap((line) => (line.unitId ? [{ id: line.unitId, packageValueId: line.packageValueId }] : [])),
    );
  }, [lines, onAddedUnits]);

  useEffect(() => {
    const saved = new Set(savedCards.map((card) => card.inventoryItemId));
    if (saved.size === 0) return;
    setLines((current) => {
      const next = current.filter((line) => !line.unitId || !saved.has(line.unitId));
      if (next.length === current.length) return current;
      return next.length ? next : [blankLine()];
    });
  }, [savedCards]);

  useEffect(() => {
    if (stockRevision === 0 || !fieldId) return;
    void loadCodes(fieldId);
  }, [stockRevision]);

  useEffect(() => {
    void (async () => {
      const result = await adminFetch<AdminPage<AdminProductListItem>>("/products?page=1&pageSize=100");
      if (result.ok) setProducts(result.data.items.filter((item) => item.status !== "ARCHIVED"));
    })();
  }, []);

  const regions = detail ? regionsFor(detail, availableCodes) : [];
  const regionPackages = detail ? packagesFor(detail, region, availableCodes) : [];
  const manualPackages = detail ? manualPackagesFor(detail, region) : [];
  const selectedPackage = detail?.variationMeta?.packages.find((item) => item.valueId === packageId) ?? null;
  const savedIds = new Set(savedCards.map((card) => card.inventoryItemId));
  const shownUnits = units.filter((unit) => {
    if (unit.status !== "AVAILABLE" || savedIds.has(unit.id)) return false;
    if (packageId && unit.packageValueId && unit.packageValueId !== packageId) return false;
    return true;
  });
  const steps = regions.length > 1 ? ["Region", "Card", "Code"] : ["Card", "Code"];

  function deleteLine(key: string) {
    setLines((current) => {
      const next = current.filter((line) => line.key !== key);
      return next.length ? next : [blankLine()];
    });
  }

  async function deleteSavedCard(inventoryItemId: string) {
    if (!orderId) return "This order is not ready.";
    const result = await adminFetch<AdminOrderDetail>(`/orders/${orderId}/cards/${inventoryItemId}`, { method: "DELETE" });
    if (!result.ok) return result.message;
    setFullCodes((current) => {
      const next = { ...current };
      delete next[inventoryItemId];
      return next;
    });
    onOrderChange?.(result.data);
    return null;
  }

  async function saveCardCode(inventoryItemId: string, code: string, lineKey?: string) {
    const trimmed = code.trim();
    if (!trimmed) return "Enter a redeem code.";
    if (!orderId) return "This order is not ready.";
    const result = await adminFetch<{ ok: true }>(`/orders/${orderId}/cards/${inventoryItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ code: trimmed }),
    });
    if (!result.ok) return result.message;
    setFullCodes((current) => ({ ...current, [inventoryItemId]: trimmed }));
    if (lineKey) {
      setLines((current) => current.map((line) => (line.key === lineKey ? { ...line, mask: trimmed } : line)));
    }
    return null;
  }

  async function chooseProduct(id: string) {
    setFieldId(id);
    setRegion("");
    setPackageId("");
    setUnits([]);
    const [result, stock] = await Promise.all([
      adminFetch<AdminProductDetail>(`/products/${id}`),
      adminFetch<{ items: Array<{ packageValueId: string; available: number }> }>(
        `/inventory/packages?productId=${encodeURIComponent(id)}`,
      ),
    ]);
    if (!result.ok) return;
    const counts = new Map(
      (stock.ok ? stock.data.items : []).map((item) => [item.packageValueId, item.available]),
    );
    setAvailableCodes(counts);
    setDetail(result.data);
    const nextRegions = regionsFor(result.data, counts);
    if (nextRegions.length > 1) {
      setView("regions");
      return;
    }
    const onlyRegion = nextRegions[0] ?? "";
    setRegion(onlyRegion);
    const packs = packagesFor(result.data, onlyRegion, counts);
    if (packs.length === 1) {
      const valueId = packs[0]?.valueId ?? "";
      setPackageId(valueId);
      await loadCodes(id, valueId);
      setView("codes");
      return;
    }
    setView("packages");
  }

  function chooseRegion(name: string) {
    setRegion(name);
    setPackageId("");
    setView("packages");
  }

  async function choosePackage(pack: AdminProductPackage) {
    setPackageId(pack.valueId);
    if (detail) await loadCodes(detail.id, pack.valueId);
    setView("codes");
  }

  function goBack() {
    if (!detail) return;
    if (view === "codes") {
      setView("packages");
      return;
    }
    if (view === "packages" && regions.length > 1) {
      setPackageId("");
      setView("regions");
      return;
    }
    setFieldId("");
    setDetail(null);
    setRegion("");
    setPackageId("");
    setView("regions");
  }

  async function loadCodes(productId: string, valueId = packageId) {
    const packageQuery = valueId ? `&packageValueId=${encodeURIComponent(valueId)}` : "";
    const result = await adminFetch<AdminPage<AdminInventoryUnit>>(
      `/inventory?page=1&pageSize=100&productId=${productId}&status=AVAILABLE${packageQuery}`,
    );
    setUnits(result.ok ? result.data.items : []);
  }

  function placeCode(unit: AdminInventoryUnit, code: string, pack: AdminProductPackage | null = selectedPackage) {
    const amount = pack ? taka(pack.priceMinor) : detail ? taka(detail.priceMinor) : "";
    setLines((current) => {
      if (current.some((line) => line.unitId === unit.id)) return current;
      const filled = {
        unitId: unit.id,
        packageValueId: pack?.valueId || packageId || unit.packageValueId,
        title: pack?.name ?? detail?.title ?? "Gift card",
        region: region || pack?.regions[0] || null,
        faceValue: dollarLabel(pack?.name ?? ""),
        mask: code,
        amount,
      };
      const empty = current.find((line) => !line.unitId && !line.mask);
      if (empty) return current.map((line) => (line.key === empty.key ? { ...line, ...filled } : line));
      return [...current, { ...filled, key: unit.id }];
    });
  }

  async function addUnit(unit: AdminInventoryUnit) {
    if (lines.some((line) => line.unitId === unit.id)) return;
    const revealed = await adminFetch<{ code: string }>(`/inventory/${unit.id}/code`);
    placeCode(unit, revealed.ok ? revealed.data.code : unit.codeMasked);
  }

  async function addManualCode(event: FormEvent, targetPackageId: string) {
    event.preventDefault();
    if (!detail) return;
    const code = manualCode.trim();
    if (code.length < 4) {
      setManualError("Enter a redeem code.");
      return;
    }
    const pack = detail.variationMeta?.packages.find((item) => item.valueId === targetPackageId) ?? null;
    setAddingCode(true);
    setManualError(null);
    const result = await adminFetch<AdminInventoryUnit>("/inventory/manual", {
      method: "POST",
      body: JSON.stringify({
        productId: detail.id,
        packageValueId: targetPackageId || undefined,
        code,
      }),
    });
    setAddingCode(false);
    if (!result.ok) {
      setManualError(result.message);
      return;
    }
    placeCode(result.data, code, pack);
    setUnits((current) => [result.data, ...current]);
    if (targetPackageId) {
      setAvailableCodes((current) => {
        const next = new Map(current);
        next.set(targetPackageId, (next.get(targetPackageId) ?? 0) + 1);
        return next;
      });
    }
    setManualCode("");
  }

  function manualCodeForm(targetPackageId: string, choices: AdminProductPackage[]) {
    return (
      <form className="manual-code-entry" onSubmit={(event) => void addManualCode(event, targetPackageId)}>
        {choices.length > 1 ? (
          <label>
            Card
            <select
              value={targetPackageId}
              onChange={(event) => setManualPackageId(event.target.value)}
            >
              {choices.map((pack) => (
                <option key={pack.valueId} value={pack.valueId}>
                  {pack.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Enter code
          <input
            value={manualCode}
            placeholder="Type the gift card code"
            maxLength={500}
            onChange={(event) => setManualCode(event.target.value)}
          />
        </label>
        <button type="submit" disabled={addingCode || !targetPackageId || manualCode.trim().length < 4}>
          {addingCode ? "Adding…" : "Add code"}
        </button>
        {manualError ? <p className="form-error">{manualError}</p> : null}
      </form>
    );
  }

  return (
    <section className="manual-delivery">
      <header>
        <span>
          <CardIcon />
        </span>
        <div>
          <h2>Manual Gift Card Delivery</h2>
        </div>
      </header>
      <p className="orders-kicker">Delivery field</p>
      <FilterMenu
        label="Delivery field"
        value={fieldId}
        onChange={(id) => {
          if (!id) {
            setFieldId("");
            setDetail(null);
            setRegion("");
            setPackageId("");
            setView("regions");
            return;
          }
          void chooseProduct(id);
        }}
        options={[
          { value: "", label: "Select delivery field..." },
          ...products.map((product, index) => ({
            value: product.id,
            label: `${index + 1}. ${product.title}`,
          })),
        ]}
      />

      {detail ? (
        <div className="manual-stock">
          <button type="button" className="manual-stock-head" onClick={() => setOpen((value) => !value)}>
            <span>
              <BoxIcon /> Stock management
              <small>
                {view === "regions"
                  ? ` · ${regions.length} regions`
                  : view === "packages"
                    ? ` · ${regionPackages.length} cards`
                    : ` · ${shownUnits.length} available`}
              </small>
            </span>
            <b>{open ? "▴" : "▾"}</b>
          </button>
          {open ? (
            <div className="manual-stock-body">
              <div className="manual-flow">
                <div className="manual-flow-bar">
                  <ol className="manual-steps">
                    {steps.map((step, index) => {
                      const current = view === "packages" ? "card" : view === "codes" ? "code" : "region";
                      const names = steps.map((item) => item.toLowerCase());
                      const stepIndex = names.indexOf(step.toLowerCase());
                      const currentIndex = names.indexOf(current);
                      const state = stepIndex < currentIndex ? "is-done" : stepIndex === currentIndex ? "is-on" : "";
                      return (
                        <li key={step} className={state} aria-current={state === "is-on" ? "step" : undefined}>
                          <span>{state === "is-done" ? <StepCheck /> : index + 1}</span>
                          {step}
                        </li>
                      );
                    })}
                  </ol>
                  <button type="button" className="manual-back" onClick={goBack}>
                    <BackIcon />
                    Back
                  </button>
                </div>
              </div>
              {view === "regions" ? (
                <>
                  <div className="manual-section-head">
                    <p className="orders-kicker manual-card-kicker is-site">Select region</p>
                    <span>{regions.length} {regions.length === 1 ? "region" : "regions"}</span>
                  </div>
                  <div className="manual-packages manual-regions">
                    {regions.map((name) => {
                      const count = packagesFor(detail, name, availableCodes).length;
                      return (
                        <button key={name} type="button" onClick={() => chooseRegion(name)}>
                          <strong>{name}</strong>
                          <small>{count} {count === 1 ? "card" : "cards"}</small>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
              {view === "packages" ? (
                <>
                  {manualPackages.length > 0
                    ? manualCodeForm(
                        manualPackages.some((pack) => pack.valueId === manualPackageId)
                          ? manualPackageId
                          : manualPackages[0]?.valueId ?? "",
                        manualPackages,
                      )
                    : null}
                  <div className="manual-section-head is-card">
                    <p className="orders-kicker manual-card-kicker is-site">{region ? `Select card · ${region}` : "Select card"}</p>
                    <span>{regionPackages.length} {regionPackages.length === 1 ? "card" : "cards"}</span>
                  </div>
                  <div className="manual-packages">
                    {regionPackages.map((pack) => (
                      <button key={pack.valueId} type="button" onClick={() => void choosePackage(pack)}>
                        <strong>{pack.name}</strong>
                        <small>{availableCodes.get(pack.valueId) ?? 0} available</small>
                      </button>
                    ))}
                  </div>
                  {regionPackages.length === 0 ? <p className="manual-help">No cards in this region.</p> : null}
                </>
              ) : null}
              {view === "codes" ? (
                <>
                  {manualCodeForm(packageId, selectedPackage ? [selectedPackage] : [])}
                  <p className="manual-help">{shownUnits.length} available codes</p>
                  <div className="manual-codes">
                    <p>
                      <span>Available codes · {selectedPackage?.name ?? detail.title}</span>
                      <span>{shownUnits.length} shown</span>
                    </p>
                    <div className="manual-code-list">
                      {shownUnits.map((unit) => {
                        const added = lines.some((line) => line.unitId === unit.id);
                        return (
                          <div key={unit.id} className={added ? "manual-code-row is-added" : "manual-code-row"}>
                            <strong>{unit.codeMasked}</strong>
                            <small>Amount {selectedPackage ? taka(selectedPackage.priceMinor) : taka(detail.priceMinor)}</small>
                            <button type="button" disabled={added} onClick={() => void addUnit(unit)}>
                              {added ? "Added" : "Add"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {savedCards.length || lines.some((line) => line.unitId) ? (
        <div className="manual-lines">
          <div className="manual-delivered-block">
            <p className="orders-kicker">Delivered on this order</p>
            <div className="manual-delivered-list">
            {savedCards.map((card) => (
              <DeliveredCard
                key={card.inventoryItemId}
                title={card.title}
                region={card.region}
                codeMasked={fullCodes[card.inventoryItemId] ?? card.codeMasked}
                onSave={(code) => saveCardCode(card.inventoryItemId, code)}
                onDelete={() => deleteSavedCard(card.inventoryItemId)}
              />
            ))}
            {lines.filter((line) => line.unitId).map((line) => (
              <DeliveredCard
                key={line.key}
                title={line.title}
                region={line.region}
                codeMasked={line.mask}
                onSave={(code) => saveCardCode(line.unitId ?? "", code, line.key)}
                onDelete={() => {
                  deleteLine(line.key);
                  return null;
                }}
              />
            ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function blankLine(): Line {
  return {
    key: `line-${Math.random().toString(36).slice(2)}`,
    unitId: null,
    packageValueId: null,
    title: "",
    region: null,
    faceValue: null,
    mask: "",
    amount: "",
  };
}

function dollarLabel(name: string) {
  const match = name.match(/(\d+(?:\.\d+)?)\s*\$/);
  return match ? `${match[1]}$` : null;
}

function DeliveredCard({
  title,
  region,
  codeMasked,
  onSave,
  onDelete,
}: {
  title: string;
  region: string | null;
  codeMasked: string;
  onSave: (code: string) => Promise<string | null>;
  onDelete: () => Promise<string | null> | string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(codeMasked);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = title || "Gift card";
  const regionName = region || "—";

  function markCopied() {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function copyInfo() {
    const text = `${name}\nRegion: ${regionName}\nRedeem Code: ${codeMasked}`;
    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) markCopied();
    }
  }

  async function saveEdit() {
    setBusy(true);
    const message = await onSave(draft);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setEditing(false);
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    const message = await onDelete();
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setWarning(false);
  }

  useEffect(() => {
    if (!warning) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setWarning(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [warning, busy]);

  return (
    <article className="manual-delivered">
      <header>
        <strong>{name}</strong>
        <div className="manual-delivered-tools">
          {editing ? (
            <button type="button" aria-label="Save redeem code" disabled={busy} onClick={() => void saveEdit()}>
              <CheckIcon />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Edit card"
              disabled={busy}
              onClick={() => {
                setDraft(codeMasked);
                setEditing(true);
                setError(null);
              }}
            >
              <PencilIcon />
            </button>
          )}
          <button
            type="button"
            className="is-danger"
            aria-label="Delete card"
            disabled={busy}
            onClick={() => {
              setError(null);
              setWarning(true);
            }}
          >
            <TrashIcon />
          </button>
          <button
            type="button"
            className={copied ? "is-copied" : undefined}
            aria-label={copied ? "Copied" : "Copy card details"}
            disabled={busy}
            onClick={() => void copyInfo()}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </header>
      <p><span>Region:</span><b>{regionName}</b></p>
      <p className="is-code">
        <span>Redeem Code:</span>
        {editing ? (
          <input
            value={draft}
            aria-label="Redeem code"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveEdit();
              if (event.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <b>{codeMasked}</b>
        )}
      </p>
      {error && !warning ? <small>{error}</small> : null}
      {warning && typeof document !== "undefined"
        ? createPortal(
            <div className="customer-modal" role="presentation" onClick={() => { if (!busy) setWarning(false); }}>
              <div className="customer-warn" role="alertdialog" aria-modal="true" aria-label="Delete this gift card" onClick={(event) => event.stopPropagation()}>
                <h2>Delete this gift card?</h2>
                <p>This removes {name} from the order and puts the code back in available stock.</p>
                {error ? <p className="is-error">{error}</p> : null}
                <div>
                  <button type="button" disabled={busy} onClick={() => setWarning(false)}>Cancel</button>
                  <button type="button" className="is-danger" disabled={busy} onClick={() => void confirmDelete()}>
                    {busy ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </article>
  );
}

function regionsFor(detail: AdminProductDetail, availableCodes: Map<string, number>) {
  const values: string[] = [];
  const add = (region: string) => {
    const trimmed = region.trim();
    if (!trimmed || values.some((item) => sameRegion(item, trimmed))) return;
    values.push(trimmed);
  };
  const packs = stockedApiPackages(detail, availableCodes);
  for (const pack of packs) {
    for (const region of pack.regions ?? []) add(region);
  }
  if (values.length === 0 && packs.length > 0) {
    for (const region of detail.variationMeta?.regions ?? []) add(region);
  }
  return values;
}

function manualPackagesFor(detail: AdminProductDetail, region: string) {
  return (detail.variationMeta?.packages ?? []).filter((pack) => {
    if (pack.stockType !== "manual" || pack.manualStock <= 0) return false;
    const tags = pack.regions ?? [];
    if (!region || tags.length === 0) return true;
    return tags.some((tag) => sameRegion(tag, region));
  });
}

function stockedApiPackages(detail: AdminProductDetail, availableCodes: Map<string, number>) {
  return (detail.variationMeta?.packages ?? []).filter(
    (pack) => pack.stockType === "api" && (availableCodes.get(pack.valueId) ?? 0) > 0,
  );
}

function packagesFor(detail: AdminProductDetail, region: string, availableCodes: Map<string, number>) {
  return stockedApiPackages(detail, availableCodes).filter((pack) => {
    const tags = pack.regions ?? [];
    if (!region || tags.length === 0) return true;
    return tags.some((tag) => sameRegion(tag, region));
  });
}

function taka(minor: number) {
  const major = minor / 100;
  return `${Number.isInteger(major) ? major.toLocaleString("en-US") : major.toFixed(2)}৳`;
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.2 20 7.2v9.6L12 20.8 4 16.8V7.2L12 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 20h4l10.2-10.2a1.8 1.8 0 0 0 0-2.6l-1.4-1.4a1.8 1.8 0 0 0-2.6 0L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m12.8 6.2 5 5" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 8h14M9 8V5.8h6V8M8 8l.7 11h6.6L16 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="m6.5 12.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StepCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="m6.5 12.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M14.5 6.5 9 12l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
