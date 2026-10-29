import type { ReactNode } from "react";
import { requirePageActor } from "@/lib/server/auth/current";
import "./portal.css";

export const metadata = { title: "늘곁 · 우리 가족 돌봄 안내" };

export default async function PortalLayout({ children }: { children: ReactNode }) {
  await requirePageActor(["recipient", "family"]);
  return <div className="pt">{children}</div>;
}
