"use client";

import { DEMO_FACILITY, DEMO_STAFF } from "@/lib/demo/hospital-data";
import type { View } from "@/lib/state/hospital-store";
import { useHospital } from "./HospitalContext";

const NAV: { view: View; label: string }[] = [
  { view: "summary", label: "환자 요약" },
  { view: "ward", label: "병동 현황" },
  { view: "records", label: "진료·간호 기록" },
  { view: "medication", label: "투약 요약" },
  { view: "discharge", label: "퇴원·지역연계" },
  { view: "family", label: "보호자 리포트" },
  { view: "alerts", label: "알림" }
];

export function TopNav({ noticeCount }: { noticeCount: number }) {
  const { state, dispatch } = useHospital();
  return (
    <header className="topbar">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/neulgyeot-mark.svg" alt="" />
        <span className="brand-name">
          늘곁 <span>CareLink</span> EMR
        </span>
        <span className="brand-sub">요양병원용</span>
      </div>
      <nav className="mainnav" aria-label="주 메뉴">
        {NAV.map((n) => (
          <button
            key={n.view}
            type="button"
            aria-current={state.view === n.view ? "page" : undefined}
            onClick={() => dispatch({ type: "setView", view: n.view })}
          >
            {n.label}
            {n.view === "alerts" && noticeCount > 0 ? (
              <span className="count" aria-label={`확인 필요 ${noticeCount}건`}>{noticeCount}</span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        <span className="facility">
          {DEMO_FACILITY.name} · {DEMO_FACILITY.today}
        </span>
        <span className="badge demo">DEMO</span>
        <span className="user">
          <span className="user-avatar" aria-hidden="true">정</span>
          <span className="user-name">
            {DEMO_STAFF.currentUser.name}
            <small>{DEMO_STAFF.currentUser.role}</small>
          </span>
        </span>
      </div>
    </header>
  );
}
