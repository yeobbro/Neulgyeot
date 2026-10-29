# 늘곁 아키텍처

## 1. 결정과 이유

| 결정 | 이유 |
|---|---|
| 백엔드는 Next.js Route Handler(`app/api/**/route.ts`) | 저장소에 백엔드가 없었고 FastAPI는 계획 단계. 별도 Python 서비스를 추가하면 배포·CI가 두 배가 된다. 도메인 로직은 `lib/` 순수 함수로 분리해 두었으므로 나중에 FastAPI로 옮길 때 규칙·쿼리를 그대로 이식할 수 있다. |
| DB는 PostgreSQL 방언, 개발·시연은 PGlite | 로드맵이 PostgreSQL을 지정했다. 컨테이너에 PostgreSQL 서버가 없고, 시연은 설치 없이 돌아가야 한다. PGlite는 WASM으로 동작하는 실제 PostgreSQL이므로 마이그레이션 SQL이 운영 PostgreSQL에서도 그대로 동작한다. |
| 데모 인증(서명된 세션 쿠키) | 실제 계정 체계·본인 확인이 없다. 역할·지역 범위 검사는 서버에서 실제로 수행하고, 로그인만 가상 계정 선택으로 대신한다. |
| 지도는 의존성 없는 SVG | 기존 지도 라이브러리가 없고, 외부 타일은 키·장애 의존성이 생긴다. 지역 경계는 가상 도시의 단순 도형이며 실제 행정경계가 아님을 화면에 표시한다. |
| 차트는 의존성 없는 SVG | 기존 차트 라이브러리가 없고 필요한 차트가 막대·선 수준이다. |
| AI는 `@anthropic-ai/sdk`, 서버 전용, 선택 사항 | 키가 없으면 규칙 기반 기능만 동작하고 "AI 미설정"을 표시한다. 샘플 AI 응답을 만들지 않는다. |
| 테스트는 Node 내장 `node:test` + `tsx` | vitest 설치가 npm 해석기 오류(vite 8 선택적 peer 순환)로 실패했다. 내장 러너는 추가 의존성이 없다. |

## 2. 디렉터리

```
app/
  page.tsx                 역할별 진입 리다이렉트
  login/                   가상 계정 선택
  care/                    내부 업무 화면 (admin, worker, provider)
    layout.tsx             세션 검사 + 사이드바
    page.tsx               지역 대시보드
    map/ recipients/ signals/ assessments/ services/ tasks/
    voice/ reports/ requests/ notifications/ audit/
  portal/                  대상자·가족 화면 (별도 레이아웃, 큰 글씨)
  api/                     Route Handler (아래 API 문서)
  dashboard/ prototype/    기존 디자인 시안 (보존)
components/                공통 UI (상태 배지, 필터, 표, 차트, 지도)
lib/
  domain/                  순수 로직 — DB·HTTP 의존 없음, 단위 테스트 대상
    constants.ts           상태값·라벨
    rules/                 위험 신호 규칙 엔진 + 설정
    matching.ts            서비스 매칭
    transitions.ts         조치·의뢰 상태 전이
    voice-structure.ts     규칙 기반 기록 구조화
    report-template.ts     템플릿 보고서 + 수치 검증
  server/                  서버 전용 (DB, 인증, 서비스 계층)
    db/                    PGlite 연결, 마이그레이션, seed
    auth/                  세션, 권한
    ai/                    Claude 호출, 스키마 검증
    services/              유스케이스 (API와 서버 컴포넌트가 함께 사용)
    http.ts                공통 오류·응답 처리
tests/                     node:test
scripts/                   db 스크립트, e2e 스모크
```

## 3. 데이터 흐름

```
브라우저 ──(읽기)── 서버 컴포넌트 ──► lib/server/services ──► DB
   │                                        ▲
   └──(쓰기 fetch)── app/api Route Handler ─┘ ──► audit_logs
                                     │
                                     └──► lib/domain (규칙·매칭·전이) ──► (선택) Claude API
```

- 화면 조회는 서버 컴포넌트가 서비스 계층을 직접 호출한다. 같은 서비스 함수가 `GET` API에도 쓰이므로 권한 검사가 한 곳에 있다.
- 쓰기는 클라이언트 컴포넌트가 API를 호출한 뒤 `router.refresh()`로 화면을 다시 읽는다. 저장 결과는 DB에서 다시 읽은 값이다.
- 모든 서비스 함수는 첫 인자로 `Actor`(세션 사용자)를 받고 역할·지역 범위를 검사한다.

## 4. 시간대

DB는 `timestamptz`(UTC)로 저장하고, 화면은 `Asia/Seoul`로 표시한다. 기간 필터의 날짜는 KST 자정 기준으로 해석한다.

## 5. 운영 전환 시 바꿔야 할 것

- `lib/server/db/client.ts`의 PGlite를 `pg` 연결 풀로 교체(같은 `Db` 인터페이스 구현). SQL은 그대로 쓴다.
- 데모 로그인 제거, 기관 SSO/본인확인 연동.
- 지역 경계는 승인된 행정경계 데이터로 교체.
- 자세한 항목: [NEULGYEOT_SECURITY.md](NEULGYEOT_SECURITY.md)
