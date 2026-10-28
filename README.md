# Neulgyeot | 늘곁

**Care intelligence that stays close.**  
돌봄 현장의 작은 변화를 발견하고, 사람의 판단과 적절한 지원으로 연결하는 AI 기반 돌봄 인텔리전스 제품입니다.

Neulgyeot is a KREWX product. It is being developed from the prior GARDEN by GADO concept; see [Brand migration](docs/BRAND_MIGRATION.md) for the mapping and retained product principles.

## Current status

- **v0.1 concept prototype**: interactive dashboard with clearly labeled synthetic care records.
- No real person, resident, patient, or welfare-recipient data is included.
- No diagnosis, treatment decision, emergency determination, or automated care decision is made.
- All change signals are presented as prompts for human review, not as medical conclusions.
- Persistent storage, authentication, audit logs, organization separation, and production data integrations are not implemented yet.

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Prototype capabilities

- Care overview with synthetic demo metrics.
- Review-priority list filtered by care setting.
- Explainable signals based on synthetic personal-baseline comparisons.
- Observation timeline for a selected demo subject.
- Clear disclosure that the prototype uses synthetic data only.

## Product direction

Neulgyeot is intended to support care facilities, home-based care, and community/municipal care. The product starts by helping care teams answer:

> "오늘 우리가 먼저 확인해야 할 사람은 누구인가?"

AI surfaces change signals and their evidence; care professionals decide what to do next.

## Documentation

- [Brand migration](docs/BRAND_MIGRATION.md)
- [Product specification](docs/PRODUCT_SPEC.md)
- [Technical roadmap](docs/ROADMAP.md)
- [Data and safety principles](docs/DATA_AND_SAFETY.md)
- [Community-care and AI strategy](docs/COMMUNITY_CARE_AND_AI_STRATEGY.md)

## Tech direction

- Web: Next.js, React, TypeScript
- API: Python / FastAPI (planned)
- Database: PostgreSQL (planned)
- Data analysis: Pandas / scikit-learn (planned)
- Deployment: Vercel for the web prototype; API/data services to be selected after the prototype

Do not connect or upload real personal or health data before security, access control, retention, and legal/regulatory requirements have been reviewed.
