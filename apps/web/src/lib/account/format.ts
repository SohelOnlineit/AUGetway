export function formatPrice(minor: number, currency = "BDT"): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat("en-BD", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}
