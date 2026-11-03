import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "늘곁 CareLink EMR — 요양병원용 (DEMO)",
  description:
    "늘곁 요양병원용(Neulgyeot Hospital) EMR 워크스페이스 프로토타입. 합성 데이터만 사용하며 지자체 연계·보호자 리포트는 모의(DEMO)로 동작합니다.",
  applicationName: "Neulgyeot Hospital",
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
