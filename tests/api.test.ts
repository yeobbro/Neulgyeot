import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as login from "../app/api/auth/demo-login/route";
import * as assessments from "../app/api/recipients/[id]/assessments/route";
import * as matches from "../app/api/recipients/[id]/service-matches/route";
import * as recRecords from "../app/api/recipients/[id]/records/route";
import * as recipient from "../app/api/recipients/[id]/route";
import * as recipients from "../app/api/recipients/route";
import * as record from "../app/api/records/[id]/route";
import * as referral from "../app/api/referrals/[id]/route";
import * as referrals from "../app/api/referrals/route";
import * as reportExport from "../app/api/reports/[id]/export/route";
import * as reportGen from "../app/api/reports/generate/route";
import * as task from "../app/api/tasks/[id]/route";
import * as tasks from "../app/api/tasks/route";
import * as transcribe from "../app/api/voice/transcribe/route";
import * as review from "../app/api/assessments/[id]/review/route";
import * as portalServices from "../app/api/portal/services/route";
import * as portalRequests from "../app/api/portal/requests/route";
import * as portalRequest from "../app/api/portal/requests/[id]/route";
import * as familyLink from "../app/api/family-links/[id]/route";
import * as mapCoverage from "../app/api/map/coverage/route";
import * as auditLogs from "../app/api/audit-logs/route";
import type { Db } from "../lib/server/db/client";
import { call, seededDb } from "./helpers";

let db: Db;
before(async () => {
  db = await seededDb();
});

describe("authentication and authorization", () => {
  it("rejects anonymous requests", async () => {
    const r = await call(recipients.GET, { url: "/api/recipients" });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, "unauthenticated");
  });

  it("rejects a tampered session cookie", async () => {
    const req = new Request("http://t/api/recipients", { headers: { cookie: "ng_session=eyJ1aWQiOiJVLUFETUlOIiwiZXhwIjo5OTk5OTk5OTk5fQ.bad" } });
    assert.equal((await recipients.GET(req)).status, 401);
  });

  it("logs in with a demo account and sets an httpOnly cookie", async () => {
    const r = await call(login.POST, { method: "POST", body: { userId: "U-W1" } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie") ?? "", /ng_session=.+HttpOnly/);
    assert.equal((await call(login.POST, { method: "POST", body: { userId: "nobody" } })).status, 404);
  });

  it("limits workers to their region and hides out-of-scope cases as 404", async () => {
    const own = await call(recipient.GET, { user: "U-W1", params: { id: "R-0002" } });
    assert.equal(own.status, 200);
    const other = await call(recipient.GET, { user: "U-W1", params: { id: "R-0005" } });
    assert.equal(other.status, 404, "R-0005 lives in 미르구");
    const list = await call(recipients.GET, { user: "U-W1", url: "/api/recipients?pageSize=100" });
    const regions = new Set(list.body.data.map((r: { regionId: string }) => r.regionId.split("-").slice(0, 2).join("-")));
    assert.deepEqual([...regions], ["RG-HAESOL"]);
  });

  it("blocks providers and portal users from staff endpoints", async () => {
    assert.equal((await call(recipients.GET, { user: "U-P1", url: "/api/recipients" })).status, 403);
    assert.equal((await call(recipients.GET, { user: "U-F7", url: "/api/recipients" })).status, 403);
    assert.equal((await call(auditLogs.GET, { user: "U-W1", url: "/api/audit-logs" })).status, 403);
    assert.equal((await call(auditLogs.GET, { user: "U-ADMIN", url: "/api/audit-logs" })).status, 200);
  });

  it("shows providers only referrals addressed to them", async () => {
    const r = await call(referrals.GET, { user: "U-P1", url: "/api/referrals?pageSize=100" });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.every((x: { providerId: string }) => x.providerId === "P-001"));
    const foreign = (await db.query<{ id: string }>(`SELECT id FROM service_referrals WHERE provider_id <> 'P-001' LIMIT 1`))[0];
    assert.equal((await call(referral.GET, { user: "U-P1", params: { id: foreign.id } })).status, 404);
  });
});

