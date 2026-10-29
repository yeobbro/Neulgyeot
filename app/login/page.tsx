import Link from "next/link";
import { LoginPicker } from "./picker";
import { ROLE_LABEL, type Role } from "@/lib/domain/constants";
import { demoLoginEnabled } from "@/lib/server/auth/session";
import { getDb } from "@/lib/server/db/client";
import "../care/care.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "늘곁 · 가상 계정 로그인" };

const ROLE_HINT: Record<Role, string> = {
  admin: "지역 전체 현황, 지도, 보고서, 감사 로그",
  worker: "담당 지역 대상자, 기록, 분석 검토, 조치",
  provider: "자기 기관에 온 서비스 의뢰만",
  recipient: "본인의 서비스·일정·문의",
  family: "동의된 가족의 허용된 정보만",
};

export default async function LoginPage() {
  const enabled = demoLoginEnabled();
  const db = await getDb();
  const accounts = enabled
    ? await db.query<{ id: string; name: string; role: Role }>(
        `SELECT id, name, role FROM users WHERE is_demo_data AND is_active ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'worker' THEN 1 WHEN 'provider' THEN 2 ELSE 3 END, id`,
      )
    : [];
  return (
    <div className="cw" style={{ display: "block" }}>
      <main className="cw-content" style={{ maxWidth: 880 }}>
        <div className="cw-heading">
          <div>
            <div className="cw-kicker">Neulgyeot · KREWX</div>
            <h2>늘곁 지역사회 통합돌봄 — 시연 로그인</h2>
            <p>실제 계정·본인 확인이 없는 개발 환경입니다. 아래 가상 계정 중 하나를 선택하세요. 권한 검사는 서버에서 실제로 적용됩니다.</p>
          </div>
        </div>
        {!enabled ? (
          <p className="cw-msg msg-warn">데모 로그인이 비활성화되어 있습니다. 운영 환경에서는 기관 인증 연동이 필요합니다.</p>
        ) : (
          <LoginPicker accounts={accounts.map((a) => ({ ...a, roleLabel: ROLE_LABEL[a.role], hint: ROLE_HINT[a.role] }))} />
        )}
        <p className="cw-meta" style={{ marginTop: 24 }}>
          기존 디자인 시안: <Link href="/dashboard">/dashboard</Link> · <Link href="/prototype">/prototype</Link> (정적 데모, 저장 기능 없음)
        </p>
      </main>
    </div>
  );
}
