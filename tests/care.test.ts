import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authenticateStaff, confirmEvent, correctEvent, createCareEvent, encodeResidentTag, parseResidentTag, resolveResident,
  syncOfflineQueue, verifyEvent, type CreateInput
} from "../lib/care/tagging";
import { buildDailyTimeline, dateRange, summarizePeriod, summaryToCsv } from "../lib/care/timeline";
import { buildFamilyDashboard, canGuardianView, viewableResidents } from "../lib/care/family";
import { captureRoute, GENERIC_RING_BADGE, GENERIC_WATCH_NO_NFC } from "../lib/care/wearables";
import { CARE_TYPE_LABEL, type CareEvent } from "../lib/care/types";
import { CARE_DEMO_NOW, CARE_PLAN, CARE_RESIDENTS, CARE_STAFF, GUARDIAN_ACCOUNTS, MUNICIPAL_LINKS, SEED_CARE_EVENTS, STAFF_ROLES } from "../lib/demo/care-data";

const staff = (id: string) => CARE_STAFF.find((s) => s.id === id)!;
const res = (id: string) => CARE_RESIDENTS.find((r) => r.id === id)!;
const P1 = res("SYN-P-0001");       // ward 3W
const P3 = res("SYN-P-0003");       // ward 5W
let seq = 0;
const newId = () => `T-${++seq}`;
const errOf = (r: { ok: boolean }) => (r as { error?: string }).error;
const valOf = <T>(r: { ok: boolean }) => (r as unknown as { value: T }).value;
const base = (o: Partial<CreateInput> = {}): CreateInput => ({ staff: staff("ST-C01"), resident: P1, careType: "repositioning", source: "nfc_mobile", clientEventId: `c-${Math.random()}`, serverNow: CARE_DEMO_NOW, newId, ...o });

test("bedside tag round-trip; tampered or damaged tags are rejected", () => {
  const raw = encodeResidentTag(P1.tagId);
  assert.deepEqual(parseResidentTag(raw), { ok: true, value: P1.tagId });
  assert.equal(parseResidentTag(raw.slice(0, -1) + (raw.endsWith("A") ? "B" : "A")).ok, false);
  assert.equal(parseResidentTag("SYN-P-0001").ok, false);
  assert.equal(resolveResident("TAG-9999", CARE_RESIDENTS).ok, false);
});

test("staff authentication by badge; inactive staff refused", () => {
  assert.equal(authenticateStaff("BADGE-C01", CARE_STAFF).ok, true);
  assert.deepEqual(authenticateStaff("BADGE-X01", CARE_STAFF), { ok: false, error: "STAFF_INACTIVE" });
  assert.deepEqual(authenticateStaff("nope", CARE_STAFF), { ok: false, error: "STAFF_NOT_AUTHENTICATED" });
  assert.deepEqual(authenticateStaff(null, CARE_STAFF), { ok: false, error: "STAFF_NOT_AUTHENTICATED" });
});

test("a tag creates a 'recorded' event with SERVER time — never auto-completed", () => {
  const r = createCareEvent([], base({ performedAt: "2026-11-03T13:40:00+09:00" }));
  assert.ok(r.ok);
  assert.equal(r.value.confirmation_status, "recorded");
  assert.equal(r.value.recorded_at, CARE_DEMO_NOW);
  assert.equal(r.value.performed_at, "2026-11-03T13:40:00+09:00");
  assert.equal(r.value.confirmed_at, null);
});

test("resident isolation: staff cannot record for another ward", () => {
  assert.deepEqual(createCareEvent([], base({ resident: P3 })), { ok: false, error: "STAFF_NOT_ASSIGNED_TO_WARD" });
});

test("validation: care type, future time, too-old time, notes length", () => {
  assert.equal(errOf(createCareEvent([], base({ careType: "teleport" }))), "CARE_TYPE_INVALID");
  assert.equal(errOf(createCareEvent([], base({ performedAt: "2026-11-03T15:00:00+09:00" }))), "PERFORMED_AT_IN_FUTURE");
  assert.equal(errOf(createCareEvent([], base({ performedAt: "2026-11-02T20:00:00+09:00" }))), "PERFORMED_AT_TOO_OLD");
  assert.equal(errOf(createCareEvent([], base({ notes: "x".repeat(501) }))), "NOTES_TOO_LONG");
});

