/**
 * DEMO family-report delivery adapter.
 * Sends nothing: no email, SMS, KakaoTalk, push notification or network call.
 * Outcomes are deterministic per synthetic guardian so the failure path can be reviewed.
 */
import type { Guardian } from "../hospital/types";
import type { DeliveryAttempt, FamilyReport } from "./types";

export const FAMILY_DEMO_DISCLAIMER = "DEMO 전송 — 실제 문자·메일·알림이 발송되지 않습니다.";

export function simulateDelivery(report: FamilyReport, guardian: Guardian, now: string): DeliveryAttempt {
  const attempt = report.deliveries.length + 1;
  const fail = guardian.demoDeliveryOutcome === "fail-first" && attempt === 1;
  return fail
    ? { attempt, at: now, outcome: "전송 실패", message: "DEMO: 보호자 앱(늘곁 패밀리) 계정 연결 전 상태로 모의 전송 실패" }
    : { attempt, at: now, outcome: "전송 완료", message: "DEMO: 늘곁 패밀리 모의 수신함에 등록 (실제 발송 없음)" };
}
