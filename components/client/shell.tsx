"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export type NavItem = { href: string; label: string; icon: string; count?: number };

export function Shell({ nav, title, user, unread, children }: { nav: NavItem[]; title: string; user: { name: string; roleLabel: string }; unread: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = (href: string) => {
    const path = href.split("?")[0];
    return path === "/care" ? pathname === "/care" : pathname.startsWith(path);
  };
  const current = nav.find((n) => active(n.href));
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="cw">
      <aside className={`cw-rail${open ? " open" : ""}`} aria-label="주요 메뉴">
        <Link className="cw-brand" href="/care" onClick={() => setOpen(false)}>
          <span className="cw-mark" aria-hidden="true">늘</span>
          <span>
            <b>늘곁</b>
            <small>지역사회 통합돌봄</small>
          </span>
        </Link>
        <nav className="cw-nav">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} onClick={() => setOpen(false)}>
              <span aria-hidden="true">{n.icon}</span>
              {n.label}
              {n.count ? <span className="nav-count" aria-label={`${n.count}건`}>{n.count}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="cw-rail-note">
          <b>사람이 판단합니다</b>
          분석 결과와 추천은 확인을 돕는 참고 정보입니다. 진단·자격 판정·긴급 판단을 하지 않으며, 최종 결정은 담당자가 합니다.
        </div>
        <div className="cw-user">
          <span>
            {user.name}
            <br />
            <small>{user.roleLabel} · 가상 계정</small>
          </span>
          <button type="button" onClick={logout}>로그아웃</button>
        </div>
      </aside>
      <div className="cw-main">
        <header className="cw-top">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" className="btn btn-outline btn-sm cw-menu-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              메뉴
            </button>
            <h1>{current?.label ?? title}</h1>
          </div>
          <div className="cw-top-tools">
            <Link className="cw-bell" href="/care/notifications">
              알림 {unread > 0 && <b aria-label={`읽지 않은 알림 ${unread}건`}>{unread}</b>}
            </Link>
          </div>
        </header>
        <main className="cw-content" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}
