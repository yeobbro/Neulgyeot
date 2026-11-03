# Neulgyeot Hospital | 늘곁 요양병원용 (CareLink EMR)

**This repository is Product A — Neulgyeot Hospital.**
A hospital-focused EMR workspace prototype for long-term-care hospitals (요양병원): doctors, nurses, hospital social workers, discharge coordinators and administrators.

Neulgyeot is a KREWX product. See [Brand migration](docs/BRAND_MIGRATION.md) for the history of the name.

> **Product B — Neulgyeot Municipality (늘곁 지자체용)** is a separate product (referral intake, case assessment, individual support plans, service matching, monitoring, regional resource directory). It is **not** implemented here and must be developed and deployed independently. This repository only prepares and sends (mock) discharge-care referrals across a defined API boundary. See [Municipal referral integration](docs/MUNICIPAL_REFERRAL_INTEGRATION.md).

## Current status — v0.2 synthetic-data prototype

- Interactive three-column EMR workstation (patient list · EMR summary · monitoring/review).
- **All patients, staff, codes, measurements and notes are synthetic.** No real personal or health data.
- Vital signs are fixed demo values from "manual entry" records. There is **no** medical-device or real-time connection.
- Municipal referral and family-report delivery use **mock adapters only**. No network calls, email, SMS, KakaoTalk or notifications are sent.
- No diagnosis, treatment recommendation, emergency determination or automated care decision is made.
- No authentication, persistence, tenancy or production audit log yet — demo state lives in memory and resets on reload.

## Features

| Menu | What it does |
|---|---|
| 환자 요약 | Patient banner, demographics, KCD diagnosis list, functional status, K-ADL (eating/mobility/toileting) with change vs. previous assessment, K-MMSE record, Morse Fall Scale record, medication summary, recent notes; right panel with latest BP/pulse/temperature/SpO₂, small SVG trends, measurement history, and explainable change signals (personal-baseline comparison) with "검토 완료 표시". |
| 병동 현황 | Census table per ward and interactive bed map; selecting a bed opens the patient. |
| 진료·간호 기록 | Notes by type with "보호자 공유 가능 / 내부 기록" flag, K-ADL history, 7-day daily-living records. |
| 투약 요약 | Current medication list and today's administration-record presence only. |
| 퇴원·지역연계 | 5-step discharge referral: plan → social-work assessment (validated, draft save) → third-party consent & legal-basis review gate → minimum-necessary JSON payload preview with copy → mock send, status timeline, 보완 요청 resubmission. |
| 보호자 리포트 | Family Care Reports: guardian/consent overview, report composer (period, category scope, rule-based draft with source records, staff edit, review, approval), PDF-style preview with browser print, mock delivery (incl. deterministic failure + retry), open simulation, history, sharing settings with suspension/revocation, audit trail. |
| 알림 | Neutral care-review notices (확인 필요 / 기록 없음 / 데이터 부족 / 관찰 중) and in-memory audit events. |

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm test           # node:test unit tests for referral + family-report logic
npm run build
```

## Demo scenarios (deterministic)

| Patient | Referral mock scenario | Family-report delivery |
|---|---|---|
| SYN-P-0001 한서진 | 수신 확인 → 심사 중 → 승인 → 연계 종료 | 자녀 (권한 확인): 성공 · 배우자: 권한 확인 전 → 공유 불가 |
| SYN-P-0002 박정호 | … → 보완 요청 → 보완 제출 → 심사 중 → 승인 → 연계 종료 | 첫 전송 실패 → 재전송 성공 |
| SYN-P-0005 윤복순 | … → 반려 (관할 확인 필요) | 성공 |
| SYN-P-0008 서영길 | 승인 경로 | 성공 |

## Code layout

```
app/                         Next.js entry, global clinical styles (light theme, print CSS)
components/hospital/         App shell, nav, patient list, summary, monitoring, ward, records, meds, alerts
components/discharge/        Discharge & referral workflow (assessment, consent, payload, timeline)
components/family/           Family Care Reports (composer, preview, history, sharing)
components/ui/               Small typed primitives (Panel, Badge, KV, Checklist)
lib/demo/                    Synthetic hospital data, deterministic demo clock
lib/hospital/                Domain types, derivations, review notices
lib/integrations/municipal-referral/  Referral contract types, validation, payload builder, mock adapter
lib/family-report/           Family report types, draft builder, sharing gates, mock delivery
lib/state/                   In-memory reducer and audit events
tests/                       node:test unit tests
```

## Documentation

- [Product specification](docs/PRODUCT_SPEC.md)
- [Municipal referral integration (API boundary)](docs/MUNICIPAL_REFERRAL_INTEGRATION.md)
- [Family Care Reports](docs/FAMILY_REPORTS.md)
- [Technical roadmap](docs/ROADMAP.md)
- [Data and safety principles](docs/DATA_AND_SAFETY.md)
- [Community-care and AI strategy](docs/COMMUNITY_CARE_AND_AI_STRATEGY.md) — background for the separate Municipality product
- [Brand migration](docs/BRAND_MIGRATION.md)

Do not connect or upload real personal or health data before security, access control, retention, and legal/regulatory requirements have been reviewed.
