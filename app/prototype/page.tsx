"use client";

import { useMemo, useState } from "react";

type Setting = "facility" | "community";
type View = "overview" | "signals" | "records" | "about";
type Signal = {
  id: string; name: string; setting: Setting; place: string; domain: string;
  title: string; summary: string; value: string; baseline: string; delta: string;
  status: "확인 권장" | "관찰 중"; source: string; time: string; note: string; history: number[];
};

const data: Signal[] = [
  { id: "N-014", name: "대상자 N-014", setting: "facility", place: "늘봄 요양시설 · 2층", domain: "식사", title: "최근 식사량이 개인 평소 수준보다 낮게 기록됐어요", summary: "최근 3회 식사 기록 중 2회가 개인 기준선보다 낮습니다. 다른 관찰 기록과 함께 확인해 주세요.", value: "62%", baseline: "84%", delta: "−22%p", status: "확인 권장", source: "식사 관찰 기록", time: "오늘 10:20", note: "최근 두 차례 식사에서 남긴 양이 평소보다 많다고 기록되었습니다. 단일 기록만으로 원인을 판단하지 않습니다.", history: [88, 85, 84, 79, 70, 62] },
  { id: "N-023", name: "대상자 N-023", setting: "facility", place: "늘봄 요양시설 · 1층", domain: "활동", title: "일상 활동 시간이 며칠 동안 줄어들었어요", summary: "최근 활동 기록이 개인의 최근 기준보다 낮게 이어집니다. 생활기록과 함께 살펴볼 수 있습니다.", value: "24분", baseline: "52분", delta: "−28분", status: "확인 권장", source: "활동 관찰 기록", time: "오늘 09:45", note: "가상 활동 기록에서 최근 3일의 활동 시간이 평소보다 적게 기록됐습니다. 기록 누락 여부도 함께 확인해야 합니다.", history: [55, 51, 48, 39, 31, 24] },
  { id: "C-006", name: "대상자 C-006", setting: "community", place: "지역사회 돌봄 · 사례 06", domain: "안부·교류", title: "최근 안부 확인 응답 기록이 줄었어요", summary: "7일간의 연락 기록이 개인의 최근 패턴과 다르게 나타납니다. 담당자 확인을 위한 참고 신호입니다.", value: "2회", baseline: "5회", delta: "−3회", status: "확인 권장", source: "안부 확인 기록", time: "오늘 09:10", note: "합성 연락 기록에서 응답 완료 횟수가 최근 기준보다 적게 나타납니다. 연락 시도 기록과 데이터 누락 여부를 확인해 주세요.", history: [5, 5, 4, 4, 3, 2] },
  { id: "N-031", name: "대상자 N-031", setting: "facility", place: "늘봄 요양시설 · 3층", domain: "수면", title: "수면 시간이 평소보다 길게 기록됐어요", summary: "최근 수면 기록이 개인 기준선보다 길지만, 현재는 관찰 중 상태입니다.", value: "10.2시간", baseline: "8.1시간", delta: "+2.1시간", status: "관찰 중", source: "수면 관찰 기록", time: "어제 18:30", note: "수면 시간 변화만으로 건강 상태를 해석하지 않습니다. 다음 관찰 기록과 함께 추이를 확인합니다.", history: [8.0, 8.2, 8.1, 8.6, 9.4, 10.2] }
];

const records = [
  { time: "10:20", id: "N-014", type: "식사", detail: "점심 식사량 62%로 기록됨", state: "기준선 비교" },
  { time: "09:45", id: "N-023", type: "활동", detail: "오전 활동 기록 24분", state: "추이 확인" },
  { time: "09:10", id: "C-006", type: "안부", detail: "최근 연락 응답 기록 업데이트", state: "담당자 확인" },
  { time: "08:35", id: "N-014", type: "관찰", detail: "식사 관련 관찰 메모 추가", state: "관찰 기록" },
  { time: "어제 18:30", id: "N-031", type: "수면", detail: "수면 시간 10.2시간으로 집계", state: "관찰 중" },
  { time: "어제 16:50", id: "C-006", type: "상담", detail: "전화 시도 기록 업데이트", state: "기록 업데이트" }
];

