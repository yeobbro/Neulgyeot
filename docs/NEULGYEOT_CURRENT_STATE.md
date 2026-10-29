# 늘곁(Neulgyeot) — 현재 상태 분석

작성: 2026-10-29 · 기준 브랜치 `feature/dashboard-upgrade`(PR #2, 미병합) 위에 `claude/neulgyeot-integrated-care`를 생성

## 1. 통합 작업 이전 상태 (분석 결과)

| 항목 | 상태 |
|---|---|
| 프론트엔드 | Next.js 16.4.3 (App Router), React 19, TypeScript 5.9 strict |
| 백엔드 / API | 없음. `app/api` 없음. README의 FastAPI는 "계획" 단계 |
| 데이터베이스 | 없음. 모든 데이터가 컴포넌트 안 상수(`initialRecipients`) |
| 마이그레이션 | 없음 |
| 인증·권한 | 없음 (화면에 "Demo workspace" 표기만) |
| 페이지 | `/` → `/dashboard` 리다이렉트, `/dashboard`(8개 메뉴 탭을 가진 클라이언트 컴포넌트, 정적 수치), `/prototype`(v0.1 시안 보존) |
| 지도 | 라이브러리 없음. CSS 그라디언트와 절대 위치 핀으로 그린 장식용 지도 |
| 차트 | 라이브러리 없음. CSS 막대 |
| AI 연동 | 없음. "AI 변화 신호"는 하드코딩된 문장 |
| 환경변수 | 없음 (`.env.example` 없음) |
| 테스트 | 없음 |
| CI | `.github/workflows/ci.yml` — `npm install`, `npm run lint`, `npm run build` |
| 잠금 파일 | 없음 (`package-lock.json` 미커밋) |
| 배포 | Vercel 예정(README) |
| 디자인 시스템 | `app/dashboard/dashboard.css`: 아이보리 캔버스(`#f7f8f4`), 딥 포레스트 그린 사이드바(`#10392f`), `ng-*` 클래스. 글자 크기 8–13px로 작음 |
| 문서 | `PRODUCT_SPEC`, `DATA_AND_SAFETY`, `ROADMAP`, `COMMUNITY_CARE_AND_AI_STRATEGY`, `DASHBOARD_UPGRADE_PLAN`, `BRAND_MIGRATION` |

기존 화면의 버튼(검토 완료 등)은 React state만 바꾸며 "실제 기록은 저장되지 않습니다"라고 안내한다. 즉 8개 요구 기능 중 실제로 작동하는 기능은 없고, 디자인 방향만 존재했다.

## 2. 요구 기능과 기존 코드 매핑

| 요구 기능 | 기존 코드 | 처리 |
|---|---|---|
| 1. AI 위험 신호 탐지 | `/dashboard` "AI 변화 신호" 탭(고정 문장) | 규칙 엔진 + 선택적 AI 해석을 새로 구현, 화면은 `/care/signals`, `/care/assessments/[id]` |
| 2. 통합 돌봄 지도 | 장식용 CSS 지도 | DB 집계 기반 SVG 지도 + 목록 대체 UI (`/care/map`) |
| 3. 사례 관리 | 대상자 목록 4명(상수) | DB CRUD, 상세·타임라인 (`/care/recipients`) |
| 4. 서비스 매칭 | "서비스 연계" 탭(정적 카드) | 결정적 매칭 + 의뢰 워크플로 (`/care/services`) |
| 5. 음성 기록 | 없음 | 브라우저 음성 인식 + 텍스트 대체 (`/care/voice`) |
| 6. 후속 조치 | 없음 | 조치 업무 상태 모델 (`/care/tasks`) |
| 7. 통계·보고서 | "통계 리포트" 탭(정적) | 집계 쿼리, 보고서, CSV (`/care/reports`) |
| 8. 가족 소통 | 없음 | 분리된 포털 (`/portal`) |

## 3. 보존한 것

- `/dashboard`, `/prototype` 화면과 CSS는 수정하지 않고 그대로 둔다 (디자인 시안). `/dashboard` 상단에 새 워크스페이스로 가는 링크 1줄만 추가했다.
- 기존 디자인 토큰(아이보리·포레스트 그린)을 새 워크스페이스 CSS(`app/care/care.css`)에서 재사용한다.
- CI 명령(`lint`, `build`)은 그대로 통과해야 한다. 여기에 `npm test`를 추가했다.

## 4. 변경한 것 (요약)

- `/`는 `/dashboard` 대신 로그인 상태에 따라 `/login`, `/care`, `/portal`로 이동한다.
- 서버 측 데이터 계층(PGlite 임베디드 PostgreSQL), 마이그레이션, 가상 데이터 seed, Route Handler API, 데모 인증을 추가했다.
- 의존성 추가: `@electric-sql/pglite`, `zod`, `@anthropic-ai/sdk`, dev `tsx`. 잠금 파일 `package-lock.json`을 커밋한다.

자세한 구조는 [NEULGYEOT_ARCHITECTURE.md](NEULGYEOT_ARCHITECTURE.md), 순서와 범위는 [NEULGYEOT_IMPLEMENTATION_PLAN.md](NEULGYEOT_IMPLEMENTATION_PLAN.md)를 본다.
