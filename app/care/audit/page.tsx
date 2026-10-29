import { Empty, Heading, Pagination, Panel } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { readParams, type SearchParams } from "@/lib/server/page";

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageActor(["admin"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const page = Math.max(1, Number(p.page) || 1);
  const pageSize = 50;
  const [{ total }] = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM audit_logs`);
  const rows = await db.query<{ id: number; action: string; entity_type: string; entity_id: string; metadata: Record<string, unknown>; created_at: Date; actor_name: string | null }>(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.metadata, l.created_at, u.name AS actor_name FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.created_at DESC, l.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  );
  return (
    <>
      <Heading kicker="Audit" title="감사 로그">권한 변경·기록 수정·상태 변경을 남깁니다. 기록 본문 같은 민감한 서술은 저장하지 않고 필드 이름과 상태값만 남깁니다.</Heading>
      <Panel title="최근 이벤트">
        {rows.length === 0 ? <Empty>로그가 없습니다.</Empty> : (
          <div className="cw-table-wrap">
            <table className="cw-table">
              <thead><tr><th>시각</th><th>행위자</th><th>동작</th><th>대상</th><th>메타데이터</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id}><td>{fmtDateTime(r.created_at.toISOString())}</td><td>{r.actor_name ?? "시스템"}</td><td>{r.action}</td><td>{r.entity_type} {r.entity_id}</td><td><code style={{ fontSize: 12 }}>{JSON.stringify(r.metadata)}</code></td></tr>)}</tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / pageSize))} total={total} base="/care/audit" params={{}} />
      </Panel>
    </>
  );
}
