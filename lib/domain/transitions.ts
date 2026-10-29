import type { ReferralStatus, SupportRequestStatus, TaskStatus } from "./constants";

/** Allowed status transitions, enforced on the server. */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ["in_progress", "waiting", "completed", "cancelled"],
  in_progress: ["waiting", "completed", "cancelled"],
  waiting: ["in_progress", "completed", "cancelled"],
  completed: ["open"], // reopen
  cancelled: ["open"],
};

export const REFERRAL_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  requested: ["received", "failed", "cancelled"],
  received: ["in_progress", "failed", "cancelled"],
  in_progress: ["in_service", "failed", "cancelled"],
  in_service: ["suspended", "completed"],
  suspended: ["in_service", "completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export const SUPPORT_REQUEST_TRANSITIONS: Record<SupportRequestStatus, SupportRequestStatus[]> = {
  received: ["in_progress", "answered", "closed"],
  in_progress: ["answered", "closed"],
  answered: ["in_progress", "closed"],
  closed: [],
};

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function checkTaskTransition(
  from: TaskStatus,
  to: TaskStatus,
  fields: { resultNote?: string | null; reopenReason?: string | null },
): TransitionCheck {
  if (from === to) return { ok: true };
  if (!TASK_TRANSITIONS[from].includes(to)) return { ok: false, reason: `'${from}'에서 '${to}'(으)로 바꿀 수 없습니다.` };
  if (to === "completed" && !fields.resultNote?.trim()) return { ok: false, reason: "완료하려면 처리 결과를 입력해야 합니다." };
  if (to === "cancelled" && !fields.resultNote?.trim()) return { ok: false, reason: "취소 사유를 입력해야 합니다." };
  if (to === "open" && !fields.reopenReason?.trim()) return { ok: false, reason: "다시 여는 사유를 입력해야 합니다." };
  return { ok: true };
}

export function checkReferralTransition(
  from: ReferralStatus,
  to: ReferralStatus,
  fields: { failureReason?: string | null },
): TransitionCheck {
  if (from === to) return { ok: true };
  if (!REFERRAL_TRANSITIONS[from].includes(to)) return { ok: false, reason: `'${from}'에서 '${to}'(으)로 바꿀 수 없습니다.` };
  if (to === "failed" && !fields.failureReason?.trim()) return { ok: false, reason: "연계 실패 사유를 입력해야 합니다." };
  return { ok: true };
}

export function checkSupportRequestTransition(
  from: SupportRequestStatus,
  to: SupportRequestStatus,
  fields: { responseContent?: string | null },
): TransitionCheck {
  if (from === to) return { ok: true };
  if (!SUPPORT_REQUEST_TRANSITIONS[from].includes(to)) return { ok: false, reason: `'${from}'에서 '${to}'(으)로 바꿀 수 없습니다.` };
  if (to === "answered" && !fields.responseContent?.trim()) return { ok: false, reason: "답변 내용을 입력해야 합니다." };
  return { ok: true };
}
