import { z } from "zod";
import { loadActor, readCookie, SESSION_COOKIE, verifySessionToken, type Actor } from "./auth/session";
import { getDb, type Db } from "./db/client";
import { AppError, invalid } from "./errors";

export type Ctx<P> = { req: Request; params: P; db: Db; actor: Actor };
type RouteContext = { params: Promise<Record<string, string>> };

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  if (err instanceof z.ZodError) {
    return json({ error: { code: "validation_error", message: "입력값을 확인해 주세요.", details: z.flattenError(err) } }, 400);
  }
  // Log the type only; error messages from DB drivers can echo row content.
  console.error("[neulgyeot] unhandled error:", err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : typeof err);
  return json({ error: { code: "internal_error", message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." } }, 500);
}

export async function actorFromRequest(db: Db, req: Request): Promise<Actor | null> {
  const uid = verifySessionToken(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  return uid ? loadActor(db, uid) : null;
}

/** Wraps an authenticated route handler with session loading and uniform error handling. */
export function route<P extends Record<string, string> = Record<string, never>>(
  handler: (ctx: Ctx<P>) => Promise<unknown>,
) {
  return async (req: Request, context?: RouteContext): Promise<Response> => {
    try {
      const db = await getDb();
      const actor = await actorFromRequest(db, req);
      if (!actor) throw new AppError("unauthenticated", "로그인이 필요합니다.");
      const params = ((await context?.params) ?? {}) as P;
      const result = await handler({ req, params, db, actor });
      return result instanceof Response ? result : json(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw invalid("JSON 본문을 읽을 수 없습니다.");
  }
  return schema.parse(body);
}

export function parseQuery<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return schema.parse(params);
}

export const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export type Paginated<T> = { data: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };

export function paginated<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { data, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

const buckets = new Map<string, { count: number; resetAt: number }>();
/** Small in-memory fixed-window limiter for costly endpoints (AI, login). Per process only. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) throw new AppError("rate_limited", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
}
