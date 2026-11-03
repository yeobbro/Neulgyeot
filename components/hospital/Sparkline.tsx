/**
 * Lightweight SVG trend line. Null values are rendered as gaps (never interpolated as normal).
 * `domain` fixes the vertical scale to a broad display range so small day-to-day
 * differences are not visually exaggerated. It is a display range only, not a
 * clinical reference range.
 */
export function Sparkline({
  values,
  label,
  color = "#1c5db8",
  domain
}: {
  values: (number | null)[];
  label: string;
  color?: string;
  domain?: [number, number];
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <p className="hint spark" style={{ height: "auto" }}>데이터 부족 — 추세 표시 불가</p>;
  const w = 260;
  const h = 34;
  const pad = 3;
  const dataMin = Math.min(...nums);
  const dataMax = Math.max(...nums);
  const min = domain ? Math.min(domain[0], dataMin) : dataMin;
  const max = domain ? Math.max(domain[1], dataMax) : dataMax;
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (values.length - 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);

  const segments: string[] = [];
  let cur = "";
  values.forEach((v, i) => {
    if (v === null) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${label} 최근 ${values.length}회 기록 추세, 최소 ${dataMin} 최대 ${dataMax}`}>
      <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="#e3e7ec" strokeWidth="1" />
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      ))}
      {values.map((v, i) =>
        v === null ? (
          <circle key={i} cx={x(i)} cy={h - pad} r="2" fill="#b6c0cc" />
        ) : (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 2.6 : 1.6} fill={color} />
        )
      )}
    </svg>
  );
}
