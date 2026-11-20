export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "****";
  return `${trimmed.slice(0, 2)}${"*".repeat(Math.min(trimmed.length - 4, 8))}${trimmed.slice(-2)}`;
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\s+/g, "");
  if (digits.length < 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}