test("duplicate tags are blocked (same client id, or same care within the window)", () => {
  const a = createCareEvent([], base({ clientEventId: "dup-1" }));
  assert.ok(a.ok);
  assert.equal(errOf(createCareEvent([a.value], base({ clientEventId: "dup-1" }))), "DUPLICATE_EVENT");
  assert.equal(errOf(createCareEvent([a.value], base({ clientEventId: "dup-2", performedAt: "2026-11-03T13:50:00+09:00" }))), "DUPLICATE_EVENT");
  assert.equal(createCareEvent([a.value], base({ clientEventId: "dup-3", careType: "hydration" })).ok, true, "different care type is fine");
});

test("confirm by performer only; verify by a different nurse on the ward only", () => {
  const e = valOf<CareEvent>(createCareEvent([], base()));
  assert.deepEqual(confirmEvent(e, staff("ST-C02"), CARE_DEMO_NOW), { ok: false, error: "NOT_PERFORMING_STAFF" });
  assert.deepEqual(verifyEvent(e, staff("ST-N01"), P1, CARE_DEMO_NOW), { ok: false, error: "INVALID_STATE" }, "must be confirmed first");
  const c = confirmEvent(e, staff("ST-C01"), CARE_DEMO_NOW);
  assert.ok(c.ok);
  assert.equal(c.value.confirmation_status, "staff_confirmed");
  assert.equal(errOf(verifyEvent(c.value, staff("ST-C01"), P1, CARE_DEMO_NOW)), "VERIFIER_MUST_DIFFER");
  assert.equal(errOf(verifyEvent(c.value, staff("ST-A01"), P1, CARE_DEMO_NOW)), "VERIFIER_ROLE_NOT_ALLOWED");
  assert.equal(errOf(verifyEvent(c.value, staff("ST-N02"), P1, CARE_DEMO_NOW)), "STAFF_NOT_ASSIGNED_TO_WARD");
  const v = verifyEvent(c.value, staff("ST-N01"), P1, CARE_DEMO_NOW);
  assert.ok(v.ok);
  assert.equal(v.value.confirmation_status, "independently_verified");
  assert.equal(v.value.verified_by, "ST-N01");
});

test("corrections are append-only with a mandatory reason; the replacement must be confirmed again", () => {
  const e = valOf<CareEvent>(createCareEvent([], base()));
  const c = valOf<CareEvent>(confirmEvent(e, staff("ST-C01"), CARE_DEMO_NOW));
  assert.equal(errOf(correctEvent([c], c.care_event_id, staff("ST-C01"), P1, { careType: "hygiene" }, " ", CARE_DEMO_NOW, newId)), "CORRECTION_REASON_REQUIRED");
  assert.equal(errOf(correctEvent([c], c.care_event_id, staff("ST-C02"), P1, { careType: "hygiene" }, "잘못 선택", CARE_DEMO_NOW, newId)), "NOT_PERFORMING_STAFF");
  const r = correctEvent([c], c.care_event_id, staff("ST-C01"), P1, { careType: "hygiene" }, "항목 잘못 선택", CARE_DEMO_NOW, newId);
  assert.ok(r.ok);
  assert.equal(r.value.voided.confirmation_status, "voided");
  assert.equal(r.value.voided.care_type, "repositioning", "original values are preserved");
  assert.equal(r.value.replacement.correction_reference, c.care_event_id);
  assert.equal(r.value.replacement.care_type, "hygiene");
  assert.equal(r.value.replacement.confirmation_status, "recorded");
});

test("offline queue sync is idempotent and applies the same rules", () => {
  const q = [
    { clientEventId: "off-1", badgeId: "BADGE-C01", residentTag: encodeResidentTag(P1.tagId), careType: "hydration" as const, source: "qr" as const, capturedAt: "2026-11-03T12:10:00+09:00" },
    { clientEventId: "off-2", badgeId: "BADGE-C01", residentTag: encodeResidentTag(P3.tagId), careType: "hydration" as const, source: "qr" as const, capturedAt: "2026-11-03T12:12:00+09:00" },
    { clientEventId: "off-3", badgeId: "BADGE-C01", residentTag: "garbage", careType: "hydration" as const, source: "qr" as const, capturedAt: "2026-11-03T12:12:00+09:00" }
  ];
  const first = syncOfflineQueue(q, { events: [], staff: CARE_STAFF, residents: CARE_RESIDENTS, serverNow: CARE_DEMO_NOW, newId });
  assert.equal(first.accepted.length, 1);
  assert.equal(first.accepted[0].recorded_at, CARE_DEMO_NOW);
  assert.equal(first.accepted[0].performed_at, "2026-11-03T12:10:00+09:00");
  assert.deepEqual(first.rejected.map((r) => r.error), ["STAFF_NOT_ASSIGNED_TO_WARD", "RESIDENT_TAG_INVALID"]);
  const again = syncOfflineQueue(q.slice(0, 1), { events: first.accepted, staff: CARE_STAFF, residents: CARE_RESIDENTS, serverNow: CARE_DEMO_NOW, newId });
  assert.deepEqual(again.skipped, ["off-1"]);
});

