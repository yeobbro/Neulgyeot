/**
 * Fact builders: turn the record into a short numbered list of facts for the local LLM.
 *
 * Minimum necessary: no name, birth date, phone number, guardian details, diagnosis codes or medication names
 * are put into the discharge-note or family-message facts. The family message only uses report items the staff
 * already included in that guardian's report (which follows the guardian's sharing scope).
 */
import type { FamilyReport } from "../family-report/types";
import { K_ADL_LABEL, type Patient } from "../hospital/types";
import {
  BARRIER_LABEL,
  COGNITION_LABEL,
  FALL_RISK_LABEL,
  HOUSING_LABEL,
  LIVING_LABEL,
  SERVICE_LABEL,
  type SocialWorkAssessment
} from "../integrations/municipal-referral/types";
import { MAX_FACT_CHARS, MAX_FACTS, type DraftFact } from "./types";

const clip = (t: string) => (t.length > MAX_FACT_CHARS ? `${t.slice(0, MAX_FACT_CHARS - 1)}…` : t);

function numbered(list: { text: string; source: string }[]): DraftFact[] {
  return list
    .filter((f) => f.text.trim().length > 0)
    .slice(0, MAX_FACTS)
    .map((f, i) => ({ id: `F${i + 1}`, text: clip(f.text.trim()), source: f.source }));
}

/** 퇴원·연계 요약 — what the social worker has assessed, plus recent social-work/rehab notes. */
export function dischargeFacts(patient: Patient, a: SocialWorkAssessment): DraftFact[] {
  const out: { text: string; source: string }[] = [];
  const d = patient.discharge;
  if (d.plannedDate) out.push({ text: `퇴원 예정일 ${d.plannedDate}`, source: "discharge.plannedDate" });
  if (d.destination) out.push({ text: `퇴원 후 예상 거주지: ${d.destination}`, source: "discharge.destination" });
  const k = a.kAdl;
  if (k.eating && k.mobility && k.toileting)
    out.push({
      text: `K-ADL(병원 평가): 식사 ${K_ADL_LABEL[k.eating]}, 이동 ${K_ADL_LABEL[k.mobility]}, 화장실 사용 ${K_ADL_LABEL[k.toileting]}`,
      source: "assessment.kAdl"
    });
  if (a.cognition) out.push({ text: `인지·의사소통: ${COGNITION_LABEL[a.cognition]}`, source: "assessment.cognition" });
  if (a.fallRisk) out.push({ text: `낙상 위험 평가 구간: ${FALL_RISK_LABEL[a.fallRisk]}`, source: "assessment.fallRisk" });
  if (a.livingArrangement) out.push({ text: `퇴원 후 동거 형태: ${LIVING_LABEL[a.livingArrangement]}`, source: "assessment.livingArrangement" });
  if (a.housingType) out.push({ text: `주거 형태: ${HOUSING_LABEL[a.housingType]}`, source: "assessment.housingType" });
  if (a.barriers.length) out.push({ text: `주거 장애요인: ${a.barriers.map((b) => BARRIER_LABEL[b]).join(", ")}`, source: "assessment.barriers" });
  if (a.requestedServices.length)
    out.push({ text: `요청 서비스: ${a.requestedServices.map((s) => SERVICE_LABEL[s]).join(", ")}`, source: "assessment.requestedServices" });
  const recent = [...patient.notes]
    .filter((n) => n.type === "사회복지" || n.type === "재활")
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, 4);
  for (const n of recent) out.push({ text: `${n.type} 기록(${n.at.slice(0, 10)}): ${n.text}`, source: n.id });
  return numbered(out);
}

/** 보호자 리포트 — only items already included in this report (they follow the guardian's sharing scope). */
const FAMILY_SKIP = new Set(["보고 기간", "입원 병동"]); // report metadata, not news for the message

export function familyFacts(report: FamilyReport): DraftFact[] {
  return numbered(
    report.items
      .filter((i) => i.included && i.text.trim() && !FAMILY_SKIP.has(i.label))
      .map((i) => ({ text: `${i.label}: ${i.text}`, source: i.sources.join(",") || i.id }))
  );
}

/** 교대 인수인계 — latest notes, vitals, daily living, change signals and today's medication record status. */
export function handoverFacts(patient: Patient): DraftFact[] {
  const out: { text: string; source: string }[] = [];
  const notes = [...patient.notes].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 6);
  for (const n of notes) out.push({ text: `${n.type} 기록(${n.at.replace("T", " ")}): ${n.text}`, source: n.id });
  const v = patient.vitals[patient.vitals.length - 1];
  if (v) {
    const parts = [
      v.sbp !== null && v.dbp !== null ? `혈압 ${v.sbp}/${v.dbp}` : null,
      v.pulse !== null ? `맥박 ${v.pulse}` : null,
      v.temp !== null ? `체온 ${v.temp}` : null,
      v.spo2 !== null ? `산소포화도 ${v.spo2}` : null
    ].filter(Boolean);
    out.push({ text: parts.length ? `최근 활력징후(${v.at.replace("T", " ")}): ${parts.join(", ")}` : `최근 활력징후(${v.at.replace("T", " ")}): 측정값 기록 없음`, source: v.id });
  }
  const dl = patient.dailyLiving[patient.dailyLiving.length - 1];
  if (dl) {
    const parts = [
      dl.mealIntakePct !== null ? `식사 ${dl.mealIntakePct}%` : "식사 기록 없음",
      dl.hydrationMl !== null ? `수분 ${dl.hydrationMl}mL` : "수분 기록 없음",
      dl.sleepHours !== null ? `수면 ${dl.sleepHours}시간` : "수면 기록 없음"
    ];
    out.push({ text: `일상생활 기록(${dl.date}): ${parts.join(", ")}`, source: `DL-${patient.id}-${dl.date}` });
  }
  for (const s of patient.signals.filter((x) => x.status !== "관찰 중"))
    out.push({ text: `변화 신호(${s.status}): ${s.title}`, source: s.id });
  const pending = patient.medications.filter((m) => m.todayRecord !== "투약 기록 완료");
  if (pending.length) out.push({ text: `오늘 투약 기록 확인 필요: ${pending.map((m) => `${m.name} ${m.todayRecord}`).join(", ")}`, source: "medications.today" });
  return numbered(out);
}

/** Rule-based floor shown when no local LLM is connected: the facts themselves, one per line. */
export function ruleDraft(facts: DraftFact[]): { text: string; factIds: string[] }[] {
  return facts.map((f) => ({ text: f.text, factIds: [f.id] }));
}
