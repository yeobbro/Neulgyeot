import Link from "next/link";
import { FilterForm, regionOptions, SelectField } from "@/components/filters";
import { Empty, Heading, InferenceBadge, Pagination, Panel, PriorityBadge, ReviewBadge } from "@/components/ui";
import { PRIORITY_LABEL, REVIEW_STATUSES, REVIEW_STATUS_LABEL } from "@/lib/domain/constants";
import { RULE_CONFIG, RULE_VERSION } from "@/lib/domain/rules/config";
import { SIGNAL_LABEL } from "@/lib/domain/rules/engine";
import { fmtDateTime } from "@/lib/format";
import { aiConfigured } from "@/lib/server/ai/client";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load, readParams, type SearchParams } from "@/lib/server/page";
import { assessmentListQuery, listAssessments } from "@/lib/server/services/assessments";
import { listRegions } from "@/lib/server/services/regions";

export default async function SignalsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const regions = await listRegions(db);
  const res = await load(() => listAssessments(db, actor, assessmentListQuery.parse({ reviewStatus: "pending", ...p })));
  return (
    <>
      <Heading kicker="Risk signals" title="AI 돌봄 위험 신호 분석">
        상담·방문·서비스·조치 기록에서 평소와 다른 변화나 돌봄 공백 가능성을 찾아 확인 순서를 제안합니다. 의학적 진단이나 복지 판정이 아닙니다.
      </Heading>
      <FilterForm action="/care/signals" resetHref="/care/signals">
        <SelectField label="검토 상태" name="reviewStatus" value={p.reviewStatus ?? "pending"} allLabel="전체" options={REVIEW_STATUSES.map((s) => ({ value: s, label: REVIEW_STATUS_LABEL[s] }))} />
        <SelectField label="우선순위" name="priority" value={p.priority} options={(["high", "medium", "low", "none"] as const).map((x) => ({ value: x, label: PRIORITY_LABEL[x] }))} />
        <SelectField label="지역" name="regionId" value={p.regionId} options={regionOptions(regions, actor.scopeRegionIds)} />
        <SelectField label="범위" name="latestOnly" value={p.latestOnly ?? "true"} allLabel={null} options={[{ value: "true", label: "대상자별 최신 분석" }, { value: "false", label: "전체 이력" }]} />
      </FilterForm>
      <div className="cw-grid split">
        {!res.ok ? (
          <p className="cw-msg msg-error" role="alert">{res.message}</p>
        ) : (
          <Panel title="분석 결과" hint="업무상 확인 우선순위 순">
            {res.data.data.length === 0 ? <Empty>조건에 맞는 분석 결과가 없습니다.</Empty> : (
              <div className="cw-table-wrap">
                <table className="cw-table">
                  <thead><tr><th>대상자</th><th>우선순위</th><th>감지된 신호</th><th>방식</th><th>검토</th><th>분석 시각</th></tr></thead>
                  <tbody>
                    {res.data.data.map((a) => (
                      <tr key={a.id}>
                        <td><Link className="row-link" href={`/care/assessments/${a.id}`}>{a.displayCode}</Link><small>{a.id}</small></td>
                        <td><PriorityBadge priority={a.priority} /><small>점수 {a.score} (확률 아님)</small></td>
                        <td>{a.signals.map((s) => s.label).join(", ") || "—"}{a.dataInsufficient && <small>데이터 부족 포함</small>}</td>
                        <td><InferenceBadge label={a.method === "rules+ai" ? "규칙+AI" : "규칙"} /></td>
                        <td><ReviewBadge status={a.reviewStatus} /></td>
                        <td>{fmtDateTime(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination {...res.data.pagination} base="/care/signals" params={p} />
          </Panel>
        )}
        <Panel title="분석 규칙" hint={RULE_VERSION}>
          <p className="cw-meta">AI 기록 해석: {aiConfigured() ? "설정됨 (대상자 화면에서 선택 실행)" : "미설정 — 규칙 기반 분석만 사용"}</p>
          <ul style={{ paddingLeft: 18, fontSize: 14 }}>
            <li>{SIGNAL_LABEL.missed_visit}: 예정 시각 {RULE_CONFIG.scheduledGraceHours}시간 경과 후 미완료 (최근 {RULE_CONFIG.windowDays}일)</li>
            <li>{SIGNAL_LABEL.repeated_missed_visits}: {RULE_CONFIG.repeatedMissedVisits}회 이상</li>
            <li>{SIGNAL_LABEL.service_interruption}: {RULE_CONFIG.suspendedServiceDays}일 이상 중단</li>
            <li>{SIGNAL_LABEL.referral_failure}: 대체 연계 없음</li>
            <li>{SIGNAL_LABEL.overdue_followup}</li>
            <li>{SIGNAL_LABEL.recorded_change}: 최근 {RULE_CONFIG.recordFlagWindowDays}일 기록 표시</li>
            <li>{SIGNAL_LABEL.no_recent_contact}: {RULE_CONFIG.noContactDays}일 이상</li>
            <li>{SIGNAL_LABEL.multiple_signals}: {RULE_CONFIG.multipleSignalTypes}가지 이상</li>
            <li>{SIGNAL_LABEL.urgent_procedure_check}: 항상 우선 확인, 공식 절차 안내</li>
          </ul>
          <p className="cw-meta">점수는 규칙 가중치의 합(최대 100)으로 정한 업무상 우선순위이며, 검증된 예측 확률이나 임상적 위험도가 아닙니다. 기준값은 lib/domain/rules/config.ts에서 관리합니다.</p>
        </Panel>
      </div>
    </>
  );
}
