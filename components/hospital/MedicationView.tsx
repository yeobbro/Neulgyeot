"use client";

import { Badge, Panel } from "@/components/ui/primitives";
import { useHospital } from "./HospitalContext";
import { PatientBanner } from "./PatientBanner";

export function MedicationView() {
  const { patient: p, patients, dispatch } = useHospital();
  const missing = patients.flatMap((x) => x.medications.filter((m) => m.todayRecord === "기록 없음").map((m) => ({ patient: x, med: m })));

  return (
    <>
      <PatientBanner />
      <div className="notice info" role="note">
        투약 요약은 현재 처방 목록과 오늘 투약 기록의 <strong>입력 여부</strong>만 표시합니다. 처방 변경·용량 판단 기능은 제공하지 않습니다.
      </div>
      <Panel title="현재 투약 목록" id="meds" flush actions={<Badge tone="demo">합성 데이터</Badge>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>약품명</th>
                <th>용량</th>
                <th>경로</th>
                <th>투여 빈도</th>
                <th>시작일</th>
                <th>오늘 투약 기록</th>
              </tr>
            </thead>
            <tbody>
              {p.medications.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.dose}</td>
                  <td>{m.route}</td>
                  <td>{m.frequency}</td>
                  <td>{m.startedAt}</td>
                  <td>
                    <Badge tone={m.todayRecord === "투약 기록 완료" ? "green" : m.todayRecord === "기록 없음" ? "amber" : "outline"}>{m.todayRecord}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="병원 전체 · 오늘 투약 기록 확인 필요" id="meds-missing" flush>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>환자</th>
                <th>병실</th>
                <th>약품</th>
                <th>투여 빈도</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {missing.map(({ patient, med }) => (
                <tr key={`${patient.id}-${med.id}`}>
                  <td>{patient.name} <span className="mono muted">{patient.id}</span></td>
                  <td>{patient.ward} {patient.room}-{patient.bed}</td>
                  <td>{med.name}</td>
                  <td>{med.frequency}</td>
                  <td><Badge tone="amber">기록 없음</Badge></td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => dispatch({ type: "selectPatient", patientId: patient.id })}>
                      환자 선택
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ padding: "6px 12px 10px" }}>예정 시각 이전이거나 필요 시 투약 항목일 수 있습니다. 기록 입력 여부만 확인합니다.</p>
      </Panel>
    </>
  );
}
