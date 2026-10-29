/** Dependency-free SVG charts. Every chart also renders its numbers as text for screen readers. */

type Series = { label: string; color: string; values: number[] };

export function LineChart({ labels, series, title }: { labels: string[]; series: Series[]; title: string }) {
  const W = 640;
  const H = 220;
  const P = { l: 36, r: 12, t: 12, b: 36 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => P.l + (labels.length <= 1 ? 0 : (i * (W - P.l - P.r)) / (labels.length - 1));
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <figure style={{ margin: 0 }}>
      <svg className="cw-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#e3e8e2" />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % Math.ceil(labels.length / 8) === 0 ? <text key={l + i} x={x(i)} y={H - 12} textAnchor="middle">{l.slice(5)}</text> : null))}
        {series.map((s) => (
          <g key={s.label}>
            <polyline fill="none" stroke={s.color} strokeWidth={2.5} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />)}
          </g>
        ))}
      </svg>
      <figcaption className="cw-legend">
        {series.map((s) => (
          <span key={s.label}><i style={{ background: s.color }} />{s.label} (합계 {s.values.reduce((a, b) => a + b, 0)})</span>
        ))}
      </figcaption>
      {/* Tables ignore the 1px width of .sr-only, so the wrapper carries it. */}
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead><tr><th>주 시작일</th>{series.map((s) => <th key={s.label}>{s.label}</th>)}</tr></thead>
          <tbody>{labels.map((l, i) => <tr key={l + i}><td>{l}</td>{series.map((s) => <td key={s.label}>{s.values[i]}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}

/** Horizontal bars; each row shows its value as text, so color is never the only cue. */
export function BarList({ rows, title, color = "#3f8a6a", unit = "" }: { rows: { label: string; value: number; note?: string }[]; title: string; color?: string; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div role="list" aria-label={title} style={{ display: "grid", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} role="listitem" style={{ display: "grid", gridTemplateColumns: "minmax(90px, 140px) 1fr auto", gap: 10, alignItems: "center", fontSize: 14 }}>
          <span>{r.label}</span>
          <span style={{ background: "#eef2ec", borderRadius: 6, height: 14, overflow: "hidden" }} aria-hidden="true">
            <span style={{ display: "block", height: "100%", width: `${(r.value / max) * 100}%`, background: color, borderRadius: 6 }} />
          </span>
          <b>{r.value}{unit}{r.note && <small style={{ color: "#7b8a82", fontWeight: 400 }}> {r.note}</small>}</b>
        </div>
      ))}
    </div>
  );
}

/** Stacked bars per row (e.g. referral status by service type). */
export function StackedBars({ rows, parts, title }: { rows: { label: string; values: number[] }[]; parts: { label: string; color: string }[]; title: string }) {
  const max = Math.max(1, ...rows.map((r) => r.values.reduce((a, b) => a + b, 0)));
  return (
    <div aria-label={title} role="list" style={{ display: "grid", gap: 8 }}>
      {rows.map((r) => {
        const total = r.values.reduce((a, b) => a + b, 0);
        return (
          <div key={r.label} role="listitem" style={{ display: "grid", gridTemplateColumns: "minmax(90px, 140px) 1fr auto", gap: 10, alignItems: "center", fontSize: 14 }}>
            <span>{r.label}</span>
            <span style={{ display: "flex", background: "#eef2ec", borderRadius: 6, height: 14, overflow: "hidden" }} aria-hidden="true">
              {r.values.map((v, i) => <span key={i} style={{ width: `${(v / max) * 100}%`, background: parts[i].color }} />)}
            </span>
            <span style={{ fontSize: 13 }}>{r.values.map((v, i) => `${parts[i].label} ${v}`).join(" · ")} <span className="sr-only">합계 {total}</span></span>
          </div>
        );
      })}
      <div className="cw-legend">{parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label}</span>)}</div>
    </div>
  );
}
