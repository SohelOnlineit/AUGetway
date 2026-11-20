import type { PublicProductDetail, PublicProductPackage } from "@amarpin/types";

const NAME_TO_CODE: Record<string, string> = {
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  USA: "US",
  BANGLADESH: "BD",
  INDIA: "IN",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",
  ENGLAND: "GB",
  UK: "GB",
  CANADA: "CA",
  AUSTRALIA: "AU",
  GERMANY: "DE",
  FRANCE: "FR",
  JAPAN: "JP",
  "SOUTH KOREA": "KR",
  KOREA: "KR",
  SINGAPORE: "SG",
  MALAYSIA: "MY",
  INDONESIA: "ID",
  PHILIPPINES: "PH",
  PAKISTAN: "PK",
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
  "SAUDI ARABIA": "SA",
  TURKEY: "TR",
  BRAZIL: "BR",
  MEXICO: "MX",
  ITALY: "IT",
  SPAIN: "ES",
  NETHERLANDS: "NL",
  POLAND: "PL",
  SWEDEN: "SE",
  NORWAY: "NO",
  DENMARK: "DK",
  FINLAND: "FI",
  IRELAND: "IE",
  PORTUGAL: "PT",
  GREECE: "GR",
  THAILAND: "TH",
  VIETNAM: "VN",
  "HONG KONG": "HK",
  TAIWAN: "TW",
  CHINA: "CN",
  RUSSIA: "RU",
  UKRAINE: "UA",
  "SOUTH AFRICA": "ZA",
  EGYPT: "EG",
  NIGERIA: "NG",
  ARGENTINA: "AR",
  CHILE: "CL",
  COLOMBIA: "CO",
  PERU: "PE",
  "NEW ZEALAND": "NZ",
  QATAR: "QA",
  KUWAIT: "KW",
  OMAN: "OM",
  BAHRAIN: "BH",
  JORDAN: "JO",
  LEBANON: "LB",
  ISRAEL: "IL",
  SWITZERLAND: "CH",
  AUSTRIA: "AT",
  BELGIUM: "BE",
  "CZECH REPUBLIC": "CZ",
  ROMANIA: "RO",
  HUNGARY: "HU",
};

/** One key for a region code and its country name, so US matches USA and BD matches BANGLADESH. */
export function regionKey(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (NAME_TO_CODE[normalized]) return NAME_TO_CODE[normalized];
  const paren = normalized.match(/\(([A-Z]{2,3})\)/)?.[1];
  if (paren && NAME_TO_CODE[paren]) return NAME_TO_CODE[paren];
  if (paren && /^[A-Z]{2}$/.test(paren)) return paren;
  return normalized;
}

export function sameRegion(left: string, right: string): boolean {
  const a = regionKey(left);
  const b = regionKey(right);
  return a.length > 0 && a === b;
}

/** Country flag for a region code or name. Global regions have no flag. */
export function regionFlagSrc(region: string): string | null {
  const code = regionKey(region);
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

function coversRegion(pkg: PublicProductPackage, region: string) {
  const tags = pkg.regions.length ? pkg.regions : pkg.region ? [pkg.region] : [];
  if (!tags.length) return true;
  return tags.some((tag) => sameRegion(tag, region));
}

/** Out-of-stock packages stay on the product page only for an administrator. */
export function hideOutOfStockPackages(product: PublicProductDetail): PublicProductDetail {
  if (product.packages.length === 0) return product;
  const packages = product.packages.filter((pkg) => pkg.inStock);
  const regions = product.regions.filter((region) => packages.some((pkg) => coversRegion(pkg, region)));
  const defaultRegion =
    product.defaultRegion && regions.some((region) => sameRegion(region, product.defaultRegion ?? ""))
      ? product.defaultRegion
      : (regions[0] ?? null);
  return { ...product, packages, regions, defaultRegion };
}
