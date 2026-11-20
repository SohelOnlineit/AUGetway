"use client";

import Link from "next/link";
import { sameRegion } from "@/lib/catalog/regions";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PackageStockType = "manual" | "giftcard" | "api";

export type PackageRow = {
  id: string;
  name: string;
  valueId: string;
  price: string;
  stockType: PackageStockType;
  imageUrl: string;
  manualStock: string;
  regions: string[];
};

export type CustomerInputDraft = {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
};

export type VariationState = {
  regions: string[];
  defaultRegion: string;
  showPackageImages: boolean;
  regionImages: Record<string, string>;
  packages: PackageRow[];
  customerInputs: CustomerInputDraft[];
};

const STOCK_LABEL: Record<PackageStockType, string> = {
  manual: "Manual Delivery",
  giftcard: "Gift card codes",
  api: "API auto stock",
};

const PRESETS = ["Standard", "Premium", "Deluxe", "1 Month", "3 Months", "12 Months"];

type Draft = Omit<PackageRow, "id">;

export function ProductVariations({
  value,
  onChange,
  saving,
  inventoryCount,
  inventoryHref,
  defaultImageUrl,
  onUploadImage,
  pendingPackageRef,
}: {
  value: VariationState;
  onChange: (updater: (current: VariationState) => VariationState) => void;
  saving: boolean;
  inventoryCount: number;
  inventoryHref: string;
  defaultImageUrl: string;
  onUploadImage: (file: File) => Promise<string | null>;
  pendingPackageRef?: { current: PackageRow | null };
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(value.packages));
  const [regionInput, setRegionInput] = useState("");
  const [showUrl, setShowUrl] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingRegion, setUploadingRegion] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PackageRow | null>(null);
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState("");
  const [dragRegion, setDragRegion] = useState<string | null>(null);
  const [dropRegion, setDropRegion] = useState<string | null>(null);
  const [dragPackageId, setDragPackageId] = useState<string | null>(null);
  const [dropPackageId, setDropPackageId] = useState<string | null>(null);
  const regionDragged = useRef(false);
  const activeRegion =
    value.regions.find((region) => sameRegion(region, regionFilter)) ?? value.regions[0] ?? "";

  useEffect(() => {
    if (!deleteTarget) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDeleteTarget(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget]);

  useEffect(() => {
    if (!pendingRegion) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPendingRegion(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingRegion]);

  function openAdd() {
    setEditingId(null);
    const next = emptyDraft(value.packages);
    next.regions = activeRegion ? [activeRegion] : [...value.regions];
    setDraft(next);
    setShowUrl(false);
    setDraftError(null);
    setEditorOpen(true);
  }

  function openEdit(row: PackageRow) {
    setEditingId(row.id);
    setDraft({
      name: row.name,
      valueId: row.valueId,
      price: row.price,
      stockType: row.stockType,
      imageUrl: row.imageUrl,
      manualStock: row.manualStock,
      regions: [...row.regions],
    });
    setShowUrl(Boolean(row.imageUrl));
    setDraftError(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setDraftError(null);
  }

  function commitPackages(packages: PackageRow[]) {
    onChange((current) => ({ ...current, packages }));
  }

  function saveDraft() {
    const name = draft.name.trim();
    const valueId = draft.valueId.trim();
    const price = Number(draft.price);
    const manualStock = Math.round(Number(draft.manualStock) || 0);
    if (!name) {
      setDraftError("Enter a package name.");
      return;
    }
    if (!valueId) {
      setDraftError("Enter a value ID.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setDraftError("Enter a valid price.");
      return;
    }
    const chosenRegions = draft.regions.filter((region) =>
      value.regions.some((item) => sameRegion(item, region)),
    );
    if (value.regions.length > 0 && chosenRegions.length === 0) {
      setDraftError("Choose at least one region for this package.");
      return;
    }
    if (value.packages.some((row) => row.valueId === valueId && row.id !== editingId)) {
      setDraftError("Value ID is already used by another package.");
      return;
    }
    const nextRow: PackageRow = {
      id: editingId ?? newId(),
      name,
      valueId,
      price: Number.isInteger(price) ? String(price) : price.toFixed(2),
      stockType: draft.stockType,
      imageUrl: draft.imageUrl.trim(),
      manualStock: String(Math.max(0, manualStock)),
      regions: chosenRegions,
    };
    onChange((current) => ({
      ...current,
      packages: editingId
        ? current.packages.map((row) => (row.id === editingId ? nextRow : row))
        : [...current.packages, nextRow],
    }));
    closeEditor();
  }

  function addStorefrontRegion() {
    const codes = parseRegions(regionInput);
    if (!codes.length) return;
    onChange((current) => {
      const regions = [...current.regions];
      for (const code of codes) {
        if (!regions.some((region) => sameRegion(region, code))) regions.push(code);
      }
      return {
        ...current,
        regions,
      };
    });
    setRegionInput("");
  }

  function removeStorefrontRegion(code: string) {
    onChange((current) => {
      const regions = current.regions.filter((region) => !sameRegion(region, code));
      const defaultRegion = regions.some((region) => sameRegion(region, current.defaultRegion))
        ? current.defaultRegion
        : "";
      const regionImages = { ...current.regionImages };
      for (const key of Object.keys(regionImages)) {
        if (sameRegion(key, code)) delete regionImages[key];
      }
      return {
        ...current,
        regions,
        defaultRegion,
        regionImages,
        packages: current.packages.map((row) => ({
          ...row,
          regions: row.regions.filter((region) => !sameRegion(region, code)),
        })),
      };
    });
  }

  function imageForRegion(region: string) {
    const key = Object.keys(value.regionImages).find((item) => sameRegion(item, region));
    return key ? value.regionImages[key] ?? "" : "";
  }

  async function uploadRegionImage(region: string, file: File | undefined) {
    if (!file) return;
    setUploadingRegion(region);
    const url = await onUploadImage(file);
    setUploadingRegion(null);
    if (!url) return;
    onChange((current) => ({
      ...current,
      regionImages: { ...current.regionImages, [region]: url },
    }));
  }

  function reorderRegions(from: string, to: string) {
    if (sameRegion(from, to)) return;
    onChange((current) => {
      const regions = [...current.regions];
      const fromIndex = regions.findIndex((region) => sameRegion(region, from));
      const toIndex = regions.findIndex((region) => sameRegion(region, to));
      if (fromIndex < 0 || toIndex < 0) return current;
      const [moved] = regions.splice(fromIndex, 1);
      if (moved !== undefined) regions.splice(toIndex, 0, moved);
      return { ...current, regions };
    });
  }

  function clearRegionImage(region: string) {
    onChange((current) => {
      const regionImages = { ...current.regionImages };
      for (const key of Object.keys(regionImages)) {
        if (sameRegion(key, region)) delete regionImages[key];
      }
      return { ...current, regionImages };
    });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setDraftError(null);
    const url = await onUploadImage(file);
    setUploading(false);
    if (!url) {
      setDraftError("Image upload failed.");
      return;
    }
    setDraft((current) => ({ ...current, imageUrl: url }));
    setShowUrl(true);
  }

  function toggleDraftRegion(code: string) {
    setDraft((current) => {
      const selected = current.regions.some((region) => sameRegion(region, code));
      return {
        ...current,
        regions: selected
          ? current.regions.filter((region) => !sameRegion(region, code))
          : [...current.regions, code],
      };
    });
  }

  const visiblePackages = value.packages
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        !activeRegion || row.regions.some((region) => sameRegion(region, activeRegion)),
    );

  if (pendingPackageRef) {
    const pendingName = draft.name.trim();
    const pendingValueId = draft.valueId.trim();
    pendingPackageRef.current =
      editorOpen && pendingName && pendingValueId && draft.price.trim()
        ? {
            id: editingId ?? "pending-package",
            name: draft.name,
            valueId: draft.valueId,
            price: draft.price,
            stockType: draft.stockType,
            imageUrl: draft.imageUrl,
            manualStock: draft.manualStock,
            regions: [...draft.regions],
          }
        : null;
  }

  return (
    <div className="variations">
      <div className="variations-toolbar">
        <label className="variations-toggle">
          <input
            type="checkbox"
            checked={value.showPackageImages}
            disabled={saving}
            onChange={(event) =>
              onChange((current) => ({ ...current, showPackageImages: event.target.checked }))
            }
          />
          Show package images from variations
        </label>
        <button type="button" className="primary-btn variations-add" onClick={openAdd} disabled={saving}>
          <span className="variations-add-plus" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M8 3.2v9.6M3.2 8h9.6" />
            </svg>
          </span>
          Add variation
        </button>
      </div>

      {value.regions.length ? (
        <section className="variations-panel">
          <div className="variations-region-images">
            {value.regions.map((region) => {
              const image = imageForRegion(region);
              const selected = sameRegion(region, activeRegion);
              const dragging = dragRegion !== null && sameRegion(dragRegion, region);
              const dropping = dropRegion !== null && sameRegion(dropRegion, region) && !dragging;
              return (
                <div
                  key={region}
                  className={
                    "variations-region-image" +
                    (selected ? " is-on" : "") +
                    (dragging ? " is-dragging" : "") +
                    (dropping ? " is-drop" : "")
                  }
                  draggable={!saving}
                  title="Drag to reorder"
                  onDragStart={(event) => {
                    if ((event.target as HTMLElement).closest(".variations-region-actions, .variations-image-remove")) {
                      event.preventDefault();
                      return;
                    }
                    regionDragged.current = true;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", region);
                    setDragRegion(region);
                  }}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes("text/plain")) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropRegion((current) => (current && sameRegion(current, region) ? current : region));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = event.dataTransfer.getData("text/plain");
                    if (from) reorderRegions(from, region);
                    setDragRegion(null);
                    setDropRegion(null);
                  }}
                  onDragEnd={() => {
                    setDragRegion(null);
                    setDropRegion(null);
                  }}
                  onClick={() => {
                    if (regionDragged.current) {
                      regionDragged.current = false;
                      return;
                    }
                    setRegionFilter(region);
                  }}
                >
                  <span className="variations-region-thumb">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" />
                    ) : null}
                    {image ? (
                      <button
                        type="button"
                        className="variations-image-remove"
                        aria-label={`Remove ${region} image`}
                        title="Remove image"
                        onClick={(event) => {
                          event.stopPropagation();
                          clearRegionImage(region);
                        }}
                        disabled={saving}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                  <span className="variations-region-label">
                    <RegionFlag region={region} />
                    <strong>{region}</strong>
                  </span>
                  <div className="variations-region-actions" onClick={(event) => event.stopPropagation()}>
                    <label className="catalog-ghost variations-upload variations-image-btn">
                      {uploadingRegion === region ? "Uploading…" : image ? "Change image" : "Add image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/svg+xml"
                        disabled={saving || uploadingRegion !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void uploadRegionImage(region, file);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="variations-region-delete"
                      aria-label={`Remove ${region}`}
                      title="Remove region"
                      onClick={() => setPendingRegion(region)}
                      disabled={saving}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {value.packages.length === 0 ? (
        <p className="product-editor-note">
          No packages yet. Click Add variation, fill in the details, then save the package.
        </p>
      ) : visiblePackages.length === 0 ? (
        <p className="product-editor-note">
          No packages for {activeRegion}. Add a variation for this region, or edit a package and tick {activeRegion}.
        </p>
      ) : (
        <div className="product-editor-table-wrap">
          <table className="product-editor-table variations-table">
            <thead>
              <tr>
                <th className="variations-grip-head" aria-label="Reorder" />
                <th>
                  <span className="variations-list-head">
                    <span className="product-editor-kicker">Packages</span>
                    {activeRegion ? (
                      <span className="variations-region-pill">
                        <RegionFlag region={activeRegion} />
                        {activeRegion}
                      </span>
                    ) : null}
                  </span>
                </th>
                <th>Value ID</th>
                <th>Price</th>
                <th>Stock type</th>
                <th>Regions</th>
                <th>Stock</th>
                <th className="variations-actions-head">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visiblePackages.map(({ row, index }) => {
                const dragging = dragPackageId === row.id;
                const dropping = dropPackageId === row.id && !dragging;
                return (
                <tr
                  key={row.id}
                  className={(dragging ? "is-dragging" : "") + (dropping ? " is-drop" : "")}
                  draggable={!saving}
                  title="Drag up or down to reorder"
                  onDragStart={(event) => {
                    if ((event.target as HTMLElement).closest(".variations-actions, a, input")) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", `package:${row.id}`);
                    setDragPackageId(row.id);
                  }}
                  onDragOver={(event) => {
                    if (![...event.dataTransfer.types].includes("text/plain")) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropPackageId((current) => (current === row.id ? current : row.id));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const raw = event.dataTransfer.getData("text/plain");
                    const fromId = raw.startsWith("package:") ? raw.slice("package:".length) : "";
                    const fromIndex = value.packages.findIndex((item) => item.id === fromId);
                    if (fromIndex >= 0) commitPackages(movePackage(value.packages, fromIndex, index));
                    setDragPackageId(null);
                    setDropPackageId(null);
                  }}
                  onDragEnd={() => {
                    setDragPackageId(null);
                    setDropPackageId(null);
                  }}
                >
                  <td className="variations-grip-cell">
                    <span className="variations-grip" title="Drag up or down" aria-hidden>
                      <GripIcon />
                    </span>
                  </td>
                  <td>
                    <div className="variations-package">
                      <PackageThumb imageUrl={row.imageUrl} fallback={defaultImageUrl} />
                      <span className="variations-package-name" onClick={() => openEdit(row)}>
                        {row.name || "Untitled package"}
                      </span>
                    </div>
                  </td>
                  <td>{row.valueId}</td>
                  <td>
                    <span className="variations-price">
                      {formatMajor(row.price)}
                      <span className="home-card-taka">৳</span>
                    </span>
                  </td>
                  <td>
                    <span className={`variations-type variations-type--${row.stockType}`}>
                      {STOCK_LABEL[row.stockType]}
                    </span>
                  </td>
                  <td>
                    {(() => {
                      const shown = activeRegion
                        ? row.regions.filter((code) => sameRegion(code, activeRegion))
                        : row.regions;
                      return shown.length ? (
                        <span className="variations-region-codes">
                          {shown.map((code) => (
                            <span key={code} className="variations-region-label">
                              <RegionFlag region={code} />
                              {code}
                            </span>
                          ))}
                        </span>
                      ) : (
                        "—"
                      );
                    })()}
                  </td>
                  <td>
                    <StockCell
                      row={row}
                      inventoryCount={inventoryCount}
                      inventoryHref={inventoryHref}
                    />
                  </td>
                  <td>
                    <RowActions
                      disabled={saving}
                      onDuplicate={() => commitPackages(duplicatePackage(value.packages, row))}
                      onEdit={() => openEdit(row)}
                      onDelete={() => setDeleteTarget(row)}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget
        ? createPortal(
            <div className="variations-warn" role="presentation" onClick={() => setDeleteTarget(null)}>
              <div
                className="variations-warn-card"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="variation-delete-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="variation-delete-title">Delete this package?</h3>
                <p>
                  {deleteTarget.name.trim() || "Untitled package"} will be removed. This cannot be
                  undone from the package list.
                </p>
                <div>
                  <button type="button" className="variations-cancel" onClick={() => setDeleteTarget(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="variations-warn-delete"
                    onClick={() => {
                      if (editingId === deleteTarget.id) closeEditor();
                      commitPackages(value.packages.filter((item) => item.id !== deleteTarget.id));
                      setDeleteTarget(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {pendingRegion
        ? createPortal(
            <div className="variations-warn" role="presentation" onClick={() => setPendingRegion(null)}>
              <div
                className="variations-warn-card"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="region-delete-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="region-delete-title">Delete {pendingRegion}?</h3>
                <p>This region will be removed from the product.</p>
                <div>
                  <button type="button" className="variations-cancel" onClick={() => setPendingRegion(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="variations-warn-delete"
                    onClick={() => {
                      removeStorefrontRegion(pendingRegion);
                      setPendingRegion(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {editorOpen ? (
        <section
          className="variations-editor"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.target as HTMLElement).tagName !== "TEXTAREA") {
              event.preventDefault();
            }
          }}
        >
          <header>
            <h3>
              <PenIcon />
              {editingId ? "Edit package" : "Add package"}
            </h3>
            <button type="button" className="variations-close" aria-label="Close" onClick={closeEditor}>
              ×
            </button>
          </header>
          {draftError ? <p className="form-error">{draftError}</p> : null}
          <div className="variations-inline">
            <input
              id="storefront-regions"
              aria-label="Available regions"
              value={regionInput}
              placeholder="Add a region for the dropdown. Customers see its own image."
              disabled={saving}
              onChange={(event) => setRegionInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addStorefrontRegion();
              }}
            />
            <button type="button" className="catalog-ghost" onClick={addStorefrontRegion} disabled={saving}>
              + Add region
            </button>
          </div>
          {value.regions.length ? (
            <div className="variations-region-picks">
              {value.regions.map((region) => {
                const checked = draft.regions.some((item) => sameRegion(item, region));
                return (
                  <label key={region} className={checked ? "is-on" : ""}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving}
                      onChange={() => toggleDraftRegion(region)}
                    />
                    <RegionFlag region={region} />
                    {region}
                  </label>
                );
              })}
            </div>
          ) : null}
          <div className="variations-editor-grid">
            <label>
              Select package name
              <input
                list="package-presets"
                value={draft.name}
                placeholder="e.g. Premium"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              <datalist id="package-presets">
                {PRESETS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
            </label>
            <label>
              Price
              <input
                inputMode="decimal"
                value={draft.price}
                placeholder="e.g. 100"
                onChange={(event) => setDraft({ ...draft, price: event.target.value })}
              />
            </label>
            <label>
              Value ID
              <span className="variations-inline">
                <input
                  value={draft.valueId}
                  placeholder="Unique number"
                  onChange={(event) => setDraft({ ...draft, valueId: event.target.value })}
                />
                <button
                  type="button"
                  className="variations-icon-btn"
                  title="Next value ID"
                  aria-label="Next value ID"
                  onClick={() => setDraft({ ...draft, valueId: nextValueId(value.packages) })}
                >
                  <RefreshIcon />
                </button>
              </span>
            </label>
          </div>

          <section className="variations-panel">
            <label htmlFor="package-stock-type">Stock type</label>
            <select
              id="package-stock-type"
              value={draft.stockType}
              onChange={(event) =>
                setDraft({ ...draft, stockType: event.target.value as PackageStockType })
              }
            >
              {(Object.keys(STOCK_LABEL) as PackageStockType[]).map((type) => (
                <option key={type} value={type}>
                  {STOCK_LABEL[type]}
                </option>
              ))}
            </select>
            <p>
              {draft.stockType === "giftcard"
                ? "Import codes in Stock. Orders deliver a code after payment."
                : draft.stockType === "manual"
                  ? "You deliver orders manually after payment."
                  : "Stock is fulfilled through a supplier API."}
            </p>
            {draft.stockType === "manual" ? (
              <label htmlFor="package-stock">
                Stock
                <input
                  id="package-stock"
                  inputMode="numeric"
                  value={draft.manualStock}
                  onChange={(event) => setDraft({ ...draft, manualStock: event.target.value })}
                />
              </label>
            ) : null}
            {draft.stockType === "manual" ? (
              <p>Units available for sale. You deliver orders manually after payment.</p>
            ) : null}
            {draft.stockType === "giftcard" ? (
              <p>
                <Link href={inventoryHref}>Manage codes</Link>
              </p>
            ) : null}
          </section>

          <section className="variations-panel">
            <p className="product-editor-kicker">Package image</p>
            <div className="variations-image-row">
              <PackageThumb imageUrl={draft.imageUrl} fallback={defaultImageUrl} />
              <label className="catalog-ghost variations-upload">
                {uploading ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/svg+xml"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void upload(file);
                  }}
                />
              </label>
              <button type="button" className="variations-link" onClick={() => setShowUrl((open) => !open)}>
                Image URL (optional)
              </button>
            </div>
            {showUrl ? (
              <input
                value={draft.imageUrl}
                placeholder="/images/package.png"
                onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })}
              />
            ) : null}
            <p>Upload JPG, PNG, or WebP. If empty, the product&apos;s main image is shown.</p>
          </section>

          <div className="variations-editor-actions">
            <button type="button" className="variations-save" onClick={saveDraft} disabled={saving || uploading}>
              {editingId ? "Save package" : "Add package"}
            </button>
            <button type="button" className="variations-cancel" onClick={closeEditor}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StockCell({
  row,
  inventoryCount,
  inventoryHref,
}: {
  row: PackageRow;
  inventoryCount: number;
  inventoryHref: string;
}) {
  if (row.stockType === "manual") {
    const units = Math.max(0, Math.round(Number(row.manualStock) || 0));
    return (
      <span className={units > 0 ? "product-editor-stock" : "catalog-stock-low"}>
        {units.toLocaleString("en-US")}
      </span>
    );
  }
  if (row.stockType === "giftcard") {
    return (
      <span className="variations-stock">
        <span className={inventoryCount > 0 ? "product-editor-stock" : "catalog-stock-low"}>
          {inventoryCount > 0 ? `${inventoryCount} codes` : "No codes yet"}
        </span>
        <Link href={inventoryHref}>Manage codes</Link>
      </span>
    );
  }
  return (
    <span className="variations-stock">
      <span className="variations-api">Supplier API</span>
      <small>Auto-synced</small>
    </span>
  );
}

function RowActions({
  disabled,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  disabled: boolean;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="variations-actions">
      <button type="button" className="variations-edit-btn" disabled={disabled} onClick={onEdit}>
        Edit
      </button>
      <IconButton label="Duplicate package" disabled={disabled} onClick={onDuplicate}>
        <CopyIcon />
      </IconButton>
      <IconButton label="Delete package" disabled={disabled} danger onClick={onDelete}>
        <CloseIcon />
      </IconButton>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={danger ? "variations-icon-btn is-danger" : "variations-icon-btn"}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PackageThumb({ imageUrl, fallback }: { imageUrl: string; fallback: string }) {
  const src = imageUrl.trim() || fallback;
  return (
    <span className="variations-thumb">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <ImageMark />
      )}
    </span>
  );
}

function emptyDraft(packages: PackageRow[]): Draft {
  return {
    name: "",
    valueId: nextValueId(packages),
    price: "",
    stockType: "manual",
    imageUrl: "",
    manualStock: "0",
    regions: [],
  };
}

function formatMajor(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return Number.isInteger(amount)
    ? amount.toLocaleString("en-US")
    : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nextValueId(packages: PackageRow[]) {
  const nums = packages.map((row) => Number.parseInt(row.valueId, 10)).filter((value) => Number.isFinite(value));
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

function newId() {
  return `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseRegions(raw: string) {
  return [
    ...new Set(
      raw
        .split(",")
        .map((part) => part.trim().replace(/\s+/g, " ").toUpperCase())
        .filter(Boolean),
    ),
  ];
}

function movePackage(packages: PackageRow[], index: number, target: number) {
  if (target < 0 || target >= packages.length || target === index) return packages;
  const next = [...packages];
  const [row] = next.splice(index, 1);
  if (!row) return packages;
  next.splice(target, 0, row);
  return next;
}

function duplicatePackage(packages: PackageRow[], row: PackageRow) {
  const copy: PackageRow = {
    ...row,
    id: newId(),
    name: `${row.name} copy`.trim(),
    valueId: nextValueId(packages),
    regions: [...row.regions],
  };
  const index = packages.findIndex((item) => item.id === row.id);
  const next = [...packages];
  next.splice(index + 1, 0, copy);
  return next;
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="7" r="1.3" fill="currentColor" />
      <circle cx="15" cy="7" r="1.3" fill="currentColor" />
      <circle cx="9" cy="12" r="1.3" fill="currentColor" />
      <circle cx="15" cy="12" r="1.3" fill="currentColor" />
      <circle cx="9" cy="17" r="1.3" fill="currentColor" />
      <circle cx="15" cy="17" r="1.3" fill="currentColor" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="8" y="8" width="10" height="11" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 15.5V6.6A1.6 1.6 0 0 1 7.6 5H15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m13.2 6.6 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M19 12a7 7 0 1 1-2-4.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M19 4.5V8h-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M9 9.5v7M12 9.5v7M15 9.5v7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5.5 7h13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9.2 7 10 5.2h4L14.8 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.2 7.4 8 18.2a1.4 1.4 0 0 0 1.4 1.3h5.2a1.4 1.4 0 0 0 1.4-1.3l.8-10.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function ImageMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m7 15 3-3 2 2 3-3 2 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function RegionFlag({ region }: { region: string }) {
  const src = regionFlagSrc(region);
  if (!src) {
    return (
      <span className="variations-region-globe" aria-hidden>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M4 12h16M12 4c2.2 2.4 3.3 5.1 3.3 8s-1.1 5.6-3.3 8c-2.2-2.4-3.3-5.1-3.3-8s1.1-5.6 3.3-8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
        </svg>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="variations-region-flag" src={src} alt="" width={16} height={12} />
  );
}

function regionFlagSrc(region: string) {
  const normalized = region.trim().toUpperCase();
  const paren = normalized.match(/\(([A-Z]{2})\)/)?.[1];
  const raw = paren ?? (/^[A-Z]{2}$/.test(normalized) ? normalized : "");
  const code = raw === "UK" ? "GB" : raw;
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}
