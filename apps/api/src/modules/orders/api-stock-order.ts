export type ApiDeliveryLine = {
  id: string;
  productId: string;
  quantity: number;
  unitPriceMinor: number;
};

export type ApiReservedUnit = {
  id: string;
  productId: string;
  packageValueId: string | null;
};

export type ApiPackageInfo = {
  priceMinor: number;
  stockType: string;
};

export type ApiDeliveryPlan =
  | { action: "skip" }
  | {
      action: "fulfill";
      deliver: Array<{ unitId: string; orderItemId: string }>;
      release: string[];
    };

/**
 * Plans API auto delivery from the codes reserved for this order.
 * A short reserve still fulfills. Extra codes are released, not sold.
 * A gift-card or manual code in the reserve skips auto delivery.
 */
export function planApiStockDelivery(
  items: readonly ApiDeliveryLine[],
  reserved: readonly ApiReservedUnit[],
  packageFor: (productId: string, packageValueId: string | null) => ApiPackageInfo | null,
): ApiDeliveryPlan {
  if (items.length === 0 || reserved.length === 0) return { action: "skip" };

  const tagged = reserved.map((unit) => ({
    unit,
    pack: packageFor(unit.productId, unit.packageValueId),
  }));
  if (tagged.some((row) => row.pack?.stockType !== "api")) return { action: "skip" };

  const room = new Map<string, number>();
  const linesByProduct = new Map<string, ApiDeliveryLine[]>();
  for (const item of items) {
    if (item.quantity <= 0) continue;
    room.set(item.id, item.quantity);
    const list = linesByProduct.get(item.productId) ?? [];
    list.push(item);
    linesByProduct.set(item.productId, list);
  }
  if (room.size === 0) return { action: "skip" };

  const deliver: Array<{ unitId: string; orderItemId: string }> = [];
  const release: string[] = [];
  for (const { unit, pack } of tagged) {
    const lines = linesByProduct.get(unit.productId) ?? [];
    const open = lines.filter((line) => (room.get(line.id) ?? 0) > 0);
    const priced = open.filter((line) => pack && line.unitPriceMinor === pack.priceMinor);
    const chosen = priced[0] ?? open[0];
    if (!chosen) {
      release.push(unit.id);
      continue;
    }
    deliver.push({ unitId: unit.id, orderItemId: chosen.id });
    room.set(chosen.id, (room.get(chosen.id) ?? 1) - 1);
  }

  if (deliver.length === 0) return { action: "skip" };
  return { action: "fulfill", deliver, release };
}