function Icon({ children }: { children: string }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export default function HomePage() {
  const [view, setView] = useState<View>("overview");
  const [setting, setSetting] = useState<"all" | Setting>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("N-014");

  const visible = useMemo(() => data.filter((item) => {
    const matchSetting = setting === "all" || item.setting === setting;
    const text = (item.id + " " + item.name + " " + item.domain + " " + item.title + " " + item.place).toLowerCase();
    return matchSetting && text.includes(query.trim().toLowerCase());
  }), [setting, query]);

  const selected = visible.find((item) => item.id === selectedId) || visible[0] || data[0];
  const reviewCount = data.filter((item) => item.status === "확인 권장").length;
  const settingText = (value: Setting) => value === "facility" ? "요양시설" : "지역사회";

  return (
    <main className="shell">
      <div className="demo-banner"><span className="dot" /><span><b>PROTOTYPE · 합성 데이터</b> 실제 어르신·환자·복지 대상자의 정보가 아닙니다. 실제 돌봄 판단에 사용하지 마세요.</span></div>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Neulgyeot home"><div className="brand-mark">늘</div><div><small>CARE INTELLIGENCE BY KREWX</small><strong>늘곁 <span>Neulgyeot</span></strong></div></a>
        <div className="top-meta"><span className="pill"><i /> Demo environment</span><span className="date">2026. 10. 28 · 수요일</span></div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">CARE & COMMUNITY INTELLIGENCE</p><h1>오늘, 먼저 살필 변화를<br /><em>함께 발견합니다.</em></h1><p className="hero-sub">돌봄 기록 속 평소와 다른 변화를 살피고, 담당자가 먼저 확인할 대상을 판단하도록 돕는 초기 프로토타입입니다.</p></div>
        <aside className="hero-note"><small><i /> SAMPLE WORKSPACE</small><strong>AI가 사람을 대신해 판단하지 않습니다.</strong><p>관찰 신호와 근거를 제공하고, 다음 판단은 돌봄 담당자와 사회복지사가 합니다.</p></aside>
      </section>

      <nav className="nav" aria-label="주요 메뉴">
        <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>⌂ <span>오늘의 현황</span></button>
        <button className={view === "signals" ? "active" : ""} onClick={() => setView("signals")}>⌁ <span>변화 신호</span><b>{reviewCount}</b></button>
        <button className={view === "records" ? "active" : ""} onClick={() => setView("records")}>▤ <span>관찰 기록</span></button>
        <button className={view === "about" ? "active" : ""} onClick={() => setView("about")}>ⓘ <span>프로토타입 안내</span></button>
      </nav>

      <section className="metrics">
        <article><label>샘플 대상자</label><strong>04<span>명</span></strong><small>가상의 대상자 레코드</small></article>
        <article className="metric-warn"><label>확인 권장</label><strong>{reviewCount.toString().padStart(2, "0")}<span>건</span></strong><small>담당자가 근거를 살펴볼 변화</small></article>
        <article><label>관찰 기록</label><strong>06<span>건</span></strong><small>샘플 타임라인 기록</small></article>
        <article><label>데이터 상태</label><strong className="demo-word">DEMO</strong><small>실제 기관 데이터 미연결</small></article>
      </section>

      <section className="section-head">
        <div><h2>{view === "overview" ? "오늘의 돌봄 현황" : view === "signals" ? "변화 신호 살펴보기" : view === "records" ? "관찰 기록 타임라인" : "프로토타입 안내"}</h2><p>{view === "overview" ? "개인의 평소 기준선과 차이가 관찰된 샘플 레코드입니다." : view === "signals" ? "단정이 아닌 검토를 위한 참고 신호와 근거입니다." : view === "records" ? "합성 데이터로 구성한 최근 관찰 기록입니다." : "현재 구현 범위와 데이터 안전 원칙을 확인하세요."}</p></div>
        {view !== "about" && <div className="tools"><label className="search"><Icon>⌕</Icon><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="대상자·기록 검색" aria-label="대상자 또는 기록 검색" /></label><div className="filters"><button className={setting === "all" ? "chosen" : ""} onClick={() => setSetting("all")}>전체</button><button className={setting === "facility" ? "chosen" : ""} onClick={() => setSetting("facility")}>시설</button><button className={setting === "community" ? "chosen" : ""} onClick={() => setSetting("community")}>지역사회</button></div></div>}
      </section>

      {view === "overview" && <section className="dashboard">
        <article className="panel queue">
          <div className="panel-head"><div><small>REVIEW QUEUE</small><h3>먼저 확인할 변화</h3></div><span className="count">{visible.length} signals</span></div>
          <div className="signal-list">
            {visible.map((item, index) => <button key={item.id} className={"signal-row " + (selected.id === item.id ? "selected" : "")} onClick={() => setSelectedId(item.id)}>
              <span className={"number " + (item.status === "확인 권장" ? "warning" : "")}>{String(index + 1).padStart(2, "0")}</span>
              <span className="signal-copy"><span className="signal-title"><b>{item.name}</b><em className={item.status === "확인 권장" ? "state warn" : "state"}>{item.status}</em></span><small>{item.domain} · {settingText(item.setting)} · {item.place}</small><span>{item.title}</span></span><span className="go">→</span>
            </button>)}
            {visible.length === 0 && <div className="empty">검색 조건에 맞는 샘플 신호가 없습니다.</div>}
          </div>
          <div className="footnote">ⓘ 우선순위는 실제 위험도 점수가 아닙니다. 관찰 근거를 사람이 검토하기 위한 정렬 예시입니다.</div>
        </article>

        <article className="panel detail">
          <div className="panel-head"><div><small>SIGNAL DETAIL</small><h3>변화 근거</h3></div><em className={selected.status === "확인 권장" ? "state warn" : "state"}>{selected.status}</em></div>
          <div className="subject"><span className="avatar">{selected.setting === "facility" ? "F" : "C"}</span><div><b>{selected.name}</b><small>{selected.place}</small></div><span className="synthetic">합성</span></div>
          <h4>{selected.title}</h4><p className="summary">{selected.summary}</p>
          <div className="compare"><div><small>최근 관찰값</small><strong>{selected.value}</strong></div><b className="delta">{selected.delta}<small>vs</small></b><div><small>개인 기준선 예시</small><strong>{selected.baseline}</strong></div></div>
          <div className="chart-title"><span>최근 기록 변화</span><small>샘플 6포인트</small></div>
          <div className="chart">{selected.history.map((value, index) => <div className="bar-col" key={index}><i className={index === selected.history.length - 1 ? "bar last" : "bar"} style={{ height: Math.max(12, value / Math.max.apply(null, selected.history) * 100) + "%" }} /><small>{index === selected.history.length - 1 ? "최근" : "-" + (selected.history.length - index - 1)}</small></div>)}</div>
          <p className="chart-note">수치는 설명용 합성 데이터이며 실제 대상자의 상태를 나타내지 않습니다.</p>
          <div className="evidence"><span>i</span><div><b>관찰 메모</b><p>{selected.note}</p></div></div>
          <div className="detail-meta"><span>◷ {selected.time}</span><span>출처: {selected.source}</span></div>
          <button className="primary" onClick={() => setView("records")}>관련 기록 보기 <span>→</span></button>
        </article>
      </section>}

      {view === "signals" && <section className="signal-cards">
        {visible.map((item) => <button className="panel card-signal" key={item.id} onClick={() => { setSelectedId(item.id); setView("overview"); }}>
          <div className="card-top"><small>{item.domain.toUpperCase()} · {item.id}</small><em className={item.status === "확인 권장" ? "state warn" : "state"}>{item.status}</em></div>
          <h3>{item.title}</h3><p>{item.summary}</p><div className="card-bottom"><span>{item.name} · {settingText(item.setting)}</span><b>근거 보기 →</b></div>
        </button>)}
        {visible.length === 0 && <div className="panel empty">검색 조건에 맞는 샘플 신호가 없습니다.</div>}
      </section>}

      {view === "records" && <section className="panel records">
        <div className="panel-head"><div><small>OBSERVATION TIMELINE</small><h3>최근 관찰 기록</h3></div><span className="count">샘플 6건</span></div>
        <div className="table-wrap"><table><thead><tr><th>기록 시각</th><th>대상자</th><th>구분</th><th>관찰 내용</th><th>상태</th></tr></thead><tbody>
          {records.filter((record) => (setting === "all" || data.find((item) => item.id === record.id)?.setting === setting) && (record.id + " " + record.type + " " + record.detail).toLowerCase().includes(query.trim().toLowerCase())).map((record, index) => <tr key={record.id + record.time + index}><td>{record.time}</td><td><b>{record.id}</b><small>합성 대상자</small></td><td><span className="domain">{record.type}</span></td><td>{record.detail}</td><td>{record.state}</td></tr>)}
        </tbody></table></div>
        <div className="footnote">ⓘ 기록은 데모 코드에 포함된 샘플입니다. 외부 데이터베이스나 실사용자 데이터와 연결되어 있지 않습니다.</div>
      </section>}

      {view === "about" && <section className="about-grid">
        <article className="panel about-card"><div className="about-icon">⌑</div><small>DATA BOUNDARY</small><h3>현재는 합성 데이터만 사용합니다.</h3><p>이 데모는 제품 흐름을 보여주기 위한 초기 화면입니다. 이름, 건강기록, 연락처 등 실제 개인정보를 입력하거나 업로드하지 마세요.</p><ul><li>실제 개인 데이터베이스 미연결</li><li>계정·권한 관리 미구현</li><li>영구 저장 미구현</li></ul></article>
        <article className="panel about-card"><div className="about-icon green">⌁</div><small>HUMAN IN THE LOOP</small><h3>AI는 판단을 보조합니다.</h3><p>변화 신호에는 가능한 한 관찰값, 개인 기준선, 시점과 출처를 함께 표시합니다. 신호만으로 질환이나 응급 상황을 단정하지 않습니다.</p><ul><li>진단·치료 권고를 제공하지 않음</li><li>최종 판단은 담당자가 수행</li><li>근거 부족과 누락 데이터는 별도 표시 예정</li></ul></article>
        <article className="panel about-card"><div className="about-icon purple">↗</div><small>NEXT MILESTONE</small><h3>설명 가능한 기준선부터 개발합니다.</h3><p>다음 단계는 데이터 스키마, 기준선 계산과 변화 탐지 로직을 분리하고 테스트하는 것입니다.</p><ul><li>관찰 기록 스키마와 검증</li><li>개인 기준선·결측 처리</li><li>PostgreSQL과 FastAPI 통합 설계</li></ul></article>
      </section>}

      <footer><div><b>늘곁 · Neulgyeot</b><span>Built by KREWX</span></div><p>Early prototype · synthetic data only · not a medical or diagnostic product</p></footer>
    </main>
  );
}
