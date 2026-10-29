import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as dashboard from "../app/api/dashboard/summary/route";
import * as regionsApi from "../app/api/dashboard/regions/route";
import * as assessments from "../app/api/recipients/[id]/assessments/route";
import * as recRecords from "../app/api/recipients/[id]/records/route";
import * as matches from "../app/api/recipients/[id]/service-matches/route";
import * as timeline from "../app/api/recipients/[id]/timeline/route";
import * as recipients from "../app/api/recipients/route";
import * as assessment from "../app/api/assessments/[id]/route";
import * as review from "../app/api/assessments/[id]/review/route";
import * as referrals from "../app/api/referrals/route";
import * as tasks from "../app/api/tasks/route";
import * as task from "../app/api/tasks/[id]/route";
import * as voiceStructure from "../app/api/voice/structure/route";
import * as voiceDrafts from "../app/api/voice/drafts/route";
import * as voiceDraft from "../app/api/voice/drafts/[id]/route";
import { call, seededDb } from "./helpers";

const W = "U-W1";

describe("end-to-end demo scenario (steps 1–11)", () => {
  before(async () => {
    await seededDb();
  });

  it("goes from regional overview to a completed follow-up reflected in the dashboard", async () => {
    // 1. Regional overview
    const before = await call(dashboard.GET, { user: W, url: "/api/dashboard/summary" });
    assert.equal(before.status, 200);
    const regions = await call(regionsApi.GET, { user: W, url: "/api/dashboard/regions" });
    assert.equal(regions.body.data[0].regionName, "해솔구");

    // 2. Pick a recipient from the review queue
    const list = await call(recipients.GET, { user: W, url: "/api/recipients?needsReview=true&sort=priority_desc" });
    const target = list.body.data.find((r: { displayCode: string }) => r.displayCode === "NG-0002");
    assert.ok(target, "scenario B recipient is in the review queue");

    // 3. Related records
    const recs = await call(recRecords.GET, { user: W, url: `/api/recipients/${target.id}/records`, params: { id: target.id } });
    assert.ok(recs.body.data.some((r: { visitStatus: string }) => r.visitStatus === "missed"));

    // 4. Run analysis
    const run = await call(assessments.POST, { user: W, method: "POST", params: { id: target.id }, body: { useAi: false } });
    assert.equal(run.status, 201);

    // 5. Evidence: every source id is a real record of this recipient
    const a = await call(assessment.GET, { user: W, params: { id: run.body.id } });
    const recordIds = new Set(recs.body.data.map((r: { id: string }) => r.id));
    assert.ok(a.body.sourceRecordIds.length > 0);
    for (const id of a.body.sourceRecordIds) assert.ok(recordIds.has(id), `${id} links to an original record`);

    // 6. Staff review
    const reviewed = await call(review.PATCH, { user: W, method: "PATCH", params: { id: run.body.id }, body: { reviewStatus: "modified", reviewNote: "부재 사유는 병원 방문으로 확인" } });
    assert.equal(reviewed.body.reviewStatus, "modified");

    // 7. Service candidates
    const m = await call(matches.POST, { user: W, method: "POST", params: { id: target.id }, body: {} });
    assert.equal(m.status, 200);

    // 9. Follow-up task linked to the assessment (created before the referral so it can be linked)
    const t = await call(tasks.POST, { user: W, method: "POST", body: { recipientId: target.id, assessmentId: run.body.id, taskType: "assessment_review", title: "미완료 방문 사유 확인", priority: "high", dueAt: "2026-11-05T09:00:00+09:00" } });
    assert.equal(t.status, 201);

    // 8. Referral (if a candidate exists for this recipient's needs)
    if (m.body.candidates.length > 0) {
      const ref = await call(referrals.POST, { user: W, method: "POST", body: { recipientId: target.id, serviceId: m.body.candidates[0].serviceId, taskId: t.body.id, confirmedReview: true } });
      assert.equal(ref.status, 201);
    }

    // 10. Complete the task
    const done = await call(task.PATCH, { user: W, method: "PATCH", params: { id: t.body.id }, body: { status: "completed", resultNote: "전화로 확인, 다음 방문 일정 재조정" } });
    assert.equal(done.body.status, "completed");

    // 11. Dashboard reflects it
    const after = await call(dashboard.GET, { user: W, url: "/api/dashboard/summary" });
    assert.equal(after.body.tasksCreated, before.body.tasksCreated + 1);
    assert.equal(after.body.tasksCompleted, before.body.tasksCompleted + 1);
    assert.ok(after.body.completionRate > before.body.completionRate);
    assert.ok(after.body.needsReview < before.body.needsReview, "the reviewed case leaves the review count");

    // Timeline shows the whole chain
    const tl = await call(timeline.GET, { user: W, url: `/api/recipients/${target.id}/timeline`, params: { id: target.id } });
    const titles = tl.body.data.map((e: { title: string }) => e.title).join(" | ");
    for (const expected of ["규칙 기반 분석 실행", "담당자 검토", "조치 등록", "조치 완료"]) assert.ok(titles.includes(expected), `timeline has ${expected}`);
  });

  it("scenario H: typed note → rule-based draft → staff edits → saved record", async () => {
    const s = await call(voiceStructure.POST, { user: W, method: "POST", body: { transcript: "방문했다. 난방이 약하다고 하셨다. 식사 지원을 계속 원하신다. 다음 주에 다시 확인할 예정." } });
    assert.equal(s.body.method, "rules");
    const d = await call(voiceDrafts.POST, { user: W, method: "POST", body: { recipientId: "R-0008", recordType: "visit", transcript: "방문했다.", transcriptSource: "typed", structuredContent: s.body.draft, structuringMethod: "rules" } });
    assert.equal(d.status, 201);
    const unreviewed = await call(voiceDraft.PATCH, { user: W, method: "PATCH", params: { id: d.body.id }, body: { action: "save" } });
    assert.equal(unreviewed.status, 403, "cannot save without staff review");
    const edited = { ...s.body.draft, summary: "정기 방문. 난방 확인 필요 (담당자 수정)" };
    const saved = await call(voiceDraft.PATCH, { user: W, method: "PATCH", params: { id: d.body.id }, body: { action: "save", structuredContent: edited, reviewedByStaff: true } });
    assert.equal(saved.body.reviewStatus, "saved");
    const recs = await call(recRecords.GET, { user: W, url: "/api/recipients/R-0008/records", params: { id: "R-0008" } });
    const rec = recs.body.data.find((r: { id: string }) => r.id === saved.body.savedRecordId);
    assert.equal(rec.sourceType, "voice");
    assert.ok(rec.content.includes("담당자 수정"));
  });
});
