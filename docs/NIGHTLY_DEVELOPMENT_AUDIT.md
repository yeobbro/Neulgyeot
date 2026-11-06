# Neulgyeot (늘곁) — Nightly Development Audit (2026-11-06)

| 항목 | 값 |
|---|---|
| Remote | `https://github.com/yeobbro/Neulgyeot.git` |
| Default branch | `main` @ `e044bc6` (Merge PR #4 feat/hospital-emr-workspace) |
| 로컬 작업 폴더 | `01_Products/Neulgyeot/repository` — `main`, 미커밋 변경 없음 (변경하지 않음) |
| 관련 저장소 | `yeobbro/Neulgyeot_Gov` (지자체용, 별도 저장소, 이번 스프린트에서 변경 없음) |
| 신규 브랜치 | `feat/neulgyeot-quick-care-20261106` (base `e044bc6`) |
| Stack | Next.js 16.4.x, React 19, TypeScript, node:test, ESLint 9. Backend/DB 없음 (클라이언트 DEMO, 합성 데이터) |
| Scripts | `npm run lint`, `npm test`, `npm run build` |
| Supabase | 사용 안 함 |
| Vercel | 기존 연결 상태는 이 세션의 Vercel 권한 문제로 조회하지 못함 (미검증) |

Baseline (`main`): `npm test` 기존 테스트 통과 (family-report, referral).
