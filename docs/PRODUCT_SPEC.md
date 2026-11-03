# Neulgyeot Hospital v0.2 — Product specification

## Product boundary

Neulgyeot is split into separately deployed products:

| | Product A — Neulgyeot Hospital (this repo) | Product B — Neulgyeot Municipality (separate, not started) |
|---|---|---|
| Users | Hospital administrators, doctors, nurses, hospital social workers, discharge coordinators | City/county/district integrated-care staff, 읍·면·동 case managers, community-care providers, residents/authorized family |
| Owns | Hospital EMR records, clinical access permissions, discharge planning, referral preparation, family reports | Case-management data, assessments, support plans, service matching, provider tracking, monitoring, closure, resource directory |
| Never includes | Municipal dashboards, municipal case queues, service-management screens | Hospital EMR, unrestricted clinical records |

A third, future product — **늘곁 패밀리 (Family app)** — will show guardians only the reports explicitly approved for their account.

## Purpose

Help hospital staff understand a patient's current status, review functional and care information, prepare discharge planning, verify consent and legal-basis review, and send a structured, minimum-necessary referral to a separate municipal care system — plus share approved care updates with authorized guardians.

## v0.2 scope (implemented, synthetic data, demo state)

1. **Workstation layout** — desktop-first (1440px) three columns: patient list (search, ward, admission status, discharge-planned filters, keyboard navigation) · EMR summary · monitoring & review. Responsive at tablet/mobile widths.
2. **EMR summary** — patient ID, name, birth date, gender, ward/room/bed, attending physician, admission and planned discharge dates, status; KCD diagnoses; functional note; K-ADL (eating, mobility, toileting) with previous assessment; K-MMSE score record; Morse Fall Scale score and the instrument's band; medication summary; recent notes. No interpretations are generated.
3. **Monitoring** — latest BP, pulse, temperature, SpO₂ with timestamp, source and recorder labels; fixed-scale SVG trends with gaps for missing data; history table; change signals vs. personal baseline with evidence and "검토 완료 표시". Neutral labels only: 확인 필요, 기록 없음, 최근 측정, 데이터 부족, 관찰 중.
4. **병동 현황, 진료·간호 기록, 투약 요약, 알림** — census and bed map, note table with family-shareable flag, medication record presence, review notices and audit events.
5. **퇴원·지역연계** — see [Municipal referral integration](MUNICIPAL_REFERRAL_INTEGRATION.md).
6. **보호자 리포트** — see [Family Care Reports](FAMILY_REPORTS.md).

## Not included

- Product B (municipal application) or any municipal screens.
- Real data, real integrations, real message delivery, device connections.
- Authentication, roles, tenancy, persistence, production audit log.
- Diagnosis, treatment recommendations, emergency prediction, AI summarization.

## Success criteria for v0.2

- Selecting a patient updates every patient panel; all menus work.
- Assessment validation, consent gate, payload preview, send simulation and status timeline work end-to-end.
- Family report generation → review → approval → mock delivery → history works; revocation blocks further sharing.
- `npm run lint`, `npm test`, `npm run build` pass.
- All sample records are visibly marked synthetic; no claims of real integration.