test("wearables: no NFC assumption — routes fall back to QR or confirm-only", () => {
  assert.equal(captureRoute(null), "qr_fallback");
  assert.equal(captureRoute(GENERIC_WATCH_NO_NFC), "wearable_confirm_only");
  assert.equal(captureRoute(GENERIC_RING_BADGE), "qr_fallback");
  assert.equal(captureRoute({ ...GENERIC_WATCH_NO_NFC, capabilities: { nfcRead: true, hostCardEmulation: false, quickActions: true } }), "wearable_nfc");
});

test("timeline: planned vs actual, missing and unconfirmed are distinguished; voided events excluded", () => {
  const slots = buildDailyTimeline(P1.id, "2026-11-03", CARE_PLAN, SEED_CARE_EVENTS, CARE_DEMO_NOW);
  assert.ok(slots.length > 0);
  for (const s of slots) {
    if (s.status === "Independently verified") assert.equal(s.event?.confirmation_status, "independently_verified");
    if (s.status === "Staff-confirmed") assert.equal(s.event?.confirmation_status, "staff_confirmed");
    if (s.status === "Missing") assert.equal(s.event, null);
  }
  const ev = SEED_CARE_EVENTS.filter((e) => e.resident_id === P1.id && e.performed_at.startsWith("2026-11-03"))[0];
  const voided = SEED_CARE_EVENTS.map((e) => (e.care_event_id === ev.care_event_id ? { ...e, confirmation_status: "voided" as const } : e));
  const after = buildDailyTimeline(P1.id, "2026-11-03", CARE_PLAN, voided, CARE_DEMO_NOW);
  assert.equal(after.some((s) => s.event?.care_event_id === ev.care_event_id), false);
});

test("weekly summary counts and CSV export (staff only in facility report)", () => {
  const s = summarizePeriod(P1.id, dateRange("2026-10-28", 7), CARE_PLAN, SEED_CARE_EVENTS, CARE_STAFF, CARE_DEMO_NOW);
  assert.equal(s.planned, s.fulfilled + s.missing);
  assert.ok(s.byStaff.length > 0);
  assert.ok(s.verifiedRate !== null && s.verifiedRate >= 0 && s.verifiedRate <= 1);
  const facility = summaryToCsv(s, CARE_TYPE_LABEL, { includeStaff: true });
  const family = summaryToCsv(s, CARE_TYPE_LABEL, { includeStaff: false });
  assert.match(facility, /김말순|서하늘|이수아/);
  assert.doesNotMatch(family, /김말순|서하늘|이수아/);
});

test("family dashboard: only linked guardians with confirmed authority; no staff names; other residents blocked", () => {
  const g = GUARDIAN_ACCOUNTS.find((a) => a.links[0].resident_id === P1.id && a.links[0].authority !== "권한 확인 전")!;
  const unverified = GUARDIAN_ACCOUNTS.find((a) => a.links[0].resident_id === P1.id && a.links[0].authority === "권한 확인 전")!;
  assert.deepEqual(canGuardianView(g, P1.id), { ok: true });
  assert.deepEqual(canGuardianView(g, "SYN-P-0002"), { ok: false, error: "NOT_LINKED" });
  assert.deepEqual(canGuardianView(unverified, P1.id), { ok: false, error: "AUTHORITY_UNVERIFIED" });
  assert.deepEqual(canGuardianView({ ...g, links: [{ ...g.links[0], revoked: true }] }, P1.id), { ok: false, error: "LINK_REVOKED" });
  assert.deepEqual(viewableResidents(unverified), []);
  const ctx = { date: "2026-11-03", weekDates: dateRange("2026-10-28", 7), plan: CARE_PLAN, events: SEED_CARE_EVENTS, staffRoles: STAFF_ROLES, municipal: MUNICIPAL_LINKS, now: CARE_DEMO_NOW };
  const d = buildFamilyDashboard(g, P1.id, ctx);
  assert.ok(d.ok);
  const text = JSON.stringify(d.value);
  for (const s of CARE_STAFF) assert.equal(text.includes(s.name), false, `staff name ${s.name} leaked`);
  assert.equal(text.includes("관찰 기록"), false, "internal observation records are not shown to families");
  assert.equal(d.value.today.every((i) => i.time <= "14:00"), true, "no future slots");
  assert.equal(buildFamilyDashboard(g, "SYN-P-0002", ctx).ok, false);
});