describe("validation, pagination and filters", () => {
  it("returns 400 with field details for invalid input", async () => {
    const r = await call(recRecords.POST, { user: "U-W1", method: "POST", params: { id: "R-0002" }, body: { recordType: "visit", content: "" } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "validation_error");
    assert.ok(r.body.error.details.fieldErrors.content || r.body.error.details.fieldErrors.visitStatus);
    const bad = await call(recipients.GET, { user: "U-W1", url: "/api/recipients?status=nope" });
    assert.equal(bad.status, 400);
    const unknown = await call(tasks.POST, { user: "U-W1", method: "POST", body: { recipientId: "R-0002", title: "x", hack: true } });
    assert.equal(unknown.status, 400, "unknown fields are rejected");
  });

  it("returns 404 for unknown ids", async () => {
    assert.equal((await call(task.GET, { user: "U-ADMIN", params: { id: "TASK-999999" } })).status, 404);
    assert.equal((await call(record.GET, { user: "U-ADMIN", params: { id: "REC-999999" } })).status, 404);
  });

  it("paginates with stable totals", async () => {
    const p1 = await call(recipients.GET, { user: "U-ADMIN", url: "/api/recipients?pageSize=25&page=1&sort=code_asc" });
    const p2 = await call(recipients.GET, { user: "U-ADMIN", url: "/api/recipients?pageSize=25&page=2&sort=code_asc" });
    assert.equal(p1.body.pagination.total, p2.body.pagination.total);
    assert.equal(p1.body.data.length, 25);
    assert.notEqual(p1.body.data[0].id, p2.body.data[0].id);
    assert.equal(p1.body.pagination.totalPages, Math.ceil(p1.body.pagination.total / 25));
  });

  it("combines filters consistently with the database", async () => {
    const r = await call(recipients.GET, { user: "U-ADMIN", url: "/api/recipients?regionId=RG-MIR-2&unconnected=true&pageSize=100" });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.length > 0);
    assert.ok(r.body.data.every((x: { regionId: string; unconnected: boolean }) => x.regionId === "RG-MIR-2" && x.unconnected));
    const both = await call(recipients.GET, { user: "U-ADMIN", url: "/api/recipients?serviceType=meal&needsReview=true&pageSize=100" });
    assert.ok(both.body.data.every((x: { needs: string[]; needsReview: boolean }) => x.needs.includes("meal") && x.needsReview));
  });

  it("map coverage shows the 별빛동 gap (scenario E)", async () => {
    const r = await call(mapCoverage.GET, { user: "U-ADMIN", url: "/api/map/coverage" });
    const dongs = r.body.dongs as { regionName: string; unconnected: number; recipients: number }[];
    const star = dongs.find((d) => d.regionName === "별빛동")!;
    const others = dongs.filter((d) => d.regionName !== "별빛동");
    const rate = (d: { unconnected: number; recipients: number }) => d.unconnected / Math.max(1, d.recipients);
    assert.ok(others.every((d) => rate(d) < rate(star)), "별빛동 has the highest unconnected rate");
  });
});

describe("records", () => {
  it("lets authors edit their records with revision history, blocks others", async () => {
    const created = await call(recRecords.POST, { user: "U-W3", method: "POST", params: { id: "R-0005" }, body: { recordType: "phone", content: "전화 확인 (테스트)" } });
    assert.equal(created.status, 201);
    const id = created.body.id;
    const edit = await call(record.PATCH, { user: "U-W3", method: "PATCH", params: { id }, body: { content: "전화 확인 — 수정" } });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.revisions.length, 1);
    assert.equal(edit.body.revisions[0].previous.content, "전화 확인 (테스트)");
    const other = await call(record.PATCH, { user: "U-W4", method: "PATCH", params: { id }, body: { content: "남의 기록" } });
    assert.equal(other.status, 403);
    assert.equal((await call(record.DELETE, { user: "U-W3", method: "DELETE", params: { id }, body: { reason: "x" } })).status, 403, "only admins delete");
    assert.equal((await call(record.DELETE, { user: "U-ADMIN", method: "DELETE", params: { id }, body: { reason: "테스트 정리" } })).status, 200);
    assert.equal((await call(record.GET, { user: "U-ADMIN", params: { id } })).status, 404);
  });
});

