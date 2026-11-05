import type { Metadata } from "next";
import { FamilyDashboardApp } from "@/components/family-dashboard/FamilyDashboardApp";

export const metadata: Metadata = { title: "늘곁 패밀리 — 보호자 대시보드 (DEMO)", robots: { index: false, follow: false } };

export default function FamilyPage() {
  return <FamilyDashboardApp />;
}
