"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Account = { id: string; name: string; role: string; roleLabel: string; hint: string };

export function LoginPicker({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function login(id: string) {
    setPending(id);
    setError(null);
    const res = await fetch("/api/auth/demo-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: id }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error?.message ?? "로그인하지 못했습니다.");
      setPending(null);
      return;
    }
    router.push(data.redirectTo);
    router.refresh();
  }
  return (
    <>
      {error && <p className="cw-msg msg-error" role="alert">{error}</p>}
      <ul className="cw-list">
        {accounts.map((a) => (
          <li key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>
              <b>{a.name}</b>
              <br />
              <span className="cw-meta">
                {a.roleLabel} · {a.hint}
              </span>
            </span>
            <button type="button" className="btn btn-primary" disabled={pending !== null} onClick={() => login(a.id)}>
              {pending === a.id ? "로그인 중…" : "이 계정으로 시작"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
