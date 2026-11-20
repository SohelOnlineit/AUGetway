import { BadRequestException } from "@nestjs/common";
import { DEFAULT_PUBLIC_CONTACT, type PublicContactDetails } from "@amarpin/types";
import type { StorefrontId } from "../modules/catalog/storefronts";

const PHONE_CHARS = /^[0-9+().\-\s]+$/;

export function contactDetailsKey(shop: StorefrontId) {
  return `contact.details.${shop}`;
}

export function parseContactDetails(raw: string | null | undefined): PublicContactDetails {
  if (!raw) return DEFAULT_PUBLIC_CONTACT;
  try {
    const parsed = JSON.parse(raw) as Partial<PublicContactDetails>;
    return requireContactDetails(parsed);
  } catch {
    return DEFAULT_PUBLIC_CONTACT;
  }
}

export function requireContactDetails(input: {
  phone?: string;
  address?: string;
  whatsapp?: string;
}): PublicContactDetails {
  const phone = cleanPhone(input.phone);
  const address = cleanAddress(input.address);
  const whatsapp = cleanWhatsapp(input.whatsapp);
  if (!phone) {
    throw new BadRequestException("Enter a mobile number with 6 to 20 digits.");
  }
  if (!address) {
    throw new BadRequestException("Enter an address between 4 and 300 characters.");
  }
  if (!whatsapp) {
    throw new BadRequestException("Enter a WhatsApp number or a https://wa.me link.");
  }
  return {
    phone,
    address,
    whatsapp,
    whatsappUrl: toWhatsappUrl(whatsapp),
  };
}

function cleanPhone(value: unknown) {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/\s+/g, " ");
  const digits = phone.replace(/\D/g, "");
  if (!phone || phone.length > 30 || digits.length < 6 || digits.length > 20) return null;
  if (!PHONE_CHARS.test(phone)) return null;
  return phone;
}

function cleanAddress(value: unknown) {
  if (typeof value !== "string") return null;
  const address = value.trim().replace(/\s+/g, " ");
  if (address.length < 4 || address.length > 300) return null;
  if (/[<>]/.test(address)) return null;
  return address;
}

function cleanWhatsapp(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 200) return null;
  if (/^https:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    const host = url.hostname.replace(/^www\./, "");
    const digits =
      host === "wa.me"
        ? url.pathname.replace(/\D/g, "")
        : host === "api.whatsapp.com" || host === "whatsapp.com"
          ? (url.searchParams.get("phone") ?? "").replace(/\D/g, "")
          : "";
    if (digits.length < 8 || digits.length > 15) return null;
    return `https://wa.me/${digits}`;
  }
  const phone = cleanPhone(raw);
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return phone;
}

function toWhatsappUrl(whatsapp: string) {
  if (whatsapp.startsWith("https://")) return whatsapp;
  let digits = whatsapp.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = `880${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}
