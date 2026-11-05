import type { TimelineStatus } from "@/lib/care/types";
import { TIMELINE_STATUS_LABEL } from "@/lib/care/types";

const TONE: Record<TimelineStatus, string> = {
  Recorded: "blue",
  "Staff-confirmed": "teal",
  "Independently verified": "green",
  Missing: "red",
  Unconfirmed: "amber"
};

/** Status chip. Colour is never the only signal: the Korean label + an icon carry the meaning (WCAG 1.4.1). */
export function CareStatusBadge({ status }: { status: TimelineStatus }) {
  const icon = status === "Independently verified" ? "✓✓" : status === "Staff-confirmed" ? "✓" : status === "Missing" ? "!" : status === "Unconfirmed" ? "…" : "•";
  return (
    <span className={`badge ${TONE[status]} care-status`} title={status}>
      <span aria-hidden="true">{icon}</span> {TIMELINE_STATUS_LABEL[status]}
    </span>
  );
}
