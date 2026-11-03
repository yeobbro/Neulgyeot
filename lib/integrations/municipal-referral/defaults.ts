import { latestKAdl, morseBand } from "../../hospital/derive";
import type { Patient } from "../../hospital/types";
import { MUNICIPALITIES } from "../../demo/hospital-data";
import { CONSENT_FORM_VERSION, type ConsentRecord, type FallRiskBand, type SocialWorkAssessment } from "./types";

const BAND_TO_RISK: Record<ReturnType<typeof morseBand>, FallRiskBand> = {
  "기록 없음": "notRecorded",
  "낮음 구간": "low",
  "중간 구간": "moderate",
  "높음 구간": "high"
};

/** Prefill the assessment from EMR records; the social worker must still review and save it. */
export function initialAssessment(patient: Patient): SocialWorkAssessment {
  const k = latestKAdl(patient);
  return {
    kAdl: { eating: k?.eating ?? null, mobility: k?.mobility ?? null, toileting: k?.toileting ?? null },
    cognition: null,
    fallRisk: BAND_TO_RISK[morseBand(patient.fallRisk.score)],
    livingArrangement: null,
    livingArrangementOther: "",
    housingType: null,
    housingTypeOther: "",
    barriers: [],
    barrierOther: "",
    requestedServices: [],
    serviceOther: "",
    socialWorkerNote: "",
    savedAt: null
  };
}

export function initialConsent(patient: Patient): ConsentRecord {
  const muni = MUNICIPALITIES.find((m) => m.code === patient.discharge.municipalityCode) ?? MUNICIPALITIES[0];
  return {
    municipalityCode: muni.code,
    recipientOrganization: muni.organization,
    purpose: "퇴원 후 지역사회 통합돌봄 서비스 연계 신청 검토",
    categories: ["identity", "discharge", "livingNeeds"],
    retention: null,
    consentAt: "",
    recorder: "",
    consenterType: null,
    consenterName: "",
    representativeAuthorityVerified: false,
    documentRef: "",
    documentStatus: "notVerified",
    sensitiveConsent: "notApplicable",
    version: CONSENT_FORM_VERSION,
    withdrawn: false,
    review: { hospitalPrivacyReviewed: false, municipalRequirementChecked: false, legalBasisNote: "" }
  };
}
