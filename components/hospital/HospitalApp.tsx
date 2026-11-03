"use client";

import { useMemo, useReducer } from "react";
import { PATIENTS } from "@/lib/demo/hospital-data";
import { reviewNotices } from "@/lib/hospital/alerts";
import { hospitalReducer, initialState } from "@/lib/state/hospital-store";
import { HospitalContext } from "./HospitalContext";
import { TopNav } from "./TopNav";
import { PatientList } from "./PatientList";
import { SummaryView } from "./SummaryView";
import { MonitoringPanel } from "./MonitoringPanel";
import { WardView } from "./WardView";
import { RecordsView } from "./RecordsView";
import { MedicationView } from "./MedicationView";
import { AlertsView } from "./AlertsView";
import { DischargeWorkspace } from "@/components/discharge/DischargeWorkspace";
import { FamilyReportWorkspace } from "@/components/family/FamilyReportWorkspace";

export function HospitalApp() {
  const [state, dispatch] = useReducer(hospitalReducer, undefined, () => initialState(PATIENTS));
  const patient = PATIENTS.find((p) => p.id === state.selectedPatientId) ?? PATIENTS[0];
  const notices = useMemo(() => reviewNotices(PATIENTS, state), [state]);
  const value = useMemo(() => ({ state, dispatch, patients: PATIENTS, patient }), [state, patient]);
  const withSide = state.view === "summary";

  return (
    <HospitalContext.Provider value={value}>
      <div className="app">
        <a className="sr-only" href="#main">본문 바로가기</a>
        <TopNav noticeCount={notices.length} />
        <div className="demo-bar" role="note">
          <span><strong>DEMO</strong> · 모든 환자·직원·기록은 합성(가상) 데이터입니다. 실제 진료·간호 판단에 사용할 수 없습니다.</span>
          <span>활력징후는 수기 입력 기록의 고정 예시값이며 의료기기와 실시간 연결되어 있지 않습니다.</span>
        </div>
        <div className={`workspace ${withSide ? "with-side" : ""}`}>
          {state.view === "ward" ? null : <PatientList />}
          <div className="content" style={state.view === "ward" ? { gridColumn: "1 / -1" } : undefined}>
            <main id="main" className="col col-center">
              {state.view === "summary" && <SummaryView />}
              {state.view === "ward" && <WardView />}
              {state.view === "records" && <RecordsView />}
              {state.view === "medication" && <MedicationView />}
              {state.view === "discharge" && <DischargeWorkspace />}
              {state.view === "family" && <FamilyReportWorkspace />}
              {state.view === "alerts" && <AlertsView notices={notices} />}
            </main>
            {withSide && <MonitoringPanel />}
          </div>
        </div>
      </div>
    </HospitalContext.Provider>
  );
}
