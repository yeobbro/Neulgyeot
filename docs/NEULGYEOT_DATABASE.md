# 늘곁 데이터베이스

- 엔진: PostgreSQL 방언. 개발·시연은 PGlite(`@electric-sql/pglite`, WASM PostgreSQL)
- 연결: `lib/server/db/client.ts` (`Db` 인터페이스: `query`, `transaction`, `close`)
- 마이그레이션: `lib/server/db/migrations/*.ts` (`up`/`down` SQL), 기록 테이블 `schema_migrations`
- 시드: `lib/server/db/seed.ts`
- 시간: 모든 시각은 `timestamptz`(UTC). 화면은 `Asia/Seoul`로 표시

## 명령

```bash
npm run db:migrate    # 미적용 마이그레이션 적용
npm run db:rollback   # 마지막 마이그레이션 롤백 (모든 테이블 삭제 — 데모 DB 전용)
npm run db:seed       # 비어 있을 때만 가상 데이터 생성 (중복 생성 없음)
npm run db:reset      # 모든 행 삭제 후 재생성 (데모 DB 전용)
```

PGlite는 데이터 디렉터리 하나를 한 프로세스만 열 수 있습니다. 위 명령은 개발 서버를 멈춘 뒤 실행하세요. 서버는 처음 시작할 때 마이그레이션을 적용하고, 비어 있으면 자동으로 시드합니다(`NEULGYEOT_AUTO_SEED=false`로 끔).

## 테이블

| 테이블 | 용도 | 주요 제약 |
|---|---|---|
| `regions` | 시·도/시·군·구/읍·면·동 (가상 도시 늘봄시 16개) | `parent_id` FK, `level` CHECK, `region_code` UNIQUE, `boundary_geojson`(가상 평면 좌표) |
| `service_providers` | 제공 기관 | `region_id` FK, 좌표는 가상 평면(x=`longitude`, y=`latitude`), `is_demo_data` |
| `users` | 계정·역할 | `role` CHECK(admin/worker/provider/recipient/family), `email` UNIQUE, `provider_id`/`recipient_id` FK |
| `care_recipients` | 대상자 (가명·연령대·지역만) | `display_code` UNIQUE, `care_status` CHECK, `needs text[]`, `attributes jsonb`(나이·독거·보행보조·가족돌봄자) |
| `care_records` | 상담·방문·전화·관찰 기록 (공식 기록) | `record_type`/`visit_status` CHECK, 방문만 방문상태 가능, `flags text[]`, `deleted_at`(소프트 삭제) |
| `record_revisions` | 기록 수정 이전 값 | `record_id` FK |
| `service_catalog` | 서비스 (기관별) | `service_type` CHECK, `service_region_ids`, `eligibility_rules jsonb`, `capacity_status`, `capacity_verified`, `data_source`, `source_updated_at` |
| `service_referrals` | 의뢰·연계 | `status` CHECK, `failed`이면 `failure_reason` 필수(CHECK) |
| `risk_assessments` | 분석 결과 | `score` 0–100(업무 우선순위 점수), `priority`, `detected_signals jsonb`, `ai_status`, `ai_result`, `source_record_ids`, `review_status` |
| `action_tasks` | 후속 조치 | `status` CHECK, `completed`이면 `completed_at` 필수, 분석·기록·의뢰 FK |
| `voice_record_drafts` | 음성/텍스트 초안 (음성 파일 없음) | `review_status`(draft/saved/discarded), `saved_record_id` FK |
| `notifications` | 앱 내 알림 | `channel`은 `in_app`만 허용, `dedupe_key` UNIQUE |
| `notification_preferences` | 알림 설정 | 사용자당 1행 |
| `family_links` | 가족 연결·동의·권한 | (`recipient_id`,`user_id`) UNIQUE, `consent_status`, `permissions jsonb`, `revoked_at` |
| `support_requests` | 가족·대상자 문의 | `status` CHECK |
| `reports` | 보고서 스냅샷 | `period_end >= period_start`, `narrative_method`, `validation jsonb`, `is_demo_data` |
| `audit_logs` | 감사 로그 | 필드명·상태값만 기록 (본문 없음) |
| `id_counters` | 읽기 쉬운 순번 ID (`REC-000123`) | 원자적 upsert |

인덱스: 지역·담당자·상태·기한·대상자별 시간순 조회용 인덱스를 마이그레이션에 정의했습니다.

## 공통 정의 (SQL 조각)

`lib/server/services/sql.ts`에 한 번만 정의하고 목록·지도·대시보드·보고서가 함께 씁니다.

- **미연계(UNCONNECTED)**: 대상자의 `needs` 중 `requested/received/in_progress/in_service` 상태 의뢰가 없는 유형이 하나 이상
- **확인 필요(NEEDS_REVIEW)**: 대상자의 최신 분석이 `high/medium`이고 `review_status = pending`

## 데이터 삭제 정책

- 기록: 관리자만 소프트 삭제(`deleted_at`), 수정 이력·감사 로그 보존
- 음성 초안: 폐기하면 텍스트를 비우고 상태만 남김. 음성 파일은 저장하지 않음
- 그 외 행은 화면에서 삭제하지 않음. 데모 DB 전체 초기화는 `db:reset`

## 운영 PostgreSQL로 옮길 때

1. `pg` 풀로 `Db` 인터페이스를 구현해 `openDb`를 교체합니다. SQL은 PostgreSQL 15+에서 그대로 동작합니다.
2. 운영 DB에서는 seed·reset을 실행하지 않습니다 (`NEULGYEOT_AUTO_SEED=false`).
3. Supabase를 쓸 경우 지역·역할 기반 RLS를 추가해야 합니다 (현재 권한은 서버 코드에서만 검사).
