/**
 * Deterministic demo clock. Simulated events advance a tick counter instead of
 * reading the wall clock, so demo runs and tests are reproducible.
 * Base: 2026-11-03 14:00 KST, +3 minutes per tick.
 */
const BASE_MINUTES = 14 * 60;

export function demoNow(tick: number): string {
  const total = BASE_MINUTES + tick * 3;
  const dayOffset = Math.floor(total / (24 * 60));
  const minutes = total % (24 * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const day = String(3 + dayOffset).padStart(2, "0");
  return `2026-11-${day}T${hh}:${mm}:00+09:00`;
}

export function formatKst(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso || "—";
  return `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}`;
}
