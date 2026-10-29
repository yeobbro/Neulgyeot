import { AVAILABILITY_LABEL, SERVICE_TYPE_LABEL, type Availability, type ServiceType } from "./constants";

/**
 * Eligibility rules a service can declare. Every key is optional; a key the
 * recipient record doesn't cover becomes an "unverified condition" instead of
 * a silent pass or fail.
 */
export type EligibilityRules = {
  minAge?: number;
  livingAlone?: boolean;
  requiresMobilityAid?: boolean;
  requiresCaregiver?: boolean;
  /** Free-text conditions the system cannot check. */
  notes?: string[];
};

export type MatchRecipient = {
  id: string;
  regionIds: string[]; // dong + its ancestors
  needs: ServiceType[];
  attributes: { age?: number; livingAlone?: boolean; usesMobilityAid?: boolean; hasCaregiver?: boolean };
  activeServiceIds: string[];
};

export type MatchService = {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  serviceType: ServiceType;
  serviceRegionIds: string[];
  eligibility: EligibilityRules;
  isOperating: boolean;
  capacityStatus: Availability;
  capacityVerified: boolean;
  applicationMethod: string;
  contactMethod: string;
  isDemoData: boolean;
};

export type MatchCandidate = {
  serviceId: string;
  serviceName: string;
  providerId: string;
  providerName: string;
  serviceType: ServiceType;
  matchedNeeds: ServiceType[];
  reasons: string[];
  unverifiedConditions: string[];
  availability: { status: Availability; label: string; verified: boolean };
  applicationMethod: string;
  contactMethod: string;
  isDemoData: boolean;
  /** "eligible" = no known conflict; "needs_check" = something must be confirmed first. */
  status: "eligible" | "needs_check";
};

export type MatchExclusion = { serviceId: string; serviceName: string; step: number; reason: string };

export type MatchResult = { candidates: MatchCandidate[]; excluded: MatchExclusion[] };

/**
 * Filters in the documented order:
 * 1 type matches a need → 2 serves the region → 3 no explicit eligibility conflict
 * → 4 currently operating → 5 capacity status (unverified/limited is shown, not hidden).
 */
export function matchServices(recipient: MatchRecipient, services: MatchService[]): MatchResult {
  const candidates: MatchCandidate[] = [];
  const excluded: MatchExclusion[] = [];
  const needs = new Set(recipient.needs);
  const regions = new Set(recipient.regionIds);

  for (const s of [...services].sort((a, b) => a.id.localeCompare(b.id))) {
    const exclude = (step: number, reason: string) => excluded.push({ serviceId: s.id, serviceName: s.name, step, reason });

    if (!needs.has(s.serviceType)) {
      exclude(1, `필요 지원에 '${SERVICE_TYPE_LABEL[s.serviceType]}'이(가) 없습니다.`);
      continue;
    }
    if (!s.serviceRegionIds.some((r) => regions.has(r))) {
      exclude(2, "대상자 거주 지역이 제공 지역에 포함되지 않습니다.");
      continue;
    }
    if (recipient.activeServiceIds.includes(s.id)) {
      exclude(2, "이미 연계 중인 서비스입니다.");
      continue;
    }

    const conflicts: string[] = [];
    const unverified: string[] = [];
    const reasons: string[] = [
      `필요 지원 '${SERVICE_TYPE_LABEL[s.serviceType]}'과(와) 서비스 유형이 일치합니다.`,
      "대상자 지역이 제공 지역에 포함됩니다.",
    ];
    const e = s.eligibility;
    const a = recipient.attributes;
    if (e.minAge !== undefined) {
      if (a.age === undefined) unverified.push(`연령 조건(${e.minAge}세 이상) 확인 필요`);
      else if (a.age < e.minAge) conflicts.push(`연령 조건(${e.minAge}세 이상)에 맞지 않습니다.`);
      else reasons.push(`연령 조건(${e.minAge}세 이상)을 충족합니다.`);
    }
    if (e.livingAlone) {
      if (a.livingAlone === undefined) unverified.push("독거 여부 확인 필요");
      else if (!a.livingAlone) conflicts.push("독거 가구 대상 서비스입니다.");
      else reasons.push("독거 가구 조건을 충족합니다.");
    }
    if (e.requiresMobilityAid) {
      if (a.usesMobilityAid === undefined) unverified.push("보행 보조 필요 여부 확인 필요");
      else if (!a.usesMobilityAid) conflicts.push("보행 보조가 필요한 분 대상 서비스입니다.");
    }
    if (e.requiresCaregiver) {
      if (a.hasCaregiver === undefined) unverified.push("가족 돌봄자 유무 확인 필요");
      else if (!a.hasCaregiver) conflicts.push("가족 돌봄자 대상 서비스입니다.");
    }
    for (const note of e.notes ?? []) unverified.push(`기관 확인 필요: ${note}`);

    if (conflicts.length > 0) {
      exclude(3, conflicts.join(" "));
      continue;
    }
    if (!s.isOperating) {
      exclude(4, "현재 운영 중이 아닌 서비스입니다.");
      continue;
    }
    if (s.capacityStatus === "closed") {
      exclude(5, "수용 상태가 '모집 마감'입니다.");
      continue;
    }
    if (!s.capacityVerified) unverified.push("수용 가능 여부가 기관에서 확인되지 않았습니다.");
    else if (s.capacityStatus === "waitlist") unverified.push("대기가 필요할 수 있습니다.");
    else if (s.capacityStatus === "unknown") unverified.push("수용 상태를 확인해야 합니다.");

    candidates.push({
      serviceId: s.id,
      serviceName: s.name,
      providerId: s.providerId,
      providerName: s.providerName,
      serviceType: s.serviceType,
      matchedNeeds: [s.serviceType],
      reasons,
      unverifiedConditions: unverified,
      availability: { status: s.capacityStatus, label: AVAILABILITY_LABEL[s.capacityStatus], verified: s.capacityVerified },
      applicationMethod: s.applicationMethod,
      contactMethod: s.contactMethod,
      isDemoData: s.isDemoData,
      status: unverified.length === 0 ? "eligible" : "needs_check",
    });
  }

  candidates.sort(
    (a, b) =>
      Number(a.status === "needs_check") - Number(b.status === "needs_check") ||
      a.unverifiedConditions.length - b.unverifiedConditions.length ||
      a.serviceId.localeCompare(b.serviceId),
  );
  return { candidates, excluded };
}
