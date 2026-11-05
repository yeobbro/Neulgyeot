"use client";

import { useMemo, useState } from "react";
import { CareStatusBadge } from "@/components/care/StatusBadge";
import { buildFamilyDashboard, FAMILY_ACCESS_TEXT, viewableResidents } from "@/lib/care/family";
import { dateRange, summaryToCsv } from "@/lib/care/timeline";
import { CARE_TYPE_LABEL, CARE_TYPES, type MunicipalCareStatus } from "@/lib/care/types";
import { CARE_DEMO_NOW, CARE_DEMO_TODAY, CARE_PLAN, GUARDIAN_ACCOUNTS, MUNICIPAL_LINKS, SEED_CARE_EVENTS, STAFF_ROLES } from "@/lib/demo/care-data";
import { PATIENTS } from "@/lib/demo/hospital-data";
import { formatKst } from "@/lib/demo/clock";

const MUNI_STEPS: MunicipalCareStatus[] = ["심사중", "승인", "개시", "종료"];

/**
 * 늘곁 패밀리 대시보드 (보호자용) — DEMO. A guardian signs in (simulated by choosing a demo guardian account) and sees only the
 * residents linked to that account with confirmed authority. Staff names are never shown, only roles.
 */
export function FamilyDashboardApp() {
  const [accountId, setAccountId] = useState(GUARDIAN_ACCOUNTS[0].guardian_account_id);
  const account = GUARDIAN_ACCOUNTS.find((a) => a.guardian_account_id === accountId)!;
  const allowed = viewableResidents(account);
  const [residentId, setResidentId] = useState<string>(account.links[0].resident_id);
  const rid = account.links.some((l) => l.resident_id === residentId) ? residentId : account.links[0].resident_id;
  const result = useMemo(
    () => buildFamilyDashboard(account, rid, { date: CARE_DEMO_TODAY, weekDates: dateRange("2026-10-28", 7), plan: CARE_PLAN, events: SEED_CARE_EVENTS, staffRoles: STAFF_ROLES, municipal: MUNICIPAL_LINKS, now: CARE_DEMO_NOW }),
    [account, rid]
  );
  const patient = PATIENTS.find((p) => p.id === rid);

  const download = () => {
    if (!result.ok) return;
    const csv = summaryToCsv(result.value.week, CARE_TYPE_LABEL, { includeStaff: false });
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `neulgyeot-family-weekly-DEMO.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="fam">
      <header className="fam-top">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/neulgyeot-mark.svg" alt="" />
          <span className="brand-name">늘곁 <span>패밀리</span></span>
        </div>
        <label className="fam-acct">
          <span className="sr-only">데모 보호자 계정</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {GUARDIAN_ACCOUNTS.map((a) => <option key={a.guardian_account_id} value={a.guardian_account_id}>{a.name} 보호자 (DEMO)</option>)}
          </select>
        </label>
      </header>
      <div className="demo-bar" role="note"><span><strong>DEMO</strong> · 합성 데이터입니다. 실제 환자 정보가 아니며 의료적 판단에 사용할 수 없습니다.</span></div>

      <main className="fam-main" id="main">
        {account.links.length > 1 && (
          <div className="care-seg" role="tablist">{account.links.map((l) => <button key={l.resident_id} role="tab" aria-selected={rid === l.resident_id} type="button" onClick={() => setResidentId(l.resident_id)}>{l.resident_id}</button>)}</div>
        )}
        {!result.ok ? (
          <section className="fam-card fam-denied" role="alert">
            <h1>열람할 수 없어요</h1>
            <p>{FAMILY_ACCESS_TEXT[result.error] ?? "열람 권한이 없어요."}</p>
            <p className="small muted">가족 관계만으로는 열람 권한이 생기지 않아요. 환자 지정 보호자 또는 법정대리인 확인이 필요해요.</p>
          </section>
        ) : (
          <>
            <section className="fam-card fam-hero">
              <div>
                <p className="small muted">{patient?.ward} · {patient?.room}호</p>
                <h1>{patient?.name} 님</h1>
                <p className="small">{formatKst(CARE_DEMO_NOW)} 기준 오늘의 케어</p>
              </div>
              <div className="fam-rings">
                <Stat label="수행 확인" value={result.value.todaySummary.done} />
                <Stat label="독립 검증" value={result.value.todaySummary.verified} />
                <Stat label="확인 대기" value={result.value.todaySummary.pending} />
                <Stat label="기록 누락" value={result.value.todaySummary.missing} warn />
              </div>
            </section>

            {result.value.notices.length > 0 && (
              <section className="fam-card" aria-labelledby="fam-n">
                <h2 id="fam-n">알림 센터</h2>
                <ul className="fam-notices">{result.value.notices.map((n) => <li key={n.id} className={n.kind}><span>{n.text}</span><small className="muted">{formatKst(n.at)}</small></li>)}</ul>
              </section>
            )}

            <section className="fam-card" aria-labelledby="fam-t">
              <h2 id="fam-t">오늘의 케어 타임라인</h2>
              <ol className="fam-tl">{result.value.today.map((i, k) => (
                <li key={k}><span className="t">{i.time}</span><span className="w">{i.label}{i.performerRole ? <small className="muted"> · {i.performerRole}</small> : null}</span><CareStatusBadge status={i.status} /></li>
              ))}</ol>
              <p className="small muted">‘수행 확인’은 담당 직원이 수행을 확인한 기록, ‘독립 검증’은 다른 간호사가 한 번 더 확인한 기록이에요.</p>
            </section>

            <section className="fam-card" aria-labelledby="fam-w">
              <div className="fam-row"><h2 id="fam-w">주간 활동 ({result.value.week.from} ~ {result.value.week.to})</h2><button type="button" className="btn btn-sm" onClick={download}>보고서 다운로드</button></div>
              <ul className="fam-bars">{CARE_TYPES.filter((c) => result.value.week.byCareType[c].planned).map((c) => {
                const r = result.value.week.byCareType[c];
                const pct = r.planned ? Math.round((r.fulfilled / r.planned) * 100) : 0;
                return <li key={c}><span>{CARE_TYPE_LABEL[c]}</span><span className="bar" role="img" aria-label={`${pct}%`}><i style={{ width: `${pct}%` }} /></span><span className="small">{r.fulfilled}/{r.planned}</span></li>;
              })}</ul>
            </section>

            <section className="fam-card" aria-labelledby="fam-m">
              <h2 id="fam-m">지자체 돌봄 연계 · 퇴원 후 돌봄</h2>
              {result.value.municipal.length === 0 ? <p className="muted">진행 중인 지자체 연계가 없어요.</p> : result.value.municipal.map((m) => (
                <div key={m.program} className="fam-muni">
                  <p><strong>{m.program}</strong> <span className={`badge ${m.status === "보완 필요" ? "amber" : m.status === "종료" ? "" : "blue"}`}>{m.status}</span></p>
                  <ol className="fam-steps">{MUNI_STEPS.map((s) => <li key={s} className={MUNI_STEPS.indexOf(s) <= MUNI_STEPS.indexOf(m.status === "보완 필요" ? "심사중" : m.status) ? "on" : ""}>{s}</li>)}</ol>
                  {m.note && <p className="small">{m.note}</p>}
                  <p className="small muted">업데이트 {formatKst(m.updated_at)}</p>
                </div>
              ))}
            </section>
          </>
        )}
        {allowed.length === 0 && result.ok === false ? null : null}
      </main>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return <div className={`fam-stat ${warn && value ? "warn" : ""}`}><strong>{value}</strong><span className="small">{label}</span></div>;
}
