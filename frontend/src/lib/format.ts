/** Ovigo is a Bangladesh-focused marketplace — every price on the platform is
 * BDT (see backend/app/modules/bookings/models.py's module docstring), so this
 * formats with the Taka symbol rather than taking a currency code per call. */
export function formatMoney(amount: string | number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `৳${amount}`;
  // South Asian digit grouping (1,30,000), and no ".00" on whole amounts.
  const fractional = Math.round(Math.abs(n) * 100) % 100 !== 0;
  const digits = Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "−" : ""}৳${digits}`;
}

/** Today as YYYY-MM-DD in the visitor's own timezone. */
export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return parseIsoDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...opts,
  });
}

export function formatDateRange(start: string, end?: string | null): string {
  if (!end || end === start) return formatDay(start, { year: "numeric" });
  return `${formatDay(start)} – ${formatDay(end, { year: "numeric" })}`;
}

/** "0.10" → "10%" */
export function percent(rate: string | null | undefined): string | null {
  if (rate === null || rate === undefined || rate === "") return null;
  const value = Number(rate) * 100;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function hoursLabel(hours: string | null | undefined): string | null {
  if (!hours) return null;
  const h = Number(hours);
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr${h === 1 ? "" : "s"}`;
}

/** Splits free text into paragraphs on blank lines (single newlines stay as line breaks). */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function responseTimeLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `within ${Math.max(minutes, 1)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `within ${plural(hours, "hour")}`;
  return `within ${plural(Math.round(hours / 24), "day")}`;
}
