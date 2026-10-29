import Link from "next/link";
import type { ReactNode } from "react";
import {
  CARE_STATUS_LABEL,
  PRIORITY_LABEL,
  REFERRAL_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
  SUPPORT_REQUEST_STATUS_LABEL,
  TASK_STATUS_LABEL,
  type CareStatus,
  type ReferralStatus,
  type ReviewStatus,
  type SupportRequestStatus,
  type TaskStatus,
} from "@/lib/domain/constants";
import { qs } from "@/lib/format";

type Tone = "high" | "mid" | "low" | "ok" | "neutral" | "ai" | "demo";

export function Badge({ tone, icon, children, title }: { tone: Tone; icon?: string; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone}`} data-icon={icon ?? ""} title={title}>
      {children}
    </span>
  );
}

const PRIORITY_TONE = { high: ["high", "▲"], medium: ["mid", "●"], low: ["low", "○"], none: ["neutral", "–"] } as const;
/** Work-priority band. Explicitly not a probability or clinical risk. */
export function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" | "none" | null }) {
  if (!priority) return <Badge tone="neutral">분석 없음</Badge>;
  const [tone, icon] = PRIORITY_TONE[priority];
  return (
    <Badge tone={tone} icon={icon} title="업무상 확인 우선순위 (예측 확률이 아님)">
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

const CARE_TONE: Record<CareStatus, [Tone, string]> = { active: ["ok", "✓"], monitoring: ["low", "◐"], needs_review: ["mid", "!"], closed: ["neutral", "×"] };
export const CareStatusBadge = ({ status }: { status: CareStatus }) => <Badge tone={CARE_TONE[status][0]} icon={CARE_TONE[status][1]}>{CARE_STATUS_LABEL[status]}</Badge>;

const TASK_TONE: Record<TaskStatus, [Tone, string]> = { open: ["mid", "●"], in_progress: ["low", "▶"], waiting: ["neutral", "⏸"], completed: ["ok", "✓"], cancelled: ["neutral", "×"] };
export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => <Badge tone={TASK_TONE[status][0]} icon={TASK_TONE[status][1]}>{TASK_STATUS_LABEL[status]}</Badge>;

const REF_TONE: Record<ReferralStatus, [Tone, string]> = {
  requested: ["low", "→"], received: ["low", "✓"], in_progress: ["low", "▶"], in_service: ["ok", "✓"],
  suspended: ["mid", "⏸"], completed: ["neutral", "■"], failed: ["high", "!"], cancelled: ["neutral", "×"],
};
export const ReferralStatusBadge = ({ status }: { status: ReferralStatus }) => <Badge tone={REF_TONE[status][0]} icon={REF_TONE[status][1]}>{REFERRAL_STATUS_LABEL[status]}</Badge>;

const REVIEW_TONE: Record<ReviewStatus, [Tone, string]> = { pending: ["mid", "?"], accepted: ["ok", "✓"], modified: ["ok", "✎"], dismissed: ["neutral", "×"] };
export const ReviewBadge = ({ status }: { status: ReviewStatus }) => <Badge tone={REVIEW_TONE[status][0]} icon={REVIEW_TONE[status][1]}>{REVIEW_STATUS_LABEL[status]}</Badge>;

const REQ_TONE: Record<SupportRequestStatus, [Tone, string]> = { received: ["mid", "●"], in_progress: ["low", "▶"], answered: ["ok", "✓"], closed: ["neutral", "■"] };
export const RequestStatusBadge = ({ status }: { status: SupportRequestStatus }) => <Badge tone={REQ_TONE[status][0]} icon={REQ_TONE[status][1]}>{SUPPORT_REQUEST_STATUS_LABEL[status]}</Badge>;

export const DemoBadge = () => <Badge tone="demo" icon="◇">가상 데이터</Badge>;
export const InferenceBadge = ({ label = "AI·규칙 추론" }: { label?: string }) => <Badge tone="ai" icon="✦">{label}</Badge>;

export function DemoBanner() {
  return (
    <div className="cw-demo" role="note">
      <b>DEMO · 가상 데이터</b>
      <span>
        모든 인물·지역(늘봄시)·기관·연락처·수치는 시연용으로 만든 것입니다. 실제 돌봄 판단이나 성과 지표로 사용할 수 없습니다.
      </span>
    </div>
  );
}

export function Heading({ kicker, title, children, actions }: { kicker?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="cw-heading">
      <div>
        {kicker && <div className="cw-kicker">{kicker}</div>}
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="cw-actions">{actions}</div>}
    </div>
  );
}

export function Panel({ title, hint, children, actions, id }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section className="cw-panel" id={id} aria-label={typeof title === "string" ? title : undefined}>
      {(title || actions) && (
        <h3>
          {title}
          {hint && <span className="hint">{hint}</span>}
          {actions && <span style={{ marginLeft: "auto" }}>{actions}</span>}
        </h3>
      )}
      {children}
    </section>
  );
}

export function Metric({ label, value, unit, note, href }: { label: string; value: string | number; unit?: string; note?: string; href?: string }) {
  const body = (
    <>
      <span>{label}</span>
      <strong>
        {value}
        {unit && <small>{unit}</small>}
      </strong>
      {note && <p>{note}</p>}
    </>
  );
  return href ? (
    <Link className="cw-metric" href={href}>
      {body}
    </Link>
  ) : (
    <div className="cw-metric">{body}</div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="cw-empty">{children}</div>;
}

export function Pagination({ page, totalPages, total, base, params }: { page: number; totalPages: number; total: number; base: string; params: Record<string, string | undefined> }) {
  return (
    <nav className="cw-pagination" aria-label="페이지">
      <span>
        총 {total}건 · {page}/{totalPages}쪽
      </span>
      {page > 1 ? <Link className="btn btn-outline btn-sm" href={`${base}${qs({ ...params, page: page - 1 })}`}>이전</Link> : <span className="btn btn-outline btn-sm" aria-disabled="true">이전</span>}
      {page < totalPages ? <Link className="btn btn-outline btn-sm" href={`${base}${qs({ ...params, page: page + 1 })}`}>다음</Link> : <span className="btn btn-outline btn-sm" aria-disabled="true">다음</span>}
    </nav>
  );
}

/** Tab links driven by a query param so state survives reloads and links. */
export function Tabs({ tabs, current, base, params = {} }: { tabs: { id: string; label: string }[]; current: string; base: string; params?: Record<string, string | undefined> }) {
  return (
    <nav className="cw-tabs" aria-label="보기 전환">
      {tabs.map((t) => (
        <Link key={t.id} href={`${base}${qs({ ...params, tab: t.id })}`} aria-current={current === t.id ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
