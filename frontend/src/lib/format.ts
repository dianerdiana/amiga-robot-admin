/**
 * Display formats per the PRD usability NFR: Rp1.250.000,00 and dd/mm/yyyy (WIB).
 */

const TIME_ZONE = "Asia/Jakarta";

const rupiahNumber = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The API sends amounts as decimal strings to keep full precision. */
export function formatRupiah(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return "-";
  return `${amount < 0 ? "-" : ""}Rp${rupiahNumber.format(Math.abs(amount))}`;
}

export function formatQuantity(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const quantity = Number(value);
  return Number.isNaN(quantity) ? value : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(quantity);
}

/** ISO date (YYYY-MM-DD) or timestamp to dd/mm/yyyy. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** Timestamp to "24/02/2026 09:15 WIB"; withSeconds is used by the audit table. */
export function formatDateTime(value: string | null | undefined, withSeconds = false): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(date);
  return `${formatDate(value)} ${time}${withSeconds ? "" : " WIB"}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Today's date (WIB) in ISO format, used as a form default. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}
