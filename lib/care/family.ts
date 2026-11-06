/**
 * 늘곁 패밀리 대시보드 — guardian-side access rules and view model.
 *
 * A guardian sees ONLY residents they are linked to with a confirmed authority; a family relationship alone is not enough
 * (same rule as the family report module). Staff identities are not exposed to families (role only), and internal notes are
 * never included.
 */
import type { CareEvent, CareType, MunicipalCareStatus, TimelineStatus } from "./types";
import { CARE_TYPE_LABEL } from "./types";
import { buildDailyTimeline, isFuture, summarizePeriod, type CarePlanItem, type PeriodSummary } from "./timeline";

export interface GuardianAccount {
  guardian_account_id: string;
  name: string;
  links: { resident_id: string; authority: "법정대리인(후견인)" | "환자 지정 보호자" | "권한 확인 전"; revoked: boolean }[];
}

export type FamilyAccess = { ok: true } | { ok: false; error: "NOT_LINKED" | "AUTHORITY_UNVERIFIED" | "LINK_REVOKED" };

export function canGuardianView(account: GuardianAccount, residentId: string): FamilyAccess {
  const link = account.links.find((l) => l.resident_id === residentId);
  if (!link) return { ok: false, error: "NOT_LINKED" };
  if (link.revoked) return { ok: false, error: "LINK_REVOKED" };
  if (link.authority === "권한 확인 전") return { ok: false, error: "AUTHORITY_UNVERIFIED" };
  return { ok: true };
}

export function viewableResidents(account: GuardianAccount): string[] {
  return account.links.filter((l) => canGuardianView(account, l.resident_id).ok).map((l) => l.resident_id);
}

/** Care types families see. Observation notes stay internal unless a staff member writes a family-shareable note elsewhere. */
export const FAMILY_VISIBLE_CARE: readonly CareType[] = ["repositioning", "medication_assist", "diaper_change", "meal_assist", "hydration", "mobility_assist", "hygiene"];

export interface FamilyTimelineItem {
  time: string;              // HH:MM
  label: string;
  status: TimelineStatus;
  performerRole: string | null;   // e.g. "요양보호사" — never a name
}

export interface MunicipalLink {
  resident_id: string;
  program: string;                 // e.g. "재가 방문요양", "통합돌봄 방문의료"
  status: MunicipalCareStatus;
  updated_at: string;
  note: string | null;             // guardian-facing note (e.g. which document is needed for 보완)
}

export interface FamilyNotice {
  id: string;
  kind: "missing_care" | "municipal_update" | "report_ready";
  text: string;
  at: string;
}

export interface FamilyDashboard {
  residentId: string;
  today: FamilyTimelineItem[];
  todaySummary: { done: number; verified: number; missing: number; pending: number };
  week: PeriodSummary;
  municipal: MunicipalLink[];
  notices: FamilyNotice[];
}

export function buildFamilyDashboard(
  account: GuardianAccount,
  residentId: string,
  ctx: { date: string; weekDates: string[]; plan: CarePlanItem[]; events: CareEvent[]; staffRoles: Record<string, string>; municipal: MunicipalLink[]; now: string }
): { ok: true; value: FamilyDashboard } | { ok: false; error: string } {
  const access = canGuardianView(account, residentId);
  if (!access.ok) return { ok: false, error: access.error };
  const plan = ctx.plan.filter((p) => FAMILY_VISIBLE_CARE.includes(p.care_type));
  const events = ctx.events.filter((e) => e.resident_id === residentId && FAMILY_VISIBLE_CARE.includes(e.care_type));
  const slots = buildDailyTimeline(residentId, ctx.date, plan, events, ctx.now).filter((s) => !isFuture(s, ctx.now));
  const today: FamilyTimelineItem[] = slots.map((s) => ({
    time: (s.event?.performed_at ?? s.planned_at ?? "").slice(11, 16),
    label: CARE_TYPE_LABEL[s.care_type],
    status: s.status,
    performerRole: s.event ? ctx.staffRoles[s.event.staff_id] ?? null : null
  }));
  const count = (st: TimelineStatus[]) => today.filter((x) => st.includes(x.status)).length;
  const week = summarizePeriod(residentId, ctx.weekDates, plan, events, [], ctx.now);
  week.byStaff = [];   // staff detail is a facility-internal report
  const municipal = ctx.municipal.filter((m) => m.resident_id === residentId);
  const notices: FamilyNotice[] = [
    ...slots.filter((s) => s.status === "Missing").map((s) => ({ id: `miss-${s.key}`, kind: "missing_care" as const, text: `${CARE_TYPE_LABEL[s.care_type]} ${s.planned_at!.slice(11, 16)} 예정 업무의 기록이 아직 없어요. 병동에 확인을 요청했어요.`, at: ctx.now })),
    ...municipal.map((m) => ({ id: `mun-${m.program}`, kind: "municipal_update" as const, text: `${m.program}: ${m.status}${m.note ? ` · ${m.note}` : ""}`, at: m.updated_at }))
  ];
  return {
    ok: true,
    value: {
      residentId, today, week, municipal, notices,
      todaySummary: { done: count(["Staff-confirmed", "Independently verified"]), verified: count(["Independently verified"]), missing: count(["Missing"]), pending: count(["Recorded", "Unconfirmed"]) }
    }
  };
}

export const FAMILY_ACCESS_TEXT: Record<string, string> = {
  NOT_LINKED: "연결된 환자가 아니에요. 병원에 보호자 등록을 요청해 주세요.",
  AUTHORITY_UNVERIFIED: "보호자 권한 확인 전이에요. 병원 사회사업팀에서 확인 후 열람할 수 있어요.",
  LINK_REVOKED: "열람 권한이 해제되었어요."
};
