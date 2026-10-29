import Link from "next/link";
import type { ReactNode } from "react";
import type { Region } from "@/lib/server/services/regions";

/** GET form: filters live in the URL, work without JavaScript and can be shared. */
export function FilterForm({ action, children, resetHref }: { action: string; children: ReactNode; resetHref?: string }) {
  return (
    <form className="cw-filters no-print" method="get" action={action} role="search">
      {children}
      <button className="btn btn-primary" type="submit">적용</button>
      {resetHref && <Link className="btn btn-outline" href={resetHref}>초기화</Link>}
    </form>
  );
}

export function SelectField({ label, name, value, options, allLabel = "전체" }: { label: string; name: string; value?: string; options: { value: string; label: string }[]; allLabel?: string | null }) {
  return (
    <label className="cw-field">
      {label}
      <select name={name} defaultValue={value ?? ""}>
        {allLabel !== null && <option value="">{allLabel}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Region options limited to what the viewer may see, indented by level. */
export function regionOptions(regions: Region[], scope: string[] | null) {
  return regions
    .filter((r) => r.level !== "sido" && (!scope || scope.includes(r.id)))
    .map((r) => ({ value: r.id, label: r.level === "eupmyeondong" ? `　└ ${r.name}` : r.name }));
}

export function DateField({ label, name, value }: { label: string; name: string; value?: string }) {
  return (
    <label className="cw-field">
      {label}
      <input type="date" name={name} defaultValue={value} />
    </label>
  );
}
