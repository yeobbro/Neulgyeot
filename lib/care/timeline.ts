/**
 * Care timeline and reporting: planned schedule vs. recorded events, per day / week / month, per care type and per staff member.
 * A planned item without a matching event is "Missing"; an event that is not yet confirmed by the performer is "Unconfirmed"
 * once its confirmation grace period has passed. Nothing unverified is ever shown as verified.
 */
import type { CareEvent, CareType, Staff, TimelineStatus } from "./types";
import { CARE_TYPES } from "./types";

export interface CarePlanItem {
  resident_id: string;
  care_type: CareType;
  /** times of day "HH:MM" (KST) the care is planned */
  times: string[];
}

export interface TimelineSlot {
  key: string;
  resident_id: string;
  care_type: CareType;
  planned_at: string | null;       // null = unplanned (ad-hoc) care
  event: CareEvent | null;
  status: TimelineStatus;
  delay_min: number | null;        // performed_at − planned_at
}

export const MATCH_WINDOW_MIN = 90;            // an event within ±90 min of a planned time fulfils that slot
export const CONFIRM_GRACE_MIN = 30;           // after this, an unconfirmed "recorded" event is shown as Unconfirmed

const t = (iso: string) => new Date(iso).getTime();
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00+09:00`;
const kstDate = (iso: string) => {
  const d = new Date(t(iso) + 9 * 3_600_000);
  return d.toISOString().slice(0, 10);
};

export function eventStatus(e: CareEvent, now: string): TimelineStatus {
  if (e.confirmation_status === "independently_verified") return "Independently verified";
  if (e.confirmation_status === "staff_confirmed") return "Staff-confirmed";
  return t(now) - t(e.recorded_at) > CONFIRM_GRACE_MIN * 60_000 ? "Unconfirmed" : "Recorded";
}

/** Daily timeline for one resident (date = YYYY-MM-DD in KST). Voided events (replaced by a correction) are excluded. */
export function buildDailyTimeline(residentId: string, date: string, plan: CarePlanItem[], events: CareEvent[], now: string): TimelineSlot[] {
  const day = events.filter((e) => e.resident_id === residentId && e.confirmation_status !== "voided" && kstDate(e.performed_at) === date);
  const used = new Set<string>();
  const slots: TimelineSlot[] = [];
  for (const p of plan.filter((x) => x.resident_id === residentId)) {
    for (const hhmm of p.times) {
      const planned = at(date, hhmm);
      const match = day
        .filter((e) => e.care_type === p.care_type && !used.has(e.care_event_id) && Math.abs(t(e.performed_at) - t(planned)) <= MATCH_WINDOW_MIN * 60_000)
        .sort((a, b) => Math.abs(t(a.performed_at) - t(planned)) - Math.abs(t(b.performed_at) - t(planned)))[0];
      if (match) used.add(match.care_event_id);
      const due = t(now) > t(planned) + MATCH_WINDOW_MIN * 60_000;
      slots.push({
        key: `${p.care_type}@${hhmm}`,
        resident_id: residentId,
        care_type: p.care_type,
        planned_at: planned,
        event: match ?? null,
        status: match ? eventStatus(match, now) : due ? "Missing" : "Unconfirmed",
        delay_min: match ? Math.round((t(match.performed_at) - t(planned)) / 60_000) : null
      });
    }
  }
  for (const e of day) {
    if (used.has(e.care_event_id)) continue;
    slots.push({ key: `adhoc:${e.care_event_id}`, resident_id: residentId, care_type: e.care_type, planned_at: null, event: e, status: eventStatus(e, now), delay_min: null });
  }
  return slots.sort((a, b) => t(a.planned_at ?? a.event!.performed_at) - t(b.planned_at ?? b.event!.performed_at));
}

/** Future planned slots are "Unconfirmed" (not yet due) — callers that want only due items can filter by planned_at ≤ now. */
export function isFuture(slot: TimelineSlot, now: string): boolean {
  return !!slot.planned_at && !slot.event && t(slot.planned_at) + MATCH_WINDOW_MIN * 60_000 >= t(now);
}

export interface PeriodSummary {
  from: string; to: string;
  planned: number; fulfilled: number; missing: number;
  byStatus: Record<TimelineStatus, number>;
  byCareType: Record<CareType, { planned: number; fulfilled: number; missing: number; adhoc: number }>;
  byStaff: { staff_id: string; name: string; events: number; confirmed: number; verified: number }[];
  avgDelayMin: number | null;
  verifiedRate: number | null;      // share of fulfilled slots that were independently verified
}

export function dateRange(from: string, days: number): string[] {
  const out: string[] = [];
  const base = new Date(`${from}T00:00:00Z`).getTime();
  for (let i = 0; i < days; i++) out.push(new Date(base + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

export function summarizePeriod(residentId: string, dates: string[], plan: CarePlanItem[], events: CareEvent[], staff: Staff[], now: string): PeriodSummary {
  const byStatus = { Recorded: 0, "Staff-confirmed": 0, "Independently verified": 0, Missing: 0, Unconfirmed: 0 } as Record<TimelineStatus, number>;
  const byCareType = Object.fromEntries(CARE_TYPES.map((c) => [c, { planned: 0, fulfilled: 0, missing: 0, adhoc: 0 }])) as PeriodSummary["byCareType"];
  const staffMap = new Map<string, { staff_id: string; name: string; events: number; confirmed: number; verified: number }>();
  let planned = 0, fulfilled = 0, missing = 0, delaySum = 0, delayN = 0, verified = 0;
  for (const d of dates) {
    for (const s of buildDailyTimeline(residentId, d, plan, events, now)) {
      if (isFuture(s, now)) continue;
      byStatus[s.status]++;
      const ct = byCareType[s.care_type];
      if (s.planned_at) { planned++; ct.planned++; }
      if (s.planned_at && s.event) { fulfilled++; ct.fulfilled++; if (s.delay_min != null) { delaySum += Math.abs(s.delay_min); delayN++; } if (s.status === "Independently verified") verified++; }
      if (s.status === "Missing") { missing++; ct.missing++; }
      if (!s.planned_at) ct.adhoc++;
      if (s.event) {
        const who = staff.find((x) => x.id === s.event!.staff_id);
        const row = staffMap.get(s.event.staff_id) ?? { staff_id: s.event.staff_id, name: who?.name ?? "알 수 없음", events: 0, confirmed: 0, verified: 0 };
        row.events++;
        if (s.status === "Staff-confirmed" || s.status === "Independently verified") row.confirmed++;
        if (s.status === "Independently verified") row.verified++;
        staffMap.set(s.event.staff_id, row);
      }
    }
  }
  return {
    from: dates[0], to: dates[dates.length - 1], planned, fulfilled, missing, byStatus, byCareType,
    byStaff: [...staffMap.values()].sort((a, b) => b.events - a.events),
    avgDelayMin: delayN ? Math.round(delaySum / delayN) : null,
    verifiedRate: fulfilled ? Math.round((verified / fulfilled) * 100) / 100 : null
  };
}

/** Plain-text report (CSV) for download. Staff names are included only in the facility report, never in the family report. */
export function summaryToCsv(s: PeriodSummary, labels: Record<CareType, string>, opts: { includeStaff: boolean }): string {
  const rows = [["항목", "계획", "수행 기록", "누락", "계획 외 기록"]];
  for (const c of CARE_TYPES) {
    const r = s.byCareType[c];
    if (!r.planned && !r.adhoc) continue;
    rows.push([labels[c], String(r.planned), String(r.fulfilled), String(r.missing), String(r.adhoc)]);
  }
  rows.push([]);
  rows.push(["상태", "건수"]);
  for (const [k, v] of Object.entries(s.byStatus)) rows.push([k, String(v)]);
  if (opts.includeStaff) {
    rows.push([]);
    rows.push(["담당자", "기록", "수행자 확인", "독립 검증"]);
    for (const r of s.byStaff) rows.push([r.name, String(r.events), String(r.confirmed), String(r.verified)]);
  }
  rows.push([]);
  rows.push([`기간 ${s.from} ~ ${s.to} · DEMO 합성 데이터 · 기록 상태는 실제 수행의 독립 검증 여부를 구분해 표시함`]);
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
}
