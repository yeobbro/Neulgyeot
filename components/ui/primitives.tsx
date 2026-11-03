import type { ReactNode } from "react";
import type { ReadinessCheck } from "@/lib/integrations/municipal-referral/types";

export type Tone = "neutral" | "blue" | "teal" | "amber" | "red" | "green" | "outline" | "demo";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone === "neutral" ? "" : tone}`}>{children}</span>;
}

export function Panel({
  title,
  actions,
  children,
  flush = false,
  id,
  as: Tag = "section"
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  id?: string;
  as?: "section" | "div" | "aside";
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Tag className="panel" aria-labelledby={headingId}>
      <div className="panel-h">
        <h2 id={headingId}>{title}</h2>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
      <div className={`panel-b ${flush ? "flush" : ""}`}>{children}</div>
    </Tag>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Checklist({ checks }: { checks: ReadinessCheck[] }) {
  return (
    <ul className="checklist">
      {checks.map((c) => (
        <li key={c.id} className={c.ok ? "ok" : "no"}>
          <span className="mark" aria-hidden="true">{c.ok ? "✓" : "○"}</span>
          <span>
            <span className="lbl">{c.label}</span>
            <span className="sr-only">{c.ok ? " — 충족" : " — 미충족"}</span>
            {!c.ok && c.detail ? <span className="hint"> · {c.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Avatar({ initials, large = false }: { initials: string; large?: boolean }) {
  return (
    <span className={`avatar ${large ? "lg" : ""}`} aria-hidden="true">
      {initials}
    </span>
  );
}
