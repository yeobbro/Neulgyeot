import { demoLoginEnabled } from "../auth/session";

/**
 * External AI policy for this MVP: synthetic data only.
 *
 * Real care records may contain names, contact details, addresses and health information. Before any real data can be sent to
 * an external AI API the operator needs: a legal basis and notice, consent where required, a processing (위탁) agreement, a
 * cross-border transfer (국외 이전) review, and a de-identification step stronger than `maskPii`. None of that exists yet, so:
 *   - record interpretation is sent only for recipients flagged `is_demo_data`;
 *   - free-text transcript structuring (no recipient binding) is sent only on a demo deployment (`demoLoginEnabled()`);
 *   - there is deliberately no switch here to enable real data.
 */
export function aiAllowedForRecipient(isDemoData: boolean): { ok: true } | { ok: false; reason: string } {
  return isDemoData ? { ok: true } : { ok: false, reason: "실데이터는 외부 AI로 전송하지 않습니다 (가상 데이터 전용 MVP)." };
}

export function aiAllowedForFreeText(): { ok: true } | { ok: false; reason: string } {
  return demoLoginEnabled() ? { ok: true } : { ok: false, reason: "시연 환경에서만 외부 AI 구조화를 사용합니다 (가상 데이터 전용 MVP)." };
}
