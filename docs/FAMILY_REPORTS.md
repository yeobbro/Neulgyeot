# Family Care Reports (보호자 리포트) — hospital side

Purpose: help authorized family members understand care progress **without exposing the hospital EMR**.

## Screens

- **보호자 리포트** — guardian, relationship, authority type, masked contact, patient consent, sharing scope, sharing status, last report period and delivery status.
- **리포트 작성** — select guardian → period (weekly / monthly / custom) → allowed categories → generate draft from synthetic records → edit/exclude items → request review → confirm review → approve → PDF-style preview (browser print → PDF) → mock delivery → open simulation.
- **발송 이력** — per-report status, approval time, delivery attempts, opened time, current access status; audit events (create, review, approval, delivery, failure, open, sharing changes, revocation).
- **보호자 공유 설정** — authority verification, patient consent / legal representative status, per-category allow list, sensitive-information review (checkbox + memo), suspend / resume / revoke, re-register after revocation.

## Content and scope rules

Sections: 기본 돌봄 요약 · 일상생활 · 간호·돌봄 관찰 · 재활 및 일정 · 보호자 소통.

- Only notes flagged "보호자 공유 가능" are included; internal notes and staff comments are never included.
- Diagnosis, medication and test results are excluded by default; they become selectable only when allowed in sharing settings **and** a sensitive-information review is recorded.
- Being a family member does not grant access: authority verification + patient consent (or legal representative authority) + active status are required.

## Facts vs. generated text

Every item is tagged: **기록 사실** (record as-is), **자동 집계 초안** (deterministic rule-based aggregation — *not AI*), **직원 작성** (staff-written); edits are marked "직원 수정". Each item lists source record IDs; missing data is marked "데이터 부족" instead of being filled in. Staff approval is required before sharing; editing an approved report revokes the approval.

If AI-assisted summarization is added later it must cite sources per item, never invent observations, mark uncertainty/missing data, and require human approval.

## Delivery

Status: 작성 중 → 검토 중 → 승인 완료 → 전송 완료 / 전송 실패 → 열람 완료.
`lib/family-report/mock-delivery.ts` sends nothing (no email, SMS, KakaoTalk, push). One synthetic guardian (SYN-P-0002) fails on the first attempt so the retry path can be reviewed.

## Future: 늘곁 패밀리

Separate family-facing product: per-account access to approved reports only, report history and timeline, consent withdrawal and access revocation that also hides already delivered reports, no access to the hospital EMR.
