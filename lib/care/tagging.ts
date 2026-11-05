/**
 * Quick Tagging — capture → validate → record (server time) → confirm → verify → correct (append-only), with an audit trail.
 * Pure functions: the same rules run in the demo UI and in tests; a production server must run them server-side.
 */
import type { AuditEntry, CareEvent, CareType, Resident, SourceDevice, Staff } from "./types";
import { CARE_TYPES } from "./types";

export type TagError =
  | "STAFF_NOT_AUTHENTICATED"
  | "STAFF_INACTIVE"
  | "RESIDENT_TAG_INVALID"
  | "RESIDENT_NOT_FOUND"
  | "STAFF_NOT_ASSIGNED_TO_WARD"
  | "CARE_TYPE_INVALID"
  | "PERFORMED_AT_INVALID"
  | "PERFORMED_AT_IN_FUTURE"
  | "PERFORMED_AT_TOO_OLD"
  | "DUPLICATE_EVENT"
  | "NOTES_TOO_LONG"
  | "NOT_PERFORMING_STAFF"
  | "VERIFIER_MUST_DIFFER"
  | "VERIFIER_ROLE_NOT_ALLOWED"
  | "INVALID_STATE"
  | "CORRECTION_REASON_REQUIRED";

export type Result<T> = { ok: true; value: T } | { ok: false; error: TagError };
const fail = <T>(error: TagError): Result<T> => ({ ok: false, error });

// ---------- tag payloads ----------
/**
 * Bedside tag payload (QR text or NFC NDEF text record): `NGT1:R:<tagId>:<check>`.
 * DEMO check digit only (detects typos / damaged tags). PRODUCTION: the tag must hold an opaque, server-issued id and the server
 * resolves it; never trust a resident id embedded in a tag.
 */
export function tagCheck(tagId: string): string {
  let h = 7;
  for (const ch of tagId) h = (h * 31 + ch.charCodeAt(0)) % 1679616;
  return h.toString(36).toUpperCase().padStart(4, "0");
}
export function encodeResidentTag(tagId: string): string {
  return `NGT1:R:${tagId}:${tagCheck(tagId)}`;
}
export function parseResidentTag(raw: string): Result<string> {
  const m = /^NGT1:R:([A-Z0-9-]{4,40}):([0-9A-Z]{4})$/.exec(raw.trim());
  if (!m || tagCheck(m[1]) !== m[2]) return fail("RESIDENT_TAG_INVALID");
  return { ok: true, value: m[1] };
}

export function authenticateStaff(badgeId: string | null | undefined, directory: Staff[]): Result<Staff> {
  const s = badgeId ? directory.find((x) => x.badgeId === badgeId) : undefined;
  if (!s) return fail("STAFF_NOT_AUTHENTICATED");
  if (!s.active) return fail("STAFF_INACTIVE");
  return { ok: true, value: s };
}

export function resolveResident(tagId: string, residents: Resident[]): Result<Resident> {
  const r = residents.find((x) => x.tagId === tagId);
  return r ? { ok: true, value: r } : fail("RESIDENT_NOT_FOUND");
}

/** Staff may record care only for residents of a ward they are assigned to (resident isolation). */
export function canRecordFor(staff: Staff, resident: Resident): boolean {
  return staff.active && staff.wards.includes(resident.ward);
}

// ---------- duplicate guard ----------
/** Minimum minutes between two events of the same type for the same resident by the same staff member. */
export const DUPLICATE_WINDOW_MIN: Record<CareType, number> = {
  repositioning: 30,
  medication_assist: 30,
  diaper_change: 20,
  meal_assist: 60,
  hydration: 15,
  mobility_assist: 10,
  hygiene: 30,
  observation: 5,
  other: 5
};

const ms = (iso: string) => new Date(iso).getTime();

export function findDuplicate(events: CareEvent[], candidate: Pick<CareEvent, "resident_id" | "staff_id" | "care_type" | "performed_at" | "client_event_id">): CareEvent | null {
  const win = DUPLICATE_WINDOW_MIN[candidate.care_type] * 60_000;
  return (
    events.find((e) => e.client_event_id === candidate.client_event_id) ??
    events.find(
      (e) =>
        e.confirmation_status !== "voided" &&
        e.resident_id === candidate.resident_id &&
        e.staff_id === candidate.staff_id &&
        e.care_type === candidate.care_type &&
        Math.abs(ms(e.performed_at) - ms(candidate.performed_at)) < win
    ) ??
    null
  );
}

// ---------- create ----------
export interface CreateInput {
  staff: Staff;
  resident: Resident;
  careType: string;
  source: SourceDevice;
  clientEventId: string;
  serverNow: string;            // server clock (ISO). recorded_at is ALWAYS the server time.
  performedAt?: string | null;  // optional back-dated time chosen by staff (e.g. offline capture)
  notes?: string | null;
  newId: () => string;
}

