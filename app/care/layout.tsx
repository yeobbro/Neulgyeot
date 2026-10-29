import type { ReactNode } from "react";
import { Shell, type NavItem } from "@/components/client/shell";
import { DemoBanner } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/domain/constants";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { listNotifications } from "@/lib/server/services/notifications";
import "./care.css";

export const metadata = { title: "늘곁 · 통합돌봄 워크스페이스" };

export default async function CareLayout({ children }: { children: ReactNode }) {
  const actor = await requirePageActor(["admin", "worker", "provider"]);
  const db = await getDb();
  const { unread } = await listNotifications(db, actor, { limit: 1 });

  let nav: NavItem[];
  if (actor.role === "provider") {
    nav = [
      { href: "/care/services?tab=referrals", label: "서비스 의뢰", icon: "⇄" },
      { href: "/care/notifications", label: "알림", icon: "◔", count: unread },
    ];
  } else {
    const [{ pending }] = await db.query<{ pending: number }>(
      `SELECT count(*)::int AS pending FROM risk_assessments a JOIN care_recipients r ON r.id = a.recipient_id
       WHERE a.review_status = 'pending' AND a.priority IN ('high','medium')
         AND a.created_at = (SELECT max(a2.created_at) FROM risk_assessments a2 WHERE a2.recipient_id = a.recipient_id)
         AND ${actor.role === "admin" ? "TRUE" : "r.region_id = ANY($1)"}`,
      actor.role === "admin" ? [] : [actor.scopeRegionIds ?? []],
    );
    nav = [
      { href: "/care", label: "지역 대시보드", icon: "⌂" },
      { href: "/care/map", label: "통합 돌봄 지도", icon: "⌖" },
      { href: "/care/recipients", label: "대상자·사례 관리", icon: "♙" },
      { href: "/care/signals", label: "위험 신호 분석", icon: "⌁", count: pending },
      { href: "/care/services", label: "서비스 매칭·연계", icon: "⇄" },
      { href: "/care/tasks", label: "후속 조치", icon: "☑" },
      { href: "/care/voice", label: "음성 기록", icon: "◉" },
      { href: "/care/reports", label: "성과 분석·보고서", icon: "▥" },
      { href: "/care/requests", label: "가족 문의", icon: "✉" },
      { href: "/care/notifications", label: "알림", icon: "◔", count: unread },
      ...(actor.role === "admin" ? [{ href: "/care/audit", label: "감사 로그", icon: "⚑" }] : []),
    ];
  }

  return (
    <Shell nav={nav} title="늘곁" user={{ name: actor.name, roleLabel: ROLE_LABEL[actor.role] }} unread={unread}>
      <DemoBanner />
      {children}
    </Shell>
  );
}
