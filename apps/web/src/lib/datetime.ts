const TIME_ZONE = "Asia/Dhaka";

function asDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function valid(value: string | Date) {
  const date = asDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Bangladesh date and 12-hour time, for example November 2, 2026, 1:38 PM. */
export function formatBangladeshDateTime(value: string | Date) {
  const date = valid(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Bangladesh calendar date. Numeric form is 11/2/2026. */
export function formatBangladeshDate(value: string | Date, numeric = false) {
  const date = valid(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: numeric ? "numeric" : "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatBangladeshTime(value: string | Date) {
  const date = valid(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function isBangladeshToday(value: string | Date) {
  const date = valid(value);
  if (!date) return false;
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return key.format(date) === key.format(new Date());
}
