# Quick Tagging · Care Timeline · 늘곁 패밀리 대시보드 (2026-11-06)

모든 데이터는 합성(DEMO)이며, 운영 서버에서는 아래 규칙을 **서버 측에서** 동일하게 실행해야 한다.

## 케어 이벤트 (`lib/care/types.ts`)
필드: `care_event_id, client_event_id, resident_id, staff_id, care_type, performed_at, recorded_at, source_device, confirmation_status, confirmed_at, verified_by, verified_at, notes, correction_reference, created_at`

케어 항목: 체위변경 · 복약 보조 · 기저귀 교체 · 식사 보조 · 수분 섭취 · 이동 보조 · 위생 관리 · 관찰 기록 · 기타 업무

## 기록 흐름 (`lib/care/tagging.ts`)
1. 직원 인증 (NFC/QR 사원증 → 직원 디렉터리, 비활성 계정 거부)
2. 환자 확인 (침상 QR/NFC 태그 `NGT1:R:<tagId>:<check>`, 손상·위조 거부. 운영에서는 서버 발급 불투명 ID 사용)
3. 권한 검증: 담당 병동 환자만 기록 (환자 격리)
4. 기록: `recorded_at` = **서버 시각**, `performed_at`은 최대 12시간 소급, 미래 불가
5. 중복 방지: 같은 `client_event_id` 또는 같은 환자·직원·항목의 항목별 시간창(5~60분)
6. **태그만으로 완료 처리하지 않음**: `recorded` → 수행자 본인 `staff_confirmed` → 다른 간호사 `independently_verified`
7. 수정: 원본은 `voided`로 보존, 새 기록이 `correction_reference`로 원본을 참조, 사유 필수, 재확인 필요
8. 감사 로그: create / confirm / verify / correct / reject
9. 오프라인: `syncOfflineQueue` — 같은 규칙으로 재검증, `client_event_id` 기반 멱등

웨어러블(`lib/care/wearables.ts`): 모든 워치/링이 NFC를 지원한다고 가정하지 않음. Adapter가 기능을 선언하고 `captureRoute`가 `wearable_nfc` / `wearable_confirm_only` / `qr_fallback` 중 실제 가능한 경로를 고른다. 벤더 SDK는 포함하지 않음.

## 타임라인/리포트 (`lib/care/timeline.ts`)
- 계획(케어 플랜) vs 실제 기록 매칭 (±90분), 지연 시간 표시
- 상태: Recorded · Staff-confirmed · Independently verified · Missing · Unconfirmed (확인 유예 30분 경과)
- 일일/주간/월간 요약, 업무별·담당자별 집계, CSV (보호자용은 직원 이름 제외)

## 보호자 대시보드 (`lib/care/family.ts`, `/family`)
- 연결된 환자 + 확인된 권한(환자 지정 보호자/법정대리인)만 열람. 가족 관계만으로는 불가, 권한 해제 시 차단
- 직원 이름 대신 직무만 표시, 관찰 기록(내부) 제외, 미래 일정 제외
- 오늘 요약, 타임라인, 주간 활동, 누락 알림, 지자체 연계 상태(심사중/승인/개시/종료/보완 필요), 보고서 다운로드

## UI
- `현장 케어 기록`, `케어 타임라인` 메뉴 추가, `/family` 보호자 화면
- 디자인 토큰(spacing, radius, shadow, 44px 터치 타깃) 추가, 상태는 색 + 아이콘 + 텍스트로 표시(접근성)

## 테스트 (`tests/care.test.ts`, 14개)
인증, 환자 격리, 태그 위변조, 서버 시각, 중복, 확인/검증 권한, 수정 이력, 오프라인 동기화, 웨어러블 fallback, 타임라인 상태, 주간 집계/CSV, 보호자 권한·정보 노출.

## 알려진 제한
- 백엔드/DB가 없는 DEMO. 실제 NFC(Web NFC는 Android Chrome 한정) 연동, 서버 API, 영속 저장소, 인증은 다음 단계
- 월간 보고서는 DEMO 데이터가 7일치라 7일로 계산
