import { notFound } from "next/navigation";
import { AppError } from "./errors";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Flattens Next's searchParams into single string values. */
export async function readParams(sp: SearchParams): Promise<Record<string, string | undefined>> {
  const raw = await sp;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== "")) as Record<string, string | undefined>;
}

/**
 * Runs a page data loader. Not-found maps to the 404 page; validation errors
 * (e.g. a malformed filter in the URL) return a message for the page to show.
 */
export async function load<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    if (err instanceof AppError) return { ok: false, message: err.message };
    if (err && typeof err === "object" && "issues" in err) return { ok: false, message: "필터 값이 올바르지 않습니다. 조건을 다시 선택하세요." };
    throw err;
  }
}
