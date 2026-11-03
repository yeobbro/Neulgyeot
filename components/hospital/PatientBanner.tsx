"use client";

import { DEMO_FACILITY } from "@/lib/demo/hospital-data";
import { ageAt, daysBetween } from "@/lib/hospital/derive";
import { Avatar, Badge } from "@/components/ui/primitives";
import { STATUS_TONE } from "./PatientList";
import { useHospital } from "./HospitalContext";

export function PatientBanner({ right }: { right?: React.ReactNode }) {
  const { patient: p } = useHospital();
  const principal = p.diagnoses.find((d) => d.principal);
  return (
    <section className="panel pbanner" aria-label="선택된 환자">
      <Avatar initials={p.initials} large />
      <div>
        <div className="pbanner-name">
          <h1>{p.name}</h1>
          <span className="muted">
            {p.gender} / 만 {ageAt(p.birthDate, DEMO_FACILITY.today)}세
          </span>
          <span className="mono muted">{p.id}</span>
          <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
          <Badge tone="demo">합성 데이터</Badge>
        </div>
        <div className="pbanner-facts">
          <span><b>병동</b>{p.ward} {p.room}호 {p.bed}번 침상</span>
          <span><b>주치의</b>{p.physician}</span>
          <span><b>입원</b>{p.admissionDate} (재원 {daysBetween(p.admissionDate, DEMO_FACILITY.today)}일)</span>
          <span><b>퇴원 예정</b>{p.discharge.plannedDate ?? "미정"}</span>
          {principal ? <span><b>주진단</b><span className="mono">{principal.code}</span></span> : null}
        </div>
      </div>
      <div>{right}</div>
    </section>
  );
}