export const MAX_BACKDATE_HOURS = 12;

export function createCareEvent(existing: CareEvent[], i: CreateInput): Result<CareEvent> {
  if (!i.staff.active) return fail("STAFF_INACTIVE");
  if (!canRecordFor(i.staff, i.resident)) return fail("STAFF_NOT_ASSIGNED_TO_WARD");
  if (!(CARE_TYPES as readonly string[]).includes(i.careType)) return fail("CARE_TYPE_INVALID");
  const performed = i.performedAt ?? i.serverNow;
  if (Number.isNaN(ms(performed))) return fail("PERFORMED_AT_INVALID");
  if (ms(performed) > ms(i.serverNow) + 60_000) return fail("PERFORMED_AT_IN_FUTURE");
  if (ms(i.serverNow) - ms(performed) > MAX_BACKDATE_HOURS * 3_600_000) return fail("PERFORMED_AT_TOO_OLD");
  const notes = i.notes?.trim() || null;
  if (notes && notes.length > 500) return fail("NOTES_TOO_LONG");
  const careType = i.careType as CareType;
  const dup = findDuplicate(existing, { resident_id: i.resident.id, staff_id: i.staff.id, care_type: careType, performed_at: performed, client_event_id: i.clientEventId });
  if (dup) return fail("DUPLICATE_EVENT");
  return {
    ok: true,
    value: {
      care_event_id: i.newId(),
      client_event_id: i.clientEventId,
      resident_id: i.resident.id,
      staff_id: i.staff.id,
      care_type: careType,
      performed_at: performed,
      recorded_at: i.serverNow,
      source_device: i.source,
      confirmation_status: "recorded",
      confirmed_at: null,
      verified_by: null,
      verified_at: null,
      notes,
      correction_reference: null,
      created_at: i.serverNow
    }
  };
}

// ---------- confirm / verify ----------
/** Step 2: the performing staff member confirms "I did this" (a tag touch alone never completes care). */
export function confirmEvent(e: CareEvent, staff: Staff, serverNow: string): Result<CareEvent> {
  if (e.staff_id !== staff.id) return fail("NOT_PERFORMING_STAFF");
  if (e.confirmation_status !== "recorded") return fail("INVALID_STATE");
  return { ok: true, value: { ...e, confirmation_status: "staff_confirmed", confirmed_at: serverNow } };
}

export const VERIFIER_ROLES: readonly string[] = ["간호사"];

/** Step 3 (optional): a DIFFERENT, authorised staff member (nurse) on the same ward verifies the confirmed event. */
export function verifyEvent(e: CareEvent, verifier: Staff, resident: Resident, serverNow: string): Result<CareEvent> {
  if (verifier.id === e.staff_id) return fail("VERIFIER_MUST_DIFFER");
  if (!VERIFIER_ROLES.includes(verifier.role)) return fail("VERIFIER_ROLE_NOT_ALLOWED");
  if (!canRecordFor(verifier, resident)) return fail("STAFF_NOT_ASSIGNED_TO_WARD");
  if (e.confirmation_status !== "staff_confirmed") return fail("INVALID_STATE");
  return { ok: true, value: { ...e, confirmation_status: "independently_verified", verified_by: verifier.id, verified_at: serverNow } };
}

// ---------- corrections (append-only) ----------
/**
 * A correction never edits history: the original is marked "voided" and a NEW event referencing it carries the corrected values.
 * Only the original recorder (or a nurse on the ward) may correct, and a reason is mandatory.
 */
export function correctEvent(
  events: CareEvent[],
  originalId: string,
  by: Staff,
  resident: Resident,
  patch: { careType?: CareType; performedAt?: string; notes?: string | null },
  reason: string,
  serverNow: string,
  newId: () => string
): Result<{ voided: CareEvent; replacement: CareEvent }> {
  const orig = events.find((e) => e.care_event_id === originalId);
  if (!orig || orig.confirmation_status === "voided") return fail("INVALID_STATE");
  if (!reason.trim()) return fail("CORRECTION_REASON_REQUIRED");
  if (orig.staff_id !== by.id && !(VERIFIER_ROLES.includes(by.role) && canRecordFor(by, resident))) return fail("NOT_PERFORMING_STAFF");
  const performed = patch.performedAt ?? orig.performed_at;
  if (Number.isNaN(ms(performed))) return fail("PERFORMED_AT_INVALID");
  if (ms(performed) > ms(serverNow) + 60_000) return fail("PERFORMED_AT_IN_FUTURE");
  const voided: CareEvent = { ...orig, confirmation_status: "voided" };
  const replacement: CareEvent = {
    ...orig,
    care_event_id: newId(),
    client_event_id: `${orig.client_event_id}:corr:${serverNow}`,
    care_type: patch.careType ?? orig.care_type,
    performed_at: performed,
    notes: patch.notes === undefined ? orig.notes : patch.notes,
    recorded_at: serverNow,
    created_at: serverNow,
    confirmation_status: "recorded",          // a corrected record must be confirmed again
    confirmed_at: null,
    verified_by: null,
    verified_at: null,
    correction_reference: orig.care_event_id
  };
  return { ok: true, value: { voided, replacement } };
}

