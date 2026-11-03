import type { HospitalState, View } from "../state/hospital-store";
import { getAssessment, sharingKey } from "../state/hospital-store";
import type { Patient } from "./types";
import { daysBetween } from "./derive";
import { DEMO_FACILITY } from "../demo/hospital-data";

export interface ReviewNotice {
  id: string;
  patientId: string;
  kind: "관찰 변화" | "기록 확인" | "퇴원 준비" | "지역연계" | "보호자 공유";
  label: "확인 필요" | "기록 없음" | "데이터 부족" | "관찰 중";
  text: string;
  target: View;
}

/** Neutral care-review notices derived from synthetic records. These never express clinical urgency. */
export function reviewNotices(patients: Patient[], state: HospitalState): ReviewNotice[] {
  const out: ReviewNotice[] = [];
  patients.forEach((p) => {
    p.signals
      .filter((s) => !state.reviewedSignals.includes(s.id))
      .forEach((s) =>
        out.push({ id: s.id, patientId: p.id, kind: "관찰 변화", label: s.status, text: `${s.domain} · ${s.title}`, target: "summary" })
      );
    p.medications
      .filter((m) => m.todayRecord === "기록 없음")
      .forEach((m) =>
        out.push({ id: `${p.id}-med-${m.id}`, patientId: p.id, kind: "기록 확인", label: "기록 없음", text: `오늘 ${m.name} 투약 기록 입력 여부 확인`, target: "medication" })
      );
    if (p.discharge.plannedDate && daysBetween(DEMO_FACILITY.today, p.discharge.plannedDate) <= 14 && getAssessment(state, p).savedAt === null) {
      out.push({
        id: `${p.id}-discharge`,
        patientId: p.id,
        kind: "퇴원 준비",
        label: "확인 필요",
        text: `퇴원 예정 ${p.discharge.plannedDate} · 사회복지 평가 미저장`,
        target: "discharge"
      });
    }
    p.guardians.forEach((g) => {
      const s = state.sharing[sharingKey(p.id, g.id)];
      if (s && !s.authorityVerified && s.status !== "철회") {
        out.push({ id: `${p.id}-${g.id}-auth`, patientId: p.id, kind: "보호자 공유", label: "확인 필요", text: `보호자 ${g.name}(${g.relationship}) 권한 확인 전 — 리포트 공유 불가`, target: "family" });
      }
    });
  });
  state.transfers
    .filter((t) => t.status === "보완 요청" || t.status === "반려")
    .forEach((t) =>
      out.push({ id: `${t.transferId}-resp`, patientId: t.patientId, kind: "지역연계", label: "확인 필요", text: `${t.transferId} ${t.status} (모의 응답): ${t.reason ?? ""}`, target: "discharge" })
    );
  return out;
}
