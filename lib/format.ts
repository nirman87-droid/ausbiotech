// Date formatting in Australian style. Brisbane time, because the event runs on the Gold Coast.
export const TIME_ZONE = "Australia/Brisbane";

export function formatDate(value: Date | string | null | undefined, withYear = true): string {
  if (!value) return "";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+10:00`) : new Date(value);
  return d.toLocaleDateString("en-AU", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-AU", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-AU", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

export function minutesAgo(value: Date | string | null | undefined, now = Date.now()): string {
  if (!value) return "never";
  const m = Math.round((now - new Date(value).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

// For <input type="datetime-local"> in Brisbane time (UTC+10, no daylight saving).
export function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(new Date(value).getTime() + 10 * 3_600_000);
  return d.toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}:00+10:00`).toISOString();
}
