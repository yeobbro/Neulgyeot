"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { WARDS, DEMO_FACILITY } from "@/lib/demo/hospital-data";
import { ageAt } from "@/lib/hospital/derive";
import type { AdmissionStatus, WardId } from "@/lib/hospital/types";
import { Avatar, Badge, type Tone } from "@/components/ui/primitives";
import { useHospital } from "./HospitalContext";

export const STATUS_TONE: Record<AdmissionStatus, Tone> = { 재원: "blue", "퇴원 예정": "teal", "외출·외박": "outline" };

export function PatientList() {
  const { patients, state, dispatch } = useHospital();
  const [query, setQuery] = useState("");
  const [ward, setWard] = useState<WardId | "all">("all");
  const [status, setStatus] = useState<AdmissionStatus | "all">("all");
  const [dischargeOnly, setDischargeOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients.filter(
      (p) =>
        (ward === "all" || p.ward === ward) &&
        (status === "all" || p.status === status) &&
        (!dischargeOnly || p.discharge.plannedDate !== null) &&
        (!q || p.name.includes(q) || p.id.toLowerCase().includes(q) || `${p.room}-${p.bed}`.includes(q))
    );
  }, [patients, query, ward, status, dischargeOnly]);

  const select = (id: string) => dispatch({ type: "selectPatient", patientId: id });

  const onKey = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(filtered.length - 1, Math.max(0, index + (e.key === "ArrowDown" ? 1 : -1)));
      const el = listRef.current?.querySelectorAll<HTMLLIElement>("[role=option]")[next];
      el?.focus();
      select(filtered[next].id);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(filtered[index].id);
    }
  };

  const selected = patients.find((p) => p.id === state.selectedPatientId);

  return (
    <aside className={`plist col ${collapsed ? "collapsed" : ""}`} aria-label="환자 목록">
      <div className="plist-head">
        <div className="plist-title">
          <span>
            환자 목록 <span className="muted small">({filtered.length}/{patients.length})</span>
          </span>
          <Badge tone="demo">가상 환자</Badge>
        </div>
        <button
          type="button"
          className="btn btn-sm plist-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? `환자 목록 열기 · 선택: ${selected?.name ?? "-"}` : "환자 목록 접기"}
        </button>
        <div className="plist-search">
          <label className="sr-only" htmlFor="pl-search">환자 검색</label>
          <input
            id="pl-search"
            className="input"
            type="search"
            placeholder="이름, 환자 ID, 병실 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="plist-filters">
          <div>
            <label className="sr-only" htmlFor="pl-ward">병동</label>
            <select id="pl-ward" className="select" value={ward} onChange={(e) => setWard(e.target.value as WardId | "all")}>
              <option value="all">전체 병동</option>
              {WARDS.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="sr-only" htmlFor="pl-status">입원 상태</label>
            <select id="pl-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as AdmissionStatus | "all")}>
              <option value="all">전체 상태</option>
              <option value="재원">재원</option>
              <option value="퇴원 예정">퇴원 예정</option>
              <option value="외출·외박">외출·외박</option>
            </select>
          </div>
          <label className="check" style={{ gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={dischargeOnly} onChange={(e) => setDischargeOnly(e.target.checked)} />
            퇴원 계획 있는 환자만
          </label>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="plist-empty">조건에 맞는 환자가 없습니다.</p>
      ) : (
        <ul className="plist-items" role="listbox" aria-label="환자 선택" ref={listRef}>
          {filtered.map((p, i) => {
            const isSel = p.id === state.selectedPatientId;
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={isSel}
                tabIndex={isSel || (i === 0 && !filtered.some((f) => f.id === state.selectedPatientId)) ? 0 : -1}
                className="plist-item"
                onClick={() => select(p.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <Avatar initials={p.initials} />
                <span>
                  <span className="plist-name">{p.name}</span>{" "}
                  <span className="plist-meta">
                    {p.gender}/{ageAt(p.birthDate, DEMO_FACILITY.today)}
                  </span>
                  <span className="plist-meta" style={{ display: "block" }}>
                    {p.id} · {p.ward} {p.room}-{p.bed}
                  </span>
                </span>
                <span style={{ display: "grid", gap: 2, justifyItems: "end" }}>
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  {p.discharge.plannedDate ? <span className="plist-meta">{p.discharge.plannedDate.slice(5).replace("-", "/")} 퇴원</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="plist-foot">↑↓ 키로 환자 이동 · 합성 데이터</div>
    </aside>
  );
}
