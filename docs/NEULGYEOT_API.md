# 늘곁 API

Next.js Route Handler(`app/api/**/route.ts`). 모든 핸들러는 `lib/server/http.ts`의 `route()`로 감싸 세션 확인, 오류 형식, JSON 응답을 통일합니다. 입력은 zod로 검증하고 알 수 없는 필드는 거부합니다(`strict`).

## 공통

- 인증: `ng_session` 서명 쿠키(HMAC-SHA256, httpOnly, SameSite=Lax, 8시간). 요청마다 DB에서 사용자를 다시 읽어 비활성화·역할 변경을 즉시 반영
- 오류: `{ "error": { "code", "message", "details?" } }`
  - 400 `validation_error` (zod 필드 오류 포함) · 401 `unauthenticated` · 403 `forbidden` · 404 `not_found` (권한 밖 사례도 404) · 409 `conflict` · 429 `rate_limited` · 501 `not_implemented` · 500 `internal_error`(세부 내용 미노출)
- 페이지네이션: `?page=1&pageSize=20` (최대 100) → `{ data, pagination: { page, pageSize, total, totalPages } }`
- 속도 제한: AI 사용 엔드포인트 사용자당 분당 20회, 데모 로그인 분당 30회 (프로세스 메모리 기반)
- 기간: `from`, `to`는 `YYYY-MM-DD`(KST), 기본 최근 30일, 최대 366일

## 역할별 접근

| 역할 | 접근 |
|---|---|
| admin | 전 지역, 감사 로그, 기록 삭제 |
| worker | 자기 시·군·구와 하위 동의 대상자만 |
| provider | 자기 기관에 온 의뢰만 (대상자 코드만 보임, 기록·분석 불가) |
| recipient | 본인 포털 |
| family | 동의(`granted`)된 연결의 허용된 권한만 |

## 엔드포인트

