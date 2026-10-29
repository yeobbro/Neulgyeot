"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

export type MapRegion = {
  id: string;
  name: string;
  parentName: string;
  polygon: number[][] | null;
  value: number;
  recipients: number;
  unconnected: number;
  needsReview: number;
  openTasks: number;
};
export type MapProvider = { id: string; name: string; x: number | null; y: number | null; types: string };

const W = 120;
const H = 80;

function shade(value: number, max: number) {
  if (max === 0 || value === 0) return "#e4ebe2";
  const t = value / max;
  if (t > 0.66) return "#b8574a";
  if (t > 0.33) return "#dc9a74";
  return "#efcfae";
}

/**
 * Schematic SVG map of the demo city. Regions are simple rectangles on an
 * abstract plane — explicitly not real administrative boundaries. Zoom and pan
 * via buttons or keyboard; clicking a region updates the URL so the list and
 * statistics on the page follow the selection.
 */
export function CareMap({ regions, providers, metricLabel, selectedId }: { regions: MapRegion[]; providers: MapProvider[]; metricLabel: string; selectedId?: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  const [showProviders, setShowProviders] = useState(true);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const max = Math.max(0, ...regions.map((r) => r.value));

  const zoom = (f: number) =>
    setView((v) => {
      const w = Math.min(W, Math.max(20, v.w * f));
      const h = (w * H) / W;
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      return { x: Math.min(W - w, Math.max(0, cx - w / 2)), y: Math.min(H - h, Math.max(0, cy - h / 2)), w, h };
    });
  const pan = (dx: number, dy: number) => setView((v) => ({ ...v, x: Math.min(W - v.w, Math.max(0, v.x + dx)), y: Math.min(H - v.h, Math.max(0, v.y + dy)) }));

  const select = (id: string) => {
    const p = new URLSearchParams(search.toString());
    if (p.get("regionId") === id) p.delete("regionId");
    else p.set("regionId", id);
    p.delete("page");
    router.push(`?${p.toString()}`, { scroll: false });
  };

  return (
    <div>
      <div className="cw-map">
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          role="group"
          aria-label={`돌봄 지도 — 색이 진할수록 ${metricLabel}이(가) 많음. 각 지역을 선택하면 아래 목록이 바뀝니다.`}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const scale = view.w / rect.width;
            const nx = drag.current.vx - (e.clientX - drag.current.x) * scale;
            const ny = drag.current.vy - (e.clientY - drag.current.y) * scale;
            setView((v) => ({ ...v, x: Math.min(W - v.w, Math.max(0, nx)), y: Math.min(H - v.h, Math.max(0, ny)) }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          {regions.map((r) => {
            if (!r.polygon) return null;
            const pts = r.polygon.map(([x, y]) => `${x},${y}`).join(" ");
            const xs = r.polygon.map((p) => p[0]);
            const ys = r.polygon.map((p) => p[1]);
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
            const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
            return (
              <g key={r.id}>
                <polygon
                  className={`cw-region${selectedId === r.id ? " is-selected" : ""}`}
                  points={pts}
                  fill={shade(r.value, max)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selectedId === r.id}
                  aria-label={`${r.parentName} ${r.name}: ${metricLabel} ${r.value}, 대상자 ${r.recipients}명, 미연계 ${r.unconnected}, 확인 필요 ${r.needsReview}, 미완료 조치 ${r.openTasks}`}
                  onClick={() => select(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select(r.id);
                    }
                  }}
                />
                <text x={cx} y={cy - 2} textAnchor="middle" fontSize={2.6} fill="#1f2d27" pointerEvents="none">{r.name}</text>
                <text x={cx} y={cy + 2.4} textAnchor="middle" fontSize={3} fontWeight={700} fill="#1f2d27" pointerEvents="none">{r.value}</text>
              </g>
            );
          })}
          {showProviders &&
            providers.map((p) =>
              p.x === null || p.y === null ? null : (
                <g key={p.id} pointerEvents="none">
                  <rect x={p.x - 0.9} y={p.y - 0.9} width={1.8} height={1.8} transform={`rotate(45 ${p.x} ${p.y})`} fill="#123a30" stroke="#fff" strokeWidth={0.3}>
                    <title>{`${p.name} — ${p.types}`}</title>
                  </rect>
                </g>
              ),
            )}
          <line x1={40} y1={0} x2={40} y2={80} stroke="#123a30" strokeWidth={0.5} strokeDasharray="1 1" pointerEvents="none" />
          <line x1={80} y1={0} x2={80} y2={80} stroke="#123a30" strokeWidth={0.5} strokeDasharray="1 1" pointerEvents="none" />
        </svg>
        <div className="cw-map-tools no-print">
          <button type="button" onClick={() => zoom(0.75)} aria-label="확대">＋</button>
          <button type="button" onClick={() => zoom(1 / 0.75)} aria-label="축소">－</button>
          <button type="button" onClick={() => pan(0, -6)} aria-label="위로 이동">↑</button>
          <button type="button" onClick={() => pan(-8, 0)} aria-label="왼쪽으로 이동">←</button>
          <button type="button" onClick={() => pan(8, 0)} aria-label="오른쪽으로 이동">→</button>
          <button type="button" onClick={() => pan(0, 6)} aria-label="아래로 이동">↓</button>
          <button type="button" onClick={() => setView({ x: 0, y: 0, w: W, h: H })} aria-label="전체 보기">⤢</button>
        </div>
      </div>
      <div className="cw-legend">
        <span><i style={{ background: "#e4ebe2" }} />0</span>
        <span><i style={{ background: "#efcfae" }} />낮음</span>
        <span><i style={{ background: "#dc9a74" }} />중간</span>
        <span><i style={{ background: "#b8574a" }} />높음 ({metricLabel}, 숫자 함께 표시)</span>
        <label className="cw-check"><input type="checkbox" checked={showProviders} onChange={(e) => setShowProviders(e.target.checked)} /> ◆ 서비스 제공 기관 표시</label>
      </div>
      <p className="cw-map-caption">
        지도는 가상 도시 &lsquo;늘봄시&rsquo;의 개발용 단순 도형입니다. 실제 행정경계·기관 위치가 아닙니다. 외부 지도 API를 사용하지 않으므로 지도 서비스 장애와 무관하게 동작합니다.
      </p>
    </div>
  );
}
