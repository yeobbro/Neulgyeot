const dateFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "—");
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");

/** "YYYY-MM-DD" in KST, for date inputs and API period params. */
export const kstDay = (d: Date = new Date()) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export function daysFromNow(iso: string, now = Date.now()) {
  return Math.round((new Date(iso).getTime() - now) / 86_400_000);
}

export function dueLabel(iso: string | null, now = Date.now()) {
  if (!iso) return "기한 없음";
  const d = daysFromNow(iso, now);
  if (d < 0) return `${-d}일 지남`;
  if (d === 0) return "오늘까지";
  return `${d}일 남음`;
}

/** Builds a query string from defined values only. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
