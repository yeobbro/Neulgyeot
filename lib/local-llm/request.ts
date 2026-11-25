/**
 * Validation for POST /api/local-llm/draft. Pure so it can be unit-tested.
 *
 * Data-class gate: this phase sends SYNTHETIC demo records only. The request must name a patient from the synthetic
 * demo dataset (SYN-P-xxxx) and declare dataClass "synthetic"; anything else is refused before any model call.
 */
import { MAX_FACT_CHARS, MAX_FACTS, type DraftFact, type LocalDraftKind } from "./types";

const KINDS: LocalDraftKind[] = ["discharge_note", "family_message", "handover"];
const PHONE = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|\d{2,3}-\d{3,4}-\d{4}/;
const RRN = /\d{6}\s*-\s*[1-4]\d{6}/;

export type DraftRequest = { kind: LocalDraftKind; patientId: string; facts: DraftFact[] };

export function parseDraftRequest(body: unknown, syntheticPatientIds: ReadonlySet<string>): { ok: true; value: DraftRequest } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!KINDS.includes(b.kind as LocalDraftKind)) return { ok: false, reason: "invalid_kind" };
  if (b.dataClass !== "synthetic") return { ok: false, reason: "real_data_blocked" };
  if (typeof b.patientId !== "string" || !syntheticPatientIds.has(b.patientId)) return { ok: false, reason: "real_data_blocked" };
  if (!Array.isArray(b.facts) || b.facts.length === 0 || b.facts.length > MAX_FACTS) return { ok: false, reason: "invalid_facts" };
  const facts: DraftFact[] = [];
  const ids = new Set<string>();
  for (const f of b.facts) {
    if (!f || typeof f !== "object") return { ok: false, reason: "invalid_facts" };
    const { id, text, source } = f as Record<string, unknown>;
    if (typeof id !== "string" || !/^F\d{1,3}$/.test(id) || ids.has(id)) return { ok: false, reason: "invalid_facts" };
    if (typeof text !== "string" || !text.trim() || text.length > MAX_FACT_CHARS) return { ok: false, reason: "invalid_facts" };
    if (PHONE.test(text) || RRN.test(text)) return { ok: false, reason: "identifier_in_facts" };
    ids.add(id);
    facts.push({ id, text: text.trim(), source: typeof source === "string" ? source.slice(0, 120) : "" });
  }
  return { ok: true, value: { kind: b.kind as LocalDraftKind, patientId: b.patientId, facts } };
}

/** Small in-memory fixed-window limiter (per server instance). */
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, limit = 12, windowMs = 60_000, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || h.reset <= now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n += 1;
  return h.n > limit;
}
