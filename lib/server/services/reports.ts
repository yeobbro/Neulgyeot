import { z } from "zod";
import { SERVICE_TYPE_LABEL, TASK_STATUS_LABEL } from "../../domain/constants";
import type { ReportNarrative, ReportStats } from "../../domain/report-template";
import { draftNarrative } from "../ai/report";
import { audit } from "../audit";
import { requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { nextId } from "../db/ids";
import { notFound } from "../errors";
import { analyticsSummary } from "./analytics";

export const generateReportSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    regionId: z.string().optional(),
  })
  .strict();

export type Report = {
  id: string;
  periodStart: string;
  periodEnd: string;
  regionId: string | null;
  stats: ReportStats;
  narrative: ReportNarrative;
  narrativeMethod: "ai" | "template";
  validation: Record<string, unknown>;
  isDemoData: boolean;
  createdByName: string | null;
  createdAt: string;
};

export async function generateReport(db: Db, actor: Actor, input: z.infer<typeof generateReportSchema>) {
  requireRole(actor, ["admin", "worker"]);
  const stats = await analyticsSummary(db, actor, { from: input.from, to: input.to, regionId: input.regionId });
  const { resourcesByType: _resources, ...reportStats } = stats;
  void _resources;
  const narrative = await draftNarrative(reportStats);
  const id = await db.transaction(async (tx) => {
    const id = await nextId(tx, "RPT");
    await tx.query(
      `INSERT INTO reports (id, period_start, period_end, region_id, stats, narrative, narrative_method, validation, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, input.from, input.to, input.regionId ?? null, JSON.stringify(stats), JSON.stringify(narrative.narrative), narrative.method, JSON.stringify(narrative.validation), actor.id],
    );
    await audit(tx, { actorId: actor.id, action: "report.generated", entityType: "report", entityId: id, metadata: { method: narrative.method, aiStatus: narrative.validation.aiStatus } });
    return id;
  });
  return getReport(db, actor, id);
}

export async function getReport(db: Db, actor: Actor, id: string): Promise<Report> {
  requireRole(actor, ["admin", "worker"]);
  const [r] = await db.query<{
    id: string;
    period_start: string | Date;
    period_end: string | Date;
    region_id: string | null;
    stats: ReportStats;
    narrative: ReportNarrative;
    narrative_method: "ai" | "template";
    validation: Record<string, unknown>;
    is_demo_data: boolean;
    created_by: string | null;
    name: string | null;
    created_at: Date;
  }>(`SELECT rp.*, u.name FROM reports rp LEFT JOIN users u ON u.id = rp.created_by WHERE rp.id = $1`, [id]);
  if (!r) throw notFound("보고서");
  // Workers can only open reports they generated (scoped to their region at generation time).
  if (actor.role === "worker" && r.created_by !== actor.id) throw notFound("보고서");
  const day = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  return {
    id: r.id,
    periodStart: day(r.period_start),
    periodEnd: day(r.period_end),
    regionId: r.region_id,
    stats: r.stats,
    narrative: r.narrative,
    narrativeMethod: r.narrative_method,
    validation: r.validation,
    isDemoData: r.is_demo_data,
    createdByName: r.name,
    createdAt: r.created_at.toISOString(),
  };
}

export async function listReports(db: Db, actor: Actor) {
  requireRole(actor, ["admin", "worker"]);
  const params: unknown[] = [];
  const where = actor.role === "admin" ? "TRUE" : (params.push(actor.id), `rp.created_by = $1`);
  return db.query<{ id: string; period_start: string; period_end: string; region_id: string | null; narrative_method: string; created_at: Date }>(
    `SELECT rp.id, rp.period_start::text, rp.period_end::text, rp.region_id, rp.narrative_method, rp.created_at FROM reports rp WHERE ${where} ORDER BY rp.created_at DESC LIMIT 20`,
    params,
  );
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote and neutralize spreadsheet formula prefixes.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function reportToCsv(r: Report): string {
  const s = r.stats;
  const rows: unknown[][] = [
    ["늘곁 돌봄 운영 보고서", r.id],
    ["데이터 구분", r.isDemoData ? "시연용 가상 데이터" : "실데이터"],
    ["기준 기간", `${r.periodStart} ~ ${r.periodEnd}`],
    ["대상 지역", s.regionName],
    ["생성 시각", r.createdAt],
    ["서술 방식", r.narrativeMethod === "ai" ? "AI 초안 (수치 검증 통과)" : "템플릿"],
    [],
    ["지표", "값", "정의"],
    ["등록 돌봄 대상자", s.recipients, "종결되지 않았고 기간 종료 전 등록된 대상자"],
    ["확인 필요 사례", s.needsReview, "최신 분석이 우선 확인/확인 권장이며 검토 대기"],
    ["서비스 미연계 사례", s.unconnected, "등록된 필요 지원 중 진행 중인 연계가 없는 유형이 1개 이상"],
    ["미완료 조치", s.openTasks, "신규·진행 중·대기 상태 조치 (현재 시점)"],
    ["기간 생성 조치", s.tasksCreated, "기간 중 생성된 조치"],
    ["기간 생성 조치 중 완료", s.tasksCompleted, "위 조치 중 기간 종료 전 완료"],
    ["조치 완료율(%)", s.completionRate ?? "산출 불가", "완료 ÷ 기간 생성 조치"],
    ["평균 조치 소요(일)", s.avgResolutionDays ?? "산출 불가", "기간 중 완료된 조치의 생성→완료 평균"],
    [],
    ["지역", "대상자", "미연계", "확인 필요", "미완료 조치"],
    ...s.byRegion.map((g) => [g.regionName, g.recipients, g.unconnected, g.needsReview, g.openTasks]),
    [],
    ["서비스 유형", "진행 중 연계", "기간 내 연계 실패", "현재 중단"],
    ...s.referralsByType.map((t) => [SERVICE_TYPE_LABEL[t.serviceType], t.active, t.failed, t.suspended]),
    [],
    ["조치 상태(기간 생성분)", "건수"],
    ...s.tasksByStatus.map((t) => [TASK_STATUS_LABEL[t.status], t.count]),
  ];
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