describe("assessments, matching, referrals and tasks", () => {
  it("runs a rule assessment and reports AI as not configured", async () => {
    const r = await call(assessments.POST, { user: "U-W1", method: "POST", params: { id: "R-0002" }, body: { useAi: true } });
    assert.equal(r.status, 201);
    assert.equal(r.body.method, "rules");
    assert.equal(r.body.aiStatus, "not_configured");
    assert.equal(r.body.aiResult, null);
    assert.ok(r.body.signals.some((s: { ruleId: string }) => s.ruleId === "R1_MISSED_VISIT"));
    const twice = await call(review.PATCH, { user: "U-W1", method: "PATCH", params: { id: r.body.id }, body: { reviewStatus: "dismissed" } });
    assert.equal(twice.status, 400, "dismissing needs a note");
    const ok = await call(review.PATCH, { user: "U-W1", method: "PATCH", params: { id: r.body.id }, body: { reviewStatus: "accepted" } });
    assert.equal(ok.body.reviewStatus, "accepted");
    assert.equal((await call(review.PATCH, { user: "U-W1", method: "PATCH", params: { id: r.body.id }, body: { reviewStatus: "accepted" } })).status, 409);
  });

  it("requires explicit review confirmation before a referral and blocks duplicates", async () => {
    const m = await call(matches.POST, { user: "U-W1", method: "POST", params: { id: "R-0003" }, body: {} });
    assert.equal(m.status, 200);
    const cand = m.body.candidates[0];
    assert.ok(cand, "scenario C has an alternative candidate");
    assert.equal((await call(referrals.POST, { user: "U-W1", method: "POST", body: { recipientId: "R-0003", serviceId: cand.serviceId } })).status, 400);
    const created = await call(referrals.POST, { user: "U-W1", method: "POST", body: { recipientId: "R-0003", serviceId: cand.serviceId, confirmedReview: true } });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, "requested");
    assert.equal((await call(referrals.POST, { user: "U-W1", method: "POST", body: { recipientId: "R-0003", serviceId: cand.serviceId, confirmedReview: true } })).status, 400);
    const bad = await call(referral.PATCH, { user: "U-W1", method: "PATCH", params: { id: created.body.id }, body: { status: "in_service" } });
    assert.equal(bad.status, 400, "cannot skip intake");
    const failed = await call(referral.PATCH, { user: "U-W1", method: "PATCH", params: { id: created.body.id }, body: { status: "failed", failureReason: "정원 초과 (테스트)" } });
    assert.equal(failed.status, 200);
    const followUp = await db.query<{ task_type: string }>(`SELECT task_type FROM action_tasks WHERE referral_id = $1`, [created.body.id]);
    assert.deepEqual(followUp.map((t) => t.task_type), ["referral_failure"], "a follow-up task is created automatically");
  });

  it("validates task transitions on the server and records completion", async () => {
    const t = await call(tasks.POST, { user: "U-W1", method: "POST", body: { recipientId: "R-0002", title: "테스트 조치", dueAt: "2026-10-01T00:00:00+09:00" } });
    assert.equal(t.status, 201);
    assert.equal(t.body.isOverdue, true);
    assert.equal((await call(task.PATCH, { user: "U-W1", method: "PATCH", params: { id: t.body.id }, body: { status: "completed" } })).status, 400);
    const done = await call(task.PATCH, { user: "U-W1", method: "PATCH", params: { id: t.body.id }, body: { status: "completed", resultNote: "확인 완료" } });
    assert.equal(done.body.status, "completed");
    assert.ok(done.body.completedAt);
    assert.equal(done.body.isOverdue, false);
    assert.equal((await call(task.PATCH, { user: "U-W1", method: "PATCH", params: { id: t.body.id }, body: { status: "in_progress" } })).status, 400);
  });

  it("reports server transcription as not implemented instead of faking it", async () => {
    const r = await call(transcribe.POST, { user: "U-W1", method: "POST" });
    assert.equal(r.status, 501);
  });
});

