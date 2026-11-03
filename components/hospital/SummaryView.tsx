"use client";

import { DEMO_FACILITY } from "@/lib/demo/hospital-data";
import { ageAt, formatDateTime, latestKAdl, morseBand, previousKAdl } from "@/lib/hospital/derive";
import { K_ADL_LABEL, type KAdlLevel } from "@/lib/hospital/types";
import { Badge, KV, Panel } from "@/components/ui/primitives";
import { useHospital } from "./HospitalContext";
import { PatientBanner } from "./PatientBanner";

function AdlRow({ label, level, prev }: { label: string; level: KAdlLevel; prev?: KAdlLevel }) {
  // Visual: more filled = more independent (3 = 자립).
  const filled = 4 - level;
  return (
    <div className="adl">
      <span>{label}</span>
      <span className="adl-scale" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={i <= filled ? "on" : ""} />
        ))}
      </span>
      <span>
        {K_ADL_LABEL[level]}
        {prev && prev !== level ? <span className="muted small"> (이전 {K_ADL_LABEL[prev]})</span> : null}
      </span>
    </div>
  );
}

export function SummaryView() {
  const { patient: p, dispatch } = useHospital();
  const adl = latestKAdl(p);
  const prev = previousKAdl(p);
  const notes = [...p.notes].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);

  return (
    <>
      <PatientBanner
        right={
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: "setView", view: "discharge" })}>
            퇴원·지역연계 →
          </button>
        }
      />

      <div className="grid-2">
        <Panel title="환자 기본 정보" id="p-info">
          <KV
            items={[
              ["환자 ID", <span key="id" className="mono">{p.id}</span>],
              ["성명", p.name],
              ["생년월일", `${p.birthDate} (만 ${ageAt(p.birthDate, DEMO_FACILITY.today)}세)`],
              ["성별", p.gender],
              ["병동/병실/침상", `${p.ward} · ${p.room}호 · ${p.bed}번`],
              ["주치의", p.physician],
              ["담당 간호사", p.primaryNurse],
              ["입원일", p.admissionDate],
              ["퇴원 예정일", p.discharge.plannedDate ?? "미정"],
              ["입원 상태", p.status]
            ]}
          />
        </Panel>

        <Panel title="진단 목록 (KCD)" id="p-dx" actions={<span className="hint">기록된 코드만 표시 · 해석하지 않음</span>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>구분</th>
                  <th>코드</th>
                  <th>진단명</th>
                </tr>
              </thead>
              <tbody>
                {p.diagnoses.map((d) => (
                  <tr key={d.code}>
                    <td>{d.principal ? <Badge tone="blue">주진단</Badge> : <span className="muted">부진단</span>}</td>
                    <td className="mono">{d.code}</td>
                    <td>{d.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <hr className="divider" />
          <p className="subhead">현재 기능 상태 기록</p>
          <p>{p.functionalNote}</p>
        </Panel>
      </div>

      <div className="grid-3">
        <Panel title="K-ADL 기능 평가" id="p-adl" actions={adl ? <span className="hint">{adl.assessedAt}</span> : null}>
          {adl ? (
            <>
              <AdlRow label="식사" level={adl.eating} prev={prev?.eating} />
              <AdlRow label="이동" level={adl.mobility} prev={prev?.mobility} />
              <AdlRow label="화장실 사용" level={adl.toileting} prev={prev?.toileting} />
              <p className="hint" style={{ marginTop: 6 }}>평가자 {adl.assessedBy} · 1 자립 / 2 부분 도움 / 3 완전 도움</p>
            </>
          ) : (
            <p className="muted">기록 없음</p>
          )}
        </Panel>
        <Panel title="인지 평가" id="p-cog">
          <KV
            items={[
              ["평가 도구", p.cognition.tool],
              [
                "기록 점수",
                p.cognition.score === null ? <Badge key="c" tone="amber">기록 없음</Badge> : `${p.cognition.score} / ${p.cognition.max}`
              ],
              ["평가일", p.cognition.assessedAt ?? "—"]
            ]}
          />
          <p className="hint" style={{ marginTop: 6 }}>점수는 기록값이며 시스템이 진단적 해석을 하지 않습니다.</p>
        </Panel>
        <Panel title="낙상 위험 평가" id="p-fall">
          <KV
            items={[
              ["평가 도구", p.fallRisk.tool],
              ["기록 점수", p.fallRisk.score ?? "기록 없음"],
              ["도구 구간", <Badge key="f" tone={morseBand(p.fallRisk.score) === "높음 구간" ? "amber" : "outline"}>{morseBand(p.fallRisk.score)}</Badge>],
              ["평가일", p.fallRisk.assessedAt ?? "—"]
            ]}
          />
        </Panel>
      </div>

      <div className="grid-2">
        <Panel
          title="투약 요약"
          id="p-med"
          actions={
            <button type="button" className="btn-link" onClick={() => dispatch({ type: "setView", view: "medication" })}>
              전체 보기
            </button>
          }
          flush
        >
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>약품</th>
                  <th>용량</th>
                  <th>경로</th>
                  <th>투여</th>
                  <th>오늘 기록</th>
                </tr>
              </thead>
              <tbody>
                {p.medications.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="nowrap">{m.dose}</td>
                    <td>{m.route}</td>
                    <td>{m.frequency}</td>
                    <td>
                      <Badge tone={m.todayRecord === "투약 기록 완료" ? "green" : m.todayRecord === "기록 없음" ? "amber" : "outline"}>
                        {m.todayRecord}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="최근 간호·돌봄 기록"
          id="p-notes"
          actions={
            <button type="button" className="btn-link" onClick={() => dispatch({ type: "setView", view: "records" })}>
              전체 기록
            </button>
          }
          flush
        >
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>구분</th>
                  <th>내용</th>
                  <th>작성</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((n) => (
                  <tr key={n.id}>
                    <td className="nowrap">{formatDateTime(n.at)}</td>
                    <td><Badge tone="outline">{n.type}</Badge></td>
                    <td>{n.text}</td>
                    <td className="nowrap">{n.author}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
