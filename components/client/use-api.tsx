"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ApiError = { code: string; message: string; details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } };

/** Formats a server error, including zod field messages, into one readable line. */
export function errorText(e: ApiError): string {
  const fields = e.details?.fieldErrors ? Object.values(e.details.fieldErrors).flat() : [];
  const form = e.details?.formErrors ?? [];
  return [e.message, ...form, ...fields].filter(Boolean).join(" ");
}

/**
 * Calls an API route and refreshes server components on success so every
 * panel re-reads the saved state from the database.
 */
export function useApi() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run<T = unknown>(url: string, init: { method: string; body?: unknown }, opts: { success?: string; refresh?: boolean } = {}): Promise<T | null> {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: init.method,
        headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
      if (!res.ok) {
        setError(data?.error ? errorText(data.error) : `요청 실패 (${res.status})`);
        return null;
      }
      if (opts.success) setMessage(opts.success);
      if (opts.refresh !== false) router.refresh();
      return data as T;
    } catch {
      setError("서버에 연결할 수 없습니다. 네트워크를 확인하세요.");
      return null;
    } finally {
      setPending(false);
    }
  }

  return { run, pending, error, message, setError, setMessage };
}

export function Feedback({ error, message }: { error: string | null; message: string | null }) {
  if (error) return <p className="cw-msg msg-error" role="alert">{error}</p>;
  if (message) return <p className="cw-msg msg-success" role="status">{message}</p>;
  return null;
}
