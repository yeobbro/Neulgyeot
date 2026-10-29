import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULE_CONFIG } from "../lib/domain/rules/config";
import { evaluateRules, type RuleInput, type RuleRecord } from "../lib/domain/rules/engine";

const now = new Date("2026-10-29T03:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const rec = (id: string, d: number, extra: Partial<RuleRecord> = {}): RuleRecord => ({
  id,
  recordType: "visit",
  visitStatus: "completed",
  scheduledAt: null,
  recordedAt: daysAgo(d),
  flags: [],
  ...extra,
});
const base = (over: Partial<RuleInput> = {}): RuleInput => ({ now, records: [rec("A", 2), rec("B", 9, { recordType: "phone", visitStatus: null })], referrals: [], tasks: [], ...over });

describe("rule engine", () => {
  it("returns no signals for a normal case (scenario A)", () => {
    const out = evaluateRules(base());
    assert.equal(out.signals.length, 0);
    assert.equal(out.priority, "none");
    assert.equal(out.score, 0);
  });

  it("detects missed and overdue scheduled visits with source record ids (scenario B)", () => {
    const out = evaluateRules(
      base({
        records: [
          rec("A", 2),
          rec("M1", 9, { visitStatus: "missed", scheduledAt: daysAgo(9) }),
          rec("S1", 6, { visitStatus: "scheduled", scheduledAt: daysAgo(3) }),
          rec("FUT", 1, { visitStatus: "scheduled", scheduledAt: new Date(now.getTime() + 86_400_000) }),
        ],
      }),
    );
    const missed = out.signals.find((s) => s.ruleId === "R1_MISSED_VISIT");
    assert.ok(missed);
    assert.deepEqual(missed.sourceRecordIds, ["M1", "S1"]);
    assert.ok(out.signals.some((s) => s.ruleId === "R2_REPEATED_MISSED_VISITS"));
    assert.equal(out.priority, "medium");
    assert.ok(!missed.sourceRecordIds.includes("FUT"), "future visits are not missed");
  });

  it("does not flag a scheduled visit still inside the grace period", () => {
    const out = evaluateRules(base({ records: [rec("A", 2), rec("S", 0.2, { visitStatus: "scheduled", scheduledAt: new Date(now.getTime() - 2 * 3600_000) })] }));
    assert.ok(!out.signals.some((s) => s.ruleId === "R1_MISSED_VISIT"));
  });

  it("flags a service suspended past the threshold, but not a recent one (scenario C)", () => {
    const old = evaluateRules(base({ referrals: [{ id: "SR1", serviceType: "home_care", serviceName: "방문", status: "suspended", statusChangedAt: daysAgo(RULE_CONFIG.suspendedServiceDays + 1) }] }));
    assert.ok(old.signals.some((s) => s.ruleId === "R3_SERVICE_SUSPENDED" && s.evidence[0].entityId === "SR1"));
    const recent = evaluateRules(base({ referrals: [{ id: "SR1", serviceType: "home_care", serviceName: "방문", status: "suspended", statusChangedAt: daysAgo(2) }] }));
    assert.ok(!recent.signals.some((s) => s.ruleId === "R3_SERVICE_SUSPENDED"));
  });

  it("flags failed referrals only when no active replacement of the same type exists", () => {
    const failed = { id: "F", serviceType: "meal" as const, serviceName: "식사", status: "failed" as const, statusChangedAt: daysAgo(3) };
    assert.ok(evaluateRules(base({ referrals: [failed] })).signals.some((s) => s.ruleId === "R4_REFERRAL_FAILED"));
    const replaced = evaluateRules(base({ referrals: [failed, { ...failed, id: "N", status: "in_service" }] }));
    assert.ok(!replaced.signals.some((s) => s.ruleId === "R4_REFERRAL_FAILED"));
  });

  it("flags overdue open tasks but ignores completed ones (scenario D)", () => {
    const out = evaluateRules(base({ tasks: [{ id: "T1", title: "x", status: "open", dueAt: daysAgo(2) }, { id: "T2", title: "y", status: "completed", dueAt: daysAgo(5) }] }));
    const s = out.signals.find((x) => x.ruleId === "R5_OVERDUE_FOLLOWUP");
    assert.ok(s);
    assert.deepEqual(s.evidence.map((e) => e.entityId), ["T1"]);
  });

  it("marks no recent contact and data insufficiency", () => {
    const out = evaluateRules(base({ records: [rec("OLD", 40)] }));
    const s = out.signals.find((x) => x.ruleId === "R7_NO_RECENT_CONTACT");
    assert.ok(s);
    assert.equal(out.dataInsufficient, true);
  });

  it("treats an emergency mention as high priority and routes to official procedure", () => {
    const out = evaluateRules(base({ records: [rec("A", 2), rec("E", 1, { recordType: "phone", visitStatus: null, flags: ["emergency_mention"] })] }));
    assert.equal(out.priority, "high");
    const s = out.signals.find((x) => x.ruleId === "R8_EMERGENCY_MENTION");
    assert.ok(s && s.suggestedAction.includes("공식"));
  });

  it("adds a compound signal when several independent signals co-occur", () => {
    const out = evaluateRules(
      base({
        records: [rec("M", 3, { visitStatus: "missed", scheduledAt: daysAgo(3) }), rec("F", 2, { recordType: "phone", visitStatus: null, flags: ["needs_support"] })],
        tasks: [{ id: "T", title: "t", status: "open", dueAt: daysAgo(1) }],
      }),
    );
    assert.ok(out.signals.some((s) => s.ruleId === "R9_MULTIPLE_SIGNALS"));
    assert.ok(out.score <= 100);
  });

  it("is deterministic regardless of input order", () => {
    const records = [rec("M1", 9, { visitStatus: "missed", scheduledAt: daysAgo(9) }), rec("A", 2), rec("M2", 4, { visitStatus: "missed", scheduledAt: daysAgo(4) })];
    const a = evaluateRules(base({ records }));
    const b = evaluateRules(base({ records: [...records].reverse() }));
    assert.deepEqual(a, b);
  });
});
