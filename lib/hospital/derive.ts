import type { KAdlAssessment, Patient, VitalSign } from "./types";

/** Age in full years at the reference date (YYYY-MM-DD). */
export function ageAt(birthDate: string, reference: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ry, rm, rd] = reference.split("-").map(Number);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return age;
}

export function latestKAdl(patient: Patient): KAdlAssessment | null {
  return patient.kAdl.length ? patient.kAdl[patient.kAdl.length - 1] : null;
}

export function previousKAdl(patient: Patient): KAdlAssessment | null {
  return patient.kAdl.length > 1 ? patient.kAdl[patient.kAdl.length - 2] : null;
}

/**
 * Morse Fall Scale band as defined by the instrument's commonly used cut-offs.
 * This only restates the tool band for the recorded score; it is not a
 * clinical judgement made by Neulgyeot.
 */
export function morseBand(score: number | null): "기록 없음" | "낮음 구간" | "중간 구간" | "높음 구간" {
  if (score === null) return "기록 없음";
  if (score >= 45) return "높음 구간";
  if (score >= 25) return "중간 구간";
  return "낮음 구간";
}

export function latestVital(patient: Patient): VitalSign | null {
  for (let i = patient.vitals.length - 1; i >= 0; i -= 1) {
    const v = patient.vitals[i];
    if (v.sbp !== null || v.pulse !== null || v.temp !== null || v.spo2 !== null) return v;
  }
  return null;
}

export function formatDateTime(iso: string): string {
  const [d, t] = iso.split("T");
  const [, m, day] = d.split("-");
  return t ? `${m}/${day} ${t.slice(0, 5)}` : `${m}/${day}`;
}

export function daysBetween(from: string, to: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}