describe("portal access control", () => {
  it("shows a granted family member services without internal fields", async () => {
    const r = await call(portalServices.GET, { user: "U-F7", url: "/api/portal/services" });
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.body);
    for (const leaked of ["staff_note", "staffNote", "failureReason", "failure_reason", "score", "signals", "assessment"]) assert.ok(!text.includes(leaked), `${leaked} must not leak`);
    assert.ok(!text.includes("내부 메모(가상)"), "the seeded staff note for R-0007 must not appear");
  });

  it("denies a family member whose consent was revoked", async () => {
    const r = await call(portalServices.GET, { user: "U-F9", url: "/api/portal/services" });
    assert.equal(r.status, 403);
    const other = await call(portalServices.GET, { user: "U-F7", url: "/api/portal/services?recipientId=R-0002" });
    assert.equal(other.status, 403, "no link to another recipient");
  });

  it("creates a request that staff can answer, and revocation applies immediately", async () => {
    const created = await call(portalRequests.POST, { user: "U-F7", method: "POST", body: { requestType: "general", title: "테스트 문의", content: "내용" } });
    assert.equal(created.status, 201);
    assert.equal((await call(portalRequest.PATCH, { user: "U-F7", method: "PATCH", params: { id: created.body.id }, body: { status: "answered", responseContent: "x" } })).status, 403);
    const answered = await call(portalRequest.PATCH, { user: "U-W1", method: "PATCH", params: { id: created.body.id }, body: { status: "answered", responseContent: "답변드립니다." } });
    assert.equal(answered.status, 200);
    const mine = await call(portalRequests.GET, { user: "U-F7", url: "/api/portal/requests" });
    assert.ok(mine.body.data.some((q: { id: string; responseContent: string }) => q.id === created.body.id && q.responseContent === "답변드립니다."));
    assert.equal((await call(familyLink.PATCH, { user: "U-W1", method: "PATCH", params: { id: "FL-001" }, body: { consentStatus: "revoked" } })).status, 200);
    assert.equal((await call(portalServices.GET, { user: "U-F7", url: "/api/portal/services" })).status, 403);
    assert.equal((await call(portalRequests.GET, { user: "U-F7", url: "/api/portal/requests" })).body.data.length, 0);
    await call(familyLink.PATCH, { user: "U-W1", method: "PATCH", params: { id: "FL-001" }, body: { consentStatus: "granted" } });
  });
});

describe("reports", () => {
  it("generates a template report when AI is off and exports CSV", async () => {
    const g = await call(reportGen.POST, { user: "U-ADMIN", method: "POST", body: { from: "2026-09-30", to: "2026-10-29" } });
    assert.equal(g.status, 201);
    assert.equal(g.body.narrativeMethod, "template");
    assert.equal(g.body.isDemoData, true);
    const csv = await call(reportExport.GET, { user: "U-ADMIN", url: `/api/reports/${g.body.id}/export?format=csv`, params: { id: g.body.id } });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(csv.headers.get("content-disposition") ?? "", /attachment/);
    assert.ok(String(csv.body).includes("시연용 가상 데이터"));
    assert.equal((await call(reportExport.GET, { user: "U-W1", url: `/api/reports/${g.body.id}/export`, params: { id: g.body.id } })).status, 404, "workers can't open others' reports");
    assert.equal((await call(reportGen.POST, { user: "U-ADMIN", method: "POST", body: { from: "2026-10-29", to: "2026-10-01" } })).status, 400);
  });
});
