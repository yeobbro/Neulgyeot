# Neulgyeot | 늘곁

**AI 기반 지역사회 통합돌봄 플랫폼 (프로토타입)**
지자체와 지역사회 돌봄 담당자가 돌봄이 필요한 사람의 상황을 파악하고, 지역별 수요와 서비스 공백을 분석하며, 확인 우선순위를 정해 적절한 복지·돌봄 서비스로 연결하도록 돕습니다. KREWX 제품입니다.

> **가상 데이터 전용.** 모든 인물·지역(가상 도시 "늘봄시")·기관·연락처·수치는 시연용으로 만든 것입니다. 진단, 복지 자격 판정, 긴급 판단을 하지 않으며 최종 결정은 담당자가 합니다.

## 주요 기능

| 기능 | 화면 | 상태 |
|---|---|---|
| 1. 돌봄 위험 신호 탐지 (규칙 9종 + 선택적 AI 기록 해석, 근거·검토) | `/care/signals`, `/care/assessments/[id]` | 규칙 동작, AI는 키 설정 시 |
| 2. 통합 돌봄 지도 (지역 지표·자원·필터·목록 연동) | `/care/map` | 동작 (SVG 단순 도형, 실제 경계 아님) |
| 3. 사례 관리 (목록·상세·기록 CRUD·수정 이력·타임라인) | `/care/recipients` | 동작 |
| 4. 서비스 매칭·의뢰 워크플로 | `/care/services`, 대상자 "서비스 연계" 탭 | 동작 (결정적 규칙) |
| 5. 현장 음성 기록 → 검토 → 공식 기록 | `/care/voice` | 브라우저 음성 인식 + 직접 입력. 서버 STT 없음 |
| 6. 후속 조치·기한 관리·앱 내 알림 | `/care/tasks`, `/care/notifications` | 동작 (외부 알림 없음) |
| 7. 성과 분석·보고서·CSV | `/care/reports` | 동작 (PDF는 브라우저 인쇄) |
| 8. 가족·대상자 포털 | `/portal` | 동작 (가상 계정) |

기존 디자인 시안 `/dashboard`, `/prototype`은 그대로 보존했습니다(저장 기능 없는 정적 데모).

## 기술 스택

Next.js 16 (App Router, Route Handlers) · React 19 · TypeScript · PGlite(PostgreSQL WASM) · zod · `@anthropic-ai/sdk`(선택) · 테스트: Node 내장 러너 + tsx · CSS(의존성 없는 SVG 지도·차트)

## 시작하기

요구 사항: Node.js 22 이상 권장 (빌드는 20.9+, 테스트 스크립트는 22 기준)

```bash
npm install
cp .env.example .env.local   # 선택: 값이 없어도 개발 모드로 동작
npm run dev                  # http://localhost:3000
```

첫 실행 시 `.data/pglite`에 DB를 만들고 마이그레이션 적용 후 가상 데이터를 자동 생성합니다. `/login`에서 가상 계정을 고르세요.

### 환경변수 (`.env.example`)

| 변수 | 설명 |
|---|---|
| `NEULGYEOT_SESSION_SECRET` | 세션 서명 키(32자+). 운영 필수 |
| `NEULGYEOT_DEMO_LOGIN` | 가상 계정 로그인. 개발 기본 허용, 운영은 `true`일 때만 |
| `NEULGYEOT_DB_DIR` | PGlite 데이터 디렉터리 (`memory://` 가능) |
| `NEULGYEOT_AUTO_SEED` | 빈 DB 자동 시드 (기본 true) |
| `ANTHROPIC_API_KEY` | 선택. AI 기록 해석·음성 구조화·보고서 초안. 서버 전용 |
| `NEULGYEOT_AI_MODEL` / `NEULGYEOT_AI_ENABLED` | 모델 변경(기본 `claude-opus-5-5`) / AI 끄기 |

AI 키가 없으면 규칙 기반 분석, 규칙 기반 음성 구조화, 템플릿 보고서가 동작하고 화면에 "AI 미설정"이 표시됩니다.

### DB

```bash
npm run db:migrate    # 마이그레이션 적용
npm run db:rollback   # 마지막 마이그레이션 롤백
npm run db:seed       # 비어 있을 때만 가상 데이터 생성
npm run db:reset      # 전체 삭제 후 재생성 (데모 DB 전용)
```

개발 서버를 멈춘 뒤 실행하세요(PGlite는 한 프로세스만 DB를 엽니다). 자세한 내용: [DATABASE](docs/NEULGYEOT_DATABASE.md)

### 검사

```bash
npm run lint
npm run typecheck
npm test                                   # 60개 단위·API·통합 테스트 (인메모리 DB)
npm run build
node scripts/e2e-smoke.mjs http://localhost:3000   # 선택: 실행 중인 서버 대상 Playwright 스모크
```

## 시연

3분 시연 순서와 시나리오 A~H 대상자는 [DEMO_GUIDE](docs/NEULGYEOT_DEMO_GUIDE.md)에 있습니다.

## 문서

- [현재 상태 분석](docs/NEULGYEOT_CURRENT_STATE.md) · [아키텍처](docs/NEULGYEOT_ARCHITECTURE.md) · [구현 계획·상태](docs/NEULGYEOT_IMPLEMENTATION_PLAN.md)
- [데이터베이스](docs/NEULGYEOT_DATABASE.md) · [API](docs/NEULGYEOT_API.md) · [AI·규칙 로직](docs/NEULGYEOT_AI_LOGIC.md)
- [보안·개인정보](docs/NEULGYEOT_SECURITY.md) · [시연 가이드](docs/NEULGYEOT_DEMO_GUIDE.md) · [테스트 보고서](docs/NEULGYEOT_TEST_REPORT.md)
- 기존 문서: [제품 명세](docs/PRODUCT_SPEC.md) · [로드맵](docs/ROADMAP.md) · [데이터·안전 원칙](docs/DATA_AND_SAFETY.md) · [통합돌봄·AI 전략](docs/COMMUNITY_CARE_AND_AI_STRATEGY.md) · [대시보드 개선 계획](docs/DASHBOARD_UPGRADE_PLAN.md) · [브랜드 이전](docs/BRAND_MIGRATION.md)

## 현재 한계와 향후 과제

- 실제 인증·본인확인·가족 대리권 검증 없음 (가상 계정만)
- PGlite는 단일 프로세스·파일 기반 — 운영은 PostgreSQL로 교체 필요, Vercel에서는 `/tmp`에 저장되어 재시작 시 초기화
- 지도는 가상 도시의 단순 도형 — 실제 행정경계·지도 타일 미사용
- 서버 음성 인식, 이메일·문자·푸시 알림, 서버 PDF 생성, 외부 행정 시스템 연동 미구현
- AI 경로는 실제 API 키로 검증하지 않음
- 실데이터 사용 전 보안·개인정보·법률 검토 필수 — [SECURITY](docs/NEULGYEOT_SECURITY.md)
