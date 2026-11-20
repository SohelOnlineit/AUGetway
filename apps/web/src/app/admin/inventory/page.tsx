"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  AdminInventoryStatus,
  AdminInventoryUnit,
  AdminPage,
  AdminProductDetail,
  AdminProductListItem,
  AdminProductPackage,
  AdminProductType,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";
import { sameRegion } from "@/lib/catalog/regions";

type StockFilter = "" | "in" | "low" | "out";
type CodeFilter = "" | AdminInventoryStatus;

const TYPE_LABEL: Record<AdminProductType, string> = {
  LICENSE: "License",
  ACCOUNT: "Account",
  GIFTCARD: "Gift card",
  TOPUP: "Top-up",
  SUBSCRIPTION: "Subscription",
};

export default function AdminInventoryPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [products, setProducts] = useState<AdminProductListItem[]>([]);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminProductDetail | null>(null);
  const [units, setUnits] = useState<AdminInventoryUnit[]>([]);
  const [packageId, setPackageId] = useState("");
  const [codesText, setCodesText] = useState("");
  const [codeFilter, setCodeFilter] = useState<CodeFilter>("AVAILABLE");
  const [codeQuery, setCodeQuery] = useState("");
  const [codeMatches, setCodeMatches] = useState<AdminInventoryUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const canWrite = can(permissions, "admin:inventory:write");

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    void (async () => {
      const result = await adminFetch<AdminPage<AdminProductListItem>>("/products?page=1&pageSize=100");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setProducts(result.data.items.filter((item) => item.status !== "ARCHIVED"));
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, reloadToken, sessionError]);

  useEffect(() => {
    if (!selectedId || loading || sessionError) return;
    let cancelled = false;
    void (async () => {
      const [product, inventory] = await Promise.all([
        adminFetch<AdminProductDetail>(`/products/${selectedId}`),
        adminFetch<AdminPage<AdminInventoryUnit>>(`/inventory?page=1&pageSize=100&productId=${selectedId}`),
      ]);
      if (cancelled) return;
      if (!product.ok) {
        setError(product.message);
        return;
      }
      setDetail(product.data);
      setUnits(inventory.ok ? inventory.data.items : []);
      const packages = codePackages(product.data.variationMeta?.packages ?? []);
      setPackageId((current) =>
        packages.some((item) => item.valueId === current)
          ? current
          : packages[0]?.valueId ?? "product",
      );
      setError(inventory.ok ? null : inventory.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, reloadToken, selectedId, sessionError]);

  useEffect(() => {
    const query = codeQuery.trim();
    if (!selectedId || !query) {
      setCodeMatches(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void adminFetch<AdminPage<AdminInventoryUnit>>(
        `/inventory?page=1&pageSize=100&productId=${selectedId}&q=${encodeURIComponent(query)}`,
      ).then((result) => {
        if (cancelled) return;
        setCodeMatches(result.ok ? result.data.items : []);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [codeQuery, reloadToken, selectedId]);

  useEffect(() => {
    if (!detail) return;
    const packages = codePackages(detail.variationMeta?.packages ?? []);
    if (packages.some((item) => item.valueId === packageId)) return;
    setPackageId(packages[0]?.valueId ?? "product");
  }, [detail, packageId]);

  const stats = useMemo(() => countStats(products), [products]);
  const visible = useMemo(
    () => products.filter((product) => matchesProduct(product, search, stockFilter)),
    [products, search, stockFilter],
  );
  const packages = codePackages(detail?.variationMeta?.packages ?? []);
  const catalogPackageCount = detail?.variationMeta?.packages.length ?? 0;
  const selectedPackage = packages.find((item) => item.valueId === packageId) ?? null;
  const packageUnits = units.filter((unit) => unitMatchesPackage(unit.packageValueId, packageId));
  const counts = countUnits(packageUnits);
  const searchedUnits = codeQuery.trim()
    ? (codeMatches ?? []).filter((unit) => unitMatchesPackage(unit.packageValueId, packageId))
    : null;
  const shownUnits = (searchedUnits ?? packageUnits).filter((unit) => {
    if (codeFilter && unit.status !== codeFilter) return false;
    return true;
  });
  const packageCounts = countByPackage(units);

  async function importCodes(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    const codes = codesText
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);
    const result = await adminFetch<{ created: number; duplicates: number }>("/inventory/import", {
      method: "POST",
      body: JSON.stringify({
        productId: selectedId,
        codes,
        packageValueId: packageId === "product" || packageId === "unassigned" ? undefined : packageId,
      }),
    });
    setBusy(false);
    const warn = (text: string) => {
      setMessage(null);
      setError(null);
      window.setTimeout(() => setError(text), 0);
    };
    if (!result.ok) {
      warn(result.message);
      return;
    }
    const packageName = selectedPackage?.name ?? detail?.title ?? "this package";
    if (result.data.duplicates > 0) {
      const duplicateWarning = result.data.duplicates === 1
        ? "This code is already in stock or has been sold."
        : `${result.data.duplicates} codes are already in stock or have been sold and were not added.`;
      const added = result.data.created > 0
        ? ` ${result.data.created} new ${result.data.created === 1 ? "code was" : "codes were"} added.`
        : "";
      warn(`${duplicateWarning}${added}`);
      if (result.data.created > 0) setCodesText("");
    } else {
      setError(null);
      setCodesText("");
      setMessage(
        `Added ${result.data.created} ${result.data.created === 1 ? "code" : "codes"} to ${packageName}.`,
      );
    }
    setReloadToken((value) => value + 1);
  }

  async function disableUnit(id: string) {
    const result = await adminFetch(`/inventory/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "DISABLED" }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReloadToken((value) => value + 1);
  }

  function download(status: CodeFilter) {
    const rows = packageUnits.filter((unit) => !status || unit.status === status);
    const text = rows.map((unit) => unit.codeMasked).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-${status || "all"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell title="Stock management" permissions={permissions} bare>
      <div className="stock-page">
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        {selectedId && detail ? (
          <StockDetail
            product={detail}
            packages={packages}
            catalogPackageCount={catalogPackageCount}
            packageId={packageId}
            counts={counts}
            units={shownUnits}
            codeFilter={codeFilter}
            codeQuery={codeQuery}
            codesText={codesText}
            busy={busy}
            canWrite={canWrite}
            totalCodes={packageUnits.length}
            manualStock={selectedPackage?.stockType === "manual" ? selectedPackage.manualStock : null}
            packageCounts={packageCounts}
            onPackage={setPackageId}
            onFilter={setCodeFilter}
            onQuery={setCodeQuery}
            onCodes={setCodesText}
            onImport={importCodes}
            onDisable={disableUnit}
            onDownload={download}
            onClose={() => {
              setSelectedId(null);
              setDetail(null);
              setMessage(null);
            }}
          />
        ) : (
          <>
            <div className="stock-stats">
              <StatButton
                label="Products"
                value={stats.total}
                meta="Auto-delivery products only"
                tone="brand"
                active={stockFilter === ""}
                onClick={() => setStockFilter("")}
                icon={<BoxIcon />}
              />
              <StatButton
                label="In stock"
                value={stats.inStock}
                meta="Ready to sell"
                tone="success"
                active={stockFilter === "in"}
                onClick={() => setStockFilter(stockFilter === "in" ? "" : "in")}
                icon={<CheckIcon />}
              />
              <StatButton
                label="Low stock"
                value={stats.lowStock}
                meta="Under 5 units"
                tone="amber"
                active={stockFilter === "low"}
                onClick={() => setStockFilter(stockFilter === "low" ? "" : "low")}
                icon={<PulseIcon />}
              />
              <StatButton
                label="Out of stock"
                value={stats.outOfStock}
                meta="Needs replenishment"
                tone="amber"
                active={stockFilter === "out"}
                onClick={() => setStockFilter(stockFilter === "out" ? "" : "out")}
                icon={<CrossIcon />}
              />
            </div>

            <section className="stock-card">
              <header>
                <span className="stock-card-icon">
                  <BoxIcon />
                </span>
                <div>
                  <h2>Product inventory</h2>
                  <p>
                    {visible.length} of {products.length} auto-delivery products shown
                  </p>
                </div>
              </header>
              <div className="stock-filters">
                <label>
                  <span className="stock-label">
                    <SearchIcon />
                    Search products
                  </span>
                  <input
                    value={search}
                    placeholder="Title, SKU, or slug…"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <label>
                  <span className="stock-label">Stock level</span>
                  <FilterMenu
                    label="Stock level"
                    value={stockFilter}
                    onChange={(value) => setStockFilter(value as StockFilter)}
                    options={[
                      { value: "", label: "All products" },
                      { value: "in", label: "In stock" },
                      { value: "low", label: "Low stock" },
                      { value: "out", label: "Out of stock" },
                    ]}
                  />
                </label>
              </div>
              <div className="stock-table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Level</th>
                      <th>Available</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 ? (
                      <tr>
                        <td className="stock-empty" colSpan={6}>
                          No products match this stock view.
                        </td>
                      </tr>
                    ) : null}
                    {visible.map((product) => {
                      const level = levelOf(product);
                      return (
                        <tr key={product.id}>
                          <td>
                            <div className="stock-product">
                              <Thumb url={product.imageUrl} />
                              <div>
                                <strong>{product.title}</strong>
                                <small>/{product.slug}</small>
                              </div>
                            </div>
                          </td>
                          <td>{TYPE_LABEL[product.type]}</td>
                          <td>
                            <span className={`stock-pill stock-pill--${product.status.toLowerCase()}`}>
                              {product.status === "ACTIVE" ? "Active" : "Draft"}
                            </span>
                          </td>
                          <td>
                            <span className={`stock-pill stock-pill--${level.key}`}>{level.label}</span>
                          </td>
                          <td className={`stock-available stock-available--${level.key}`}>
                            {formatCount(product.stockAvailable)}
                          </td>
                          <td>
                            <button type="button" className="stock-manage" onClick={() => setSelectedId(product.id)}>
                              Manage
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function StockDetail({
  product,
  packages,
  catalogPackageCount,
  packageId,
  counts,
  units,
  codeFilter,
  codeQuery,
  codesText,
  busy,
  canWrite,
  totalCodes,
  manualStock,
  packageCounts,
  onPackage,
  onFilter,
  onQuery,
  onCodes,
  onImport,
  onDisable,
  onDownload,
  onClose,
}: {
  product: AdminProductDetail;
  packages: AdminProductPackage[];
  catalogPackageCount: number;
  packageId: string;
  counts: { available: number; reserved: number; sold: number };
  units: AdminInventoryUnit[];
  codeFilter: CodeFilter;
  codeQuery: string;
  codesText: string;
  busy: boolean;
  canWrite: boolean;
  totalCodes: number;
  manualStock: number | null;
  packageCounts: Map<string, UnitCounts>;
  onPackage: (id: string) => void;
  onFilter: (filter: CodeFilter) => void;
  onQuery: (value: string) => void;
  onCodes: (value: string) => void;
  onImport: (event: FormEvent) => void;
  onDisable: (id: string) => void;
  onDownload: (status: CodeFilter) => void;
  onClose: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<AdminInventoryUnit | null>(null);
  const regions = regionList(packages);
  const [region, setRegion] = useState(regions[0] ?? "");
  const activeRegion = regions.find((item) => sameRegion(item, region)) ?? regions[0] ?? "";
  const regionPackages = activeRegion
    ? packages.filter((item) => item.regions.some((tag) => sameRegion(tag, activeRegion)))
    : packages;
  const available = manualStock ?? counts.available;
  const chips =
    regionPackages.length > 0
      ? regionPackages.map((item) => ({
          name: item.name,
          valueId: item.valueId,
          stockType: item.stockType,
          manualStock: item.manualStock,
        }))
      : catalogPackageCount > 0
        ? []
        : [
            {
              name: product.title,
              valueId: "product",
              stockType: "giftcard" as const,
              manualStock: product.stockAvailable,
            },
          ];
  const selectedChip = chips.find((item) => item.valueId === packageId) ?? chips[0] ?? null;
  const selectedName = selectedChip?.name ?? product.title;
  const chipIds = chips.map((item) => item.valueId).join("\n");

  useEffect(() => {
    const ids = chipIds ? chipIds.split("\n") : [];
    if (!ids.length || ids.includes(packageId)) return;
    onPackage(ids[0]!);
  }, [chipIds, packageId, onPackage]);
  return (
    <section className="stock-card stock-detail">
      <header className="stock-detail-head">
        <Thumb url={product.images[0]?.url ?? product.imageUrl} />
        <div className="stock-detail-identity">
          <div className="stock-detail-title">
            <h2>{product.title}</h2>
            <span className={`stock-pill stock-pill--${product.status.toLowerCase()}`}>
              {product.status === "ACTIVE" ? "Active" : "Draft"}
            </span>
          </div>
          <p>
            {TYPE_LABEL[product.type]} · {product.type === "TOPUP" || product.type === "ACCOUNT" ? "manual" : "auto"} delivery
          </p>
          <p className="stock-detail-meta">
            <span>/{product.slug}</span>
            <span>{formatCount(available)} available</span>
            <span>{formatCount(counts.sold)} sold</span>
          </p>
        </div>
        <div className="stock-detail-actions">
          <Link href={`/admin/products/${product.id}`} className="catalog-ghost">
            Edit product
          </Link>
          <button type="button" className="catalog-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      <div className="stock-count-row">
        <button type="button" className="stock-count stock-count--available" onClick={() => onFilter("AVAILABLE")}>
          <strong>{formatCount(available)}</strong>
          <span>Package codes</span>
        </button>
        <button type="button" className="stock-count stock-count--reserved" onClick={() => onFilter("RESERVED")}>
          <strong>{formatCount(counts.reserved)}</strong>
          <span>Reserved</span>
        </button>
        <button type="button" className="stock-count stock-count--sold" onClick={() => onFilter("SOLD")}>
          <strong>{formatCount(counts.sold)}</strong>
          <span>Sold</span>
          <em>View sold codes</em>
        </button>
      </div>

      <div className="stock-detail-picker">
      {regions.length > 0 ? (
        <div>
          <p className="stock-kicker">Select region</p>
          <div className="stock-packages stock-regions">
            {regions.map((item) => (
              <button
                key={item}
                type="button"
                className={sameRegion(item, activeRegion) ? "is-on" : ""}
                onClick={() => {
                  setRegion(item);
                  const next = packages.filter((pkg) =>
                    pkg.regions.some((tag) => sameRegion(tag, item)),
                  );
                  if (next[0] && !next.some((pkg) => pkg.valueId === packageId)) {
                    onPackage(next[0].valueId);
                  }
                }}
              >
                <strong>{item}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
      <p className="stock-kicker">Select package</p>
      {chips.length === 0 ? (
        <p className="stock-note">
          {catalogPackageCount > 0 && packages.length === 0
            ? "These packages use manual delivery, so they are left off this page."
            : `No code packages are tagged with ${activeRegion}.`}
        </p>
      ) : (
      <div className="stock-packages">
        {chips.map((item) => (
          <button
            key={item.valueId}
            type="button"
            className={item.valueId === selectedChip?.valueId ? "is-on" : ""}
            onClick={() => onPackage(item.valueId)}
          >
            <strong>{item.name}</strong>
            <small>
              {formatCount(chipAvailable(item, packageCounts))} available
            </small>
            <small>{formatCount(chipSold(item, packageCounts))} sold</small>
          </button>
        ))}
      </div>
      )}
      </div>
      {chips.length > 0 ? (
      <p className="stock-selected">
        <span>Selected</span>
        <strong>{selectedName}</strong>
        {activeRegion ? <em>{activeRegion}</em> : null}
        <em>{formatCount(available)} codes</em>
      </p>
      ) : null}
      </div>

      {chips.length > 0 ? (
      <div className="stock-manage-grid">
        <form className="stock-panel" onSubmit={onImport}>
          <h3>Add inventory</h3>
          <p>
            Adding codes for {selectedName}
            {activeRegion ? ` · ${activeRegion}` : ""}
          </p>
          <label>
            Package
            <select value={selectedChip?.valueId ?? ""} onChange={(event) => onPackage(event.target.value)}>
              {chips.map((item) => (
                <option key={item.valueId} value={item.valueId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deliverables
            <textarea
              rows={6}
              value={codesText}
              placeholder={"KEY-AAAA-BBBB\nKEY-CCCC-DDDD"}
              onChange={(event) => onCodes(event.target.value)}
              required
            />
          </label>
          <button className="stock-add" type="submit" disabled={!canWrite || busy || chips.length === 0}>
            {busy ? "Adding…" : "Add to inventory"}
          </button>
        </form>

        <div className="stock-panel">
          <h3>Inventory codes</h3>
          <p>Codes for {selectedName} only</p>
          <div className="stock-code-bar">
            {(
              [
                { filter: "AVAILABLE", label: "Available", count: counts.available },
                { filter: "RESERVED", label: "Reserved", count: counts.reserved },
                { filter: "SOLD", label: "Sold", count: counts.sold },
                { filter: "", label: "All", count: totalCodes },
              ] as const
            ).map((option) => {
              const selected = codeFilter === option.filter;
              return (
                <div key={option.label} className={selected ? "stock-code-chip is-on" : "stock-code-chip"}>
                  <button
                    type="button"
                    className="stock-code-chip-filter"
                    aria-pressed={selected}
                    onClick={() => onFilter(option.filter)}
                  >
                    <span>{option.label}</span>
                    <strong>{formatCount(option.count)}</strong>
                  </button>
                  {option.filter === "AVAILABLE" ? null : (
                    <button
                      type="button"
                      className="stock-code-chip-download"
                      aria-label={`Download ${option.label}`}
                      onClick={() => onDownload(option.filter)}
                    >
                      <DownloadIcon />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <label>
            Search codes
            <input value={codeQuery} placeholder="Search code…" onChange={(event) => onQuery(event.target.value)} />
          </label>
          <p className="stock-note">Find a code to check if it is already in inventory.</p>
          <ul className="stock-codes">
            {units.map((unit) => (
              <li key={unit.id}>
                <div>
                  <strong>{unit.codeMasked}</strong>
                  <small className={`stock-code-status stock-code-status--${unit.status.toLowerCase()}`}>
                    {unit.status === "AVAILABLE" ? "Available" : unit.status === "RESERVED" ? "Reserved" : unit.status === "SOLD" ? "Sold" : "Disabled"}
                  </small>
                </div>
                {canWrite && unit.status === "AVAILABLE" ? (
                  <button type="button" className="stock-delete" onClick={() => setPendingDelete(unit)}>
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {pendingDelete
            ? createPortal(
                <div className="variations-warn" role="presentation" onClick={() => setPendingDelete(null)}>
                  <div
                    className="variations-warn-card"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="stock-delete-title"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <h3 id="stock-delete-title">Delete this card?</h3>
                    <p>{pendingDelete.codeMasked} will be removed from this package.</p>
                    <div>
                      <button type="button" className="variations-cancel" onClick={() => setPendingDelete(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="variations-warn-delete"
                        onClick={() => {
                          onDisable(pendingDelete.id);
                          setPendingDelete(null);
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
        </div>
      </div>
      ) : null}
    </section>
  );
}

function StatButton({
  label,
  value,
  meta,
  tone,
  active,
  onClick,
  icon,
}: {
  label: string;
  value: number;
  meta: string;
  tone: "brand" | "success" | "amber";
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button type="button" className={`stock-stat stock-stat--${tone}${active ? " is-on" : ""}`} onClick={onClick}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{formatCount(value)}</strong>
        <small>{meta}</small>
      </div>
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 4.5v10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7.5 11 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 18.5h13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="stock-thumb">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        <BoxIcon />
      )}
    </span>
  );
}

function countStats(products: AdminProductListItem[]) {
  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  for (const product of products) {
    if (product.stockAvailable <= 0) outOfStock += 1;
    else {
      inStock += 1;
      if (product.stockAvailable < 5) lowStock += 1;
    }
  }
  return { total: products.length, inStock, lowStock, outOfStock };
}

function matchesProduct(product: AdminProductListItem, search: string, filter: StockFilter) {
  const query = search.trim().toLowerCase();
  if (query) {
    const haystack = `${product.title} ${product.slug} ${product.sku ?? ""}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (filter === "out") return product.stockAvailable <= 0;
  if (filter === "low") return product.stockAvailable > 0 && product.stockAvailable < 5;
  if (filter === "in") return product.stockAvailable > 0;
  return true;
}

function levelOf(product: AdminProductListItem) {
  if (product.stockAvailable <= 0) return { key: "out", label: "Out of stock" };
  if (product.stockAvailable < 5) return { key: "low", label: "Low stock" };
  return { key: "in", label: "In stock" };
}

type UnitCounts = { available: number; reserved: number; sold: number };

function emptyCounts(): UnitCounts {
  return { available: 0, reserved: 0, sold: 0 };
}

function countUnits(units: AdminInventoryUnit[]): UnitCounts {
  return {
    available: units.filter((unit) => unit.status === "AVAILABLE").length,
    reserved: units.filter((unit) => unit.status === "RESERVED").length,
    sold: units.filter((unit) => unit.status === "SOLD").length,
  };
}

function countByPackage(units: AdminInventoryUnit[]) {
  const map = new Map<string, UnitCounts>();
  for (const unit of units) {
    const key = unit.packageValueId ?? "";
    const row = map.get(key) ?? emptyCounts();
    if (unit.status === "AVAILABLE") row.available += 1;
    else if (unit.status === "RESERVED") row.reserved += 1;
    else if (unit.status === "SOLD") row.sold += 1;
    map.set(key, row);
  }
  return map;
}

function codePackages(packages: AdminProductPackage[]) {
  return packages.filter((item) => item.stockType !== "manual");
}

function regionList(packages: AdminProductPackage[]) {
  const values: string[] = [];
  const add = (region: string) => {
    const trimmed = region.trim();
    if (!trimmed || values.some((item) => sameRegion(item, trimmed))) return;
    values.push(trimmed);
  };
  for (const item of packages) {
    for (const region of item.regions ?? []) add(region);
  }
  return values;
}

function unitMatchesPackage(packageValueId: string | null, selected: string) {
  if (selected === "product" || selected === "unassigned") return !packageValueId;
  return packageValueId === selected;
}

function chipKey(valueId: string) {
  return valueId === "product" || valueId === "unassigned" ? "" : valueId;
}

function chipAvailable(
  item: { valueId: string; stockType: string; manualStock: number },
  counts: Map<string, UnitCounts>,
) {
  if (item.stockType === "manual") return item.manualStock;
  return counts.get(chipKey(item.valueId))?.available ?? 0;
}

function chipSold(
  item: { valueId: string; stockType: string },
  counts: Map<string, UnitCounts>,
) {
  if (item.stockType === "manual") return 0;
  return counts.get(chipKey(item.valueId))?.sold ?? 0;
}

function formatCount(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString("en-US");
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.2 20 7.2v9.6L12 20.8 4 16.8V7.2L12 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 12V21M12 12 4.2 7.6M12 12l7.8-4.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8.2 12.2 2.4 2.4 5.2-5.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3 12h4l2-5 3 10 2-5h7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m9 9 6 6M15 9l-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