// ---------- audit ----------
export function auditEntry(seq: number, at: string, actor: string | null, action: AuditEntry["action"], residentId: string | null, targetId: string | null, detail = ""): AuditEntry {
  return { id: `CAUD-${String(seq).padStart(5, "0")}`, at, actor_staff_id: actor, action, resident_id: residentId, target_id: targetId, detail };
}

// ---------- offline queue ----------
export interface QueuedCapture {
  clientEventId: string;
  badgeId: string;
  residentTag: string;
  careType: CareType;
  source: SourceDevice;
  capturedAt: string;     // device time at capture; becomes performed_at (bounded by MAX_BACKDATE_HOURS)
  notes?: string | null;
}

/** Replays offline captures against the server rules. Idempotent: a capture already synced (same clientEventId) is skipped. */
export function syncOfflineQueue(
  queue: QueuedCapture[],
  ctx: { events: CareEvent[]; staff: Staff[]; residents: Resident[]; serverNow: string; newId: () => string }
): { accepted: CareEvent[]; rejected: { clientEventId: string; error: TagError }[]; skipped: string[] } {
  const accepted: CareEvent[] = [];
  const rejected: { clientEventId: string; error: TagError }[] = [];
  const skipped: string[] = [];
  let all = [...ctx.events];
  for (const q of queue) {
    if (all.some((e) => e.client_event_id === q.clientEventId)) { skipped.push(q.clientEventId); continue; }
    const s = authenticateStaff(q.badgeId, ctx.staff);
    if (!s.ok) { rejected.push({ clientEventId: q.clientEventId, error: s.error }); continue; }
    const t = parseResidentTag(q.residentTag);
    if (!t.ok) { rejected.push({ clientEventId: q.clientEventId, error: t.error }); continue; }
    const r = resolveResident(t.value, ctx.residents);
    if (!r.ok) { rejected.push({ clientEventId: q.clientEventId, error: r.error }); continue; }
    const c = createCareEvent(all, { staff: s.value, resident: r.value, careType: q.careType, source: q.source, clientEventId: q.clientEventId, serverNow: ctx.serverNow, performedAt: q.capturedAt, notes: q.notes, newId: ctx.newId });
    if (!c.ok) { rejected.push({ clientEventId: q.clientEventId, error: c.error }); continue; }
    accepted.push(c.value);
    all = [...all, c.value];
  }
  return { accepted, rejected, skipped };
}

export const TAG_ERROR_TEXT: Record<TagError, string> = {
  STAFF_NOT_AUTHENTICATED: "사원증 인증에 실패했어요. 다시 태그해 주세요.",
  STAFF_INACTIVE: "비활성화된 직원 계정이에요.",
  RESIDENT_TAG_INVALID: "환자 태그를 읽을 수 없어요. 태그를 다시 확인해 주세요.",
  RESIDENT_NOT_FOUND: "등록되지 않은 환자 태그예요.",
  STAFF_NOT_ASSIGNED_TO_WARD: "담당 병동이 아닌 환자예요. 기록 권한이 없어요.",
  CARE_TYPE_INVALID: "케어 항목을 선택해 주세요.",
  PERFORMED_AT_INVALID: "수행 시각이 올바르지 않아요.",
  PERFORMED_AT_IN_FUTURE: "미래 시각으로는 기록할 수 없어요.",
  PERFORMED_AT_TOO_OLD: `${MAX_BACKDATE_HOURS}시간보다 오래된 업무는 수정 기록으로 남겨 주세요.`,
  DUPLICATE_EVENT: "같은 업무가 방금 기록됐어요. 중복 기록을 막았어요.",
  NOTES_TOO_LONG: "메모는 500자까지 쓸 수 있어요.",
  NOT_PERFORMING_STAFF: "직접 수행한 직원만 확인할 수 있어요.",
  VERIFIER_MUST_DIFFER: "검증은 수행자가 아닌 다른 직원이 해야 해요.",
  VERIFIER_ROLE_NOT_ALLOWED: "검증 권한이 있는 직원(간호사)만 검증할 수 있어요.",
  INVALID_STATE: "현재 상태에서는 처리할 수 없어요.",
  CORRECTION_REASON_REQUIRED: "수정 사유를 입력해 주세요."
};
