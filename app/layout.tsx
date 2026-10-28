import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neulgyeot | 늘곁 — Care Intelligence",
  description:
    "돌봄 현장의 작은 변화를 발견하고, 사람의 판단과 적절한 지원으로 연결하는 KREWX의 AI 돌봄 인텔리전스 프로토타입입니다.",
  applicationName: "Neulgyeot",
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  themeColor: "#0a1516",
  colorScheme: "dark"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
