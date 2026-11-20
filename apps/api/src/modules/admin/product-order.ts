export class UnknownProductOrderError extends Error {
  constructor() {
    super("One of those products no longer exists");
  }
}

export class EmptyProductOrderError extends Error {
  constructor() {
    super("Choose at least one product");
  }
}

/**
 * Place the requested ids into the slots those products already occupy.
 * Everything else keeps its relative order. Duplicate and blank ids are ignored.
 */
export function mergeProductOrder(currentIds: readonly string[], requestedIds: readonly string[]) {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const raw of requestedIds) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  if (!ordered.length) {
    throw new EmptyProductOrderError();
  }

  const known = new Set(currentIds);
  if (ordered.some((id) => !known.has(id))) {
    throw new UnknownProductOrderError();
  }

  const slots = ordered.map((id) => currentIds.indexOf(id)).sort((left, right) => left - right);
  const next = [...currentIds];
  ordered.forEach((id, index) => {
    const slot = slots[index];
    if (slot === undefined) throw new Error("Product order slot is missing");
    next[slot] = id;
  });
  return { ids: next, count: ordered.length };
}
