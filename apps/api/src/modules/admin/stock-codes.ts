export function splitStockCodes(existing: Iterable<string>, incoming: string[]) {
  const seen = new Set(existing);
  const fresh: string[] = [];
  const duplicates: string[] = [];
  for (const raw of incoming) {
    const code = raw.trim();
    if (code.length < 4) continue;
    if (seen.has(code)) duplicates.push(code);
    else {
      seen.add(code);
      fresh.push(code);
    }
  }
  return { fresh, duplicates: [...new Set(duplicates)] };
}