### 인증·상태
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/demo-login` | `{userId}` 가상 계정 로그인 (`NEULGYEOT_DEMO_LOGIN`이 허용할 때만) |
| POST | `/api/auth/logout` | 세션 삭제 |
| GET | `/api/auth/me` | 현재 사용자 |
| GET | `/api/auth/demo-accounts` | 가상 계정 목록 |
| GET | `/api/health` | DB·AI 설정 여부 (비밀값 미노출, 인증 불필요) |

### 지역·대시보드·지도
| GET | `/api/regions` | 지역 트리 |
|---|---|---|
| GET | `/api/dashboard/summary` | KPI (`from,to,regionId,serviceType,unconnected,needsReview,taskStatus`) |
| GET | `/api/dashboard/regions` | 시·군·구별 집계 |
| GET | `/api/map/coverage` | 동별·구별 지표, 서비스 자원, 경계 도형 |
| GET | `/api/map/providers` | 기관 위치(가상 평면 좌표) |

### 대상자·기록
| GET | `/api/recipients` | `q, regionId, assignedUserId, serviceType, status, unconnected, needsReview, sort, page, pageSize` |
|---|---|---|
| POST | `/api/recipients` | 가상 대상자 등록 (가명·연령·동·필요 지원·속성) |
| GET/PATCH | `/api/recipients/{id}` | 상세·수정(상태, 담당자, 필요 지원, 다음 확인, 메모) |
| GET/POST | `/api/recipients/{id}/records` | 기록 목록·작성 |
| GET | `/api/recipients/{id}/timeline` | 시간순 이벤트 (기록·분석·검토·의뢰·조치·상태 변경) |
| GET | `/api/recipients/{id}/family-links` | 가족 연결 |
| GET/PATCH/DELETE | `/api/records/{id}` | 조회(수정 이력 포함)·수정(작성자/관리자)·소프트 삭제(관리자, 사유 필수) |

### 분석
| POST | `/api/recipients/{id}/assessments` | `{useAi}` 분석 실행 |
|---|---|---|
| GET | `/api/recipients/{id}/assessments` | 분석 이력 |
| GET | `/api/assessments` | `reviewStatus, priority, regionId, latestOnly` |
| GET | `/api/assessments/{id}` | 상세 |
| PATCH | `/api/assessments/{id}/review` | `{reviewStatus: accepted|modified|dismissed, reviewNote}` (수정·기각은 의견 필수, 재검토 409) |

### 서비스
| GET | `/api/services` | 카탈로그 |
|---|---|---|
| GET | `/api/providers` | 기관 |
| POST | `/api/recipients/{id}/service-matches` | `{serviceTypes?}` 후보·제외 사유 |
| GET/POST | `/api/referrals` | 목록 / 생성(`confirmedReview: true` 필수, 중복 진행 의뢰 거부) |
| GET/PATCH | `/api/referrals/{id}` | 상세(상태 이력) / 상태 변경(전이 검증, 실패 사유 필수) |

### 조치
| GET/POST | `/api/tasks` | `status(active 포함), priority, assigneeId, recipientId, regionId, overdue, taskType` |
|---|---|---|
| GET/PATCH | `/api/tasks/{id}` | 상태 전이 검증, 완료·취소 시 결과 필수, 재개 사유 필수 |
| GET | `/api/tasks/{id}/history` | 감사 로그 기반 이력 |

### 음성
| POST | `/api/voice/transcribe` | **501** — 서버 음성 인식 미연동 |
|---|---|---|
| POST | `/api/voice/structure` | `{transcript}` → AI 또는 규칙 기반 구조화 초안 |
| POST | `/api/voice/drafts` | 초안 저장 |
| GET/PATCH | `/api/voice/drafts/{id}` | `action: update|save|discard` (저장은 `reviewedByStaff: true` 필수) |

### 통계·보고서
| GET | `/api/analytics/summary` | KPI·지역별·유형별·조치 상태 |
|---|---|---|
| GET | `/api/analytics/trends` | 주별 신규 대상자·조치 생성·완료·연계 실패/중단 |
| GET | `/api/reports` | 최근 보고서 |
| POST | `/api/reports/generate` | `{from,to,regionId?}` |
| GET | `/api/reports/{id}` | 보고서 |
| GET | `/api/reports/{id}/export?format=csv|json` | CSV(BOM, 수식 주입 방지) 다운로드 |

### 포털·문의·알림·감사
| GET | `/api/portal/context` | 연결된 대상자 |
|---|---|---|
| GET | `/api/portal/services` | 서비스명·기관·쉬운 상태·연락 방법만 |
| GET | `/api/portal/schedule` | 예정 방문 시각만 |
| GET/POST | `/api/portal/requests` | 내 문의 / 문의 생성 |
| PATCH | `/api/portal/requests/{id}` | (담당자) 처리 상태·답변 |
| GET | `/api/support-requests` | (담당자) 지역 범위 문의 목록 |
| PATCH | `/api/family-links/{id}` | 동의 기록·철회 |
| GET/PATCH | `/api/notifications` | 목록(기한 알림 동기화 포함) / 읽음 처리 |
| GET/PUT | `/api/notifications/preferences` | 알림 설정 |
| GET | `/api/audit-logs` | 관리자 전용 |

## 지표 정의

| 지표 | 정의 |
|---|---|
| 등록 대상자 | `care_status <> 'closed'` 이고 기간 종료 전 등록 |
| 확인 필요 | 최신 분석 `high/medium` + `pending` (현재 시점) |
| 미연계 | 위 SQL 조각 정의 (현재 시점, 종결 제외) |
| 미완료 조치 | `open/in_progress/waiting` (현재 시점) |
| 조치 완료율 | 기간 중 생성된 조치 중 기간 종료 전 완료 ÷ 기간 중 생성된 조치. 기간 이전 생성분은 제외(코호트 방식, 중복 없음). 분모 0이면 `null` |
| 평균 조치 소요 | 기간 중 완료된 조치의 (완료−생성) 평균 일수 |
| 미연계 추세 | 과거 스냅샷이 없어 주별 연계 실패·중단 발생 건수로 대체 |

`tests/analytics.test.ts`가 서비스 계층 값을 독립적으로 작성한 SQL과 비교합니다.
