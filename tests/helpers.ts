import { setAiGeneratorForTesting } from "../lib/server/ai/client";
import { createSessionToken, loadActor, type Actor } from "../lib/server/auth/session";
import { openDb, setDbForTesting, type Db } from "../lib/server/db/client";
import { seed } from "../lib/server/db/seed";

process.env.NEULGYEOT_SESSION_SECRET ??= "test-only-secret-test-only-secret-0000";
process.env.NEULGYEOT_DEMO_LOGIN = "true";

/**
 * Seed clock. The dataset itself is deterministic (fixed PRNG seed); dates are
 * relative to now so period-based analytics stay meaningful whenever tests run.
 */
export const NOW = new Date();

/** Fresh in-memory DB with the demo seed, registered as the app DB. AI is "not configured" by default. */
export async function seededDb(): Promise<Db> {
  const db = await openDb("memory://");
  await seed(db, NOW);
  setDbForTesting(db);
  setAiGeneratorForTesting(null);
  return db;
}

export async function actor(db: Db, id: string): Promise<Actor> {
  const a = await loadActor(db, id);
  if (!a) throw new Error(`no actor ${id}`);
  return a;
}

type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Calls a route handler as the given user (or anonymously) and returns status + parsed body. */
export async function call(handler: Handler, opts: { user?: string; method?: string; url?: string; body?: unknown; params?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {};
  if (opts.user) headers.cookie = `ng_session=${createSessionToken(opts.user)}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`http://test.local${opts.url ?? "/"}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json as any, headers: res.headers }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
