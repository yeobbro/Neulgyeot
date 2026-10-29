import Link from "next/link";
import { MarkReadButton } from "@/components/client/forms";
import { Badge, Empty, Heading, Panel } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { listNotifications, syncTaskDueNotifications } from "@/lib/server/services/notifications";

export default async function NotificationsPage() {
  const actor = await requirePageActor(["admin", "worker", "provider"]);
  const db = await getDb();
  if (actor.role !== "provider") await syncTaskDueNotifications(db);
  const { data, unread } = await listNotifications(db, actor, { limit: 100 });
  return (
    <>
      <Heading kicker="Notifications" title="알림 센터" actions={unread > 0 ? <MarkReadButton ids="all" /> : undefined}>
        앱 안 알림만 제공합니다. 이메일·문자·푸시는 연결되어 있지 않으며, 외부로 보낸 것으로 표시하지 않습니다.
      </Heading>
      <Panel title={`알림 ${data.length}건`} hint={`읽지 않음 ${unread}건`}>
        {data.length === 0 ? <Empty>알림이 없습니다.</Empty> : (
          <ul className="cw-list">
            {data.map((n) => (
              <li key={n.id} style={n.readAt ? { opacity: 0.75 } : undefined}>
                <div className="cw-actions" style={{ justifyContent: "space-between" }}>
                  <b>{n.readAt ? "" : "● "}{n.title}</b>
                  <span className="cw-actions"><Badge tone="neutral">앱 내 알림</Badge>{!n.readAt && <MarkReadButton ids={[n.id]} />}</span>
                </div>
                <p style={{ margin: "4px 0" }}>{n.message}</p>
                <div className="cw-meta"><span>{fmtDateTime(n.createdAt)}</span>{n.link && <Link href={n.link}>바로가기</Link>}</div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
