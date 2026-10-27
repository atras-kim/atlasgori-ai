import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "atlasgori · Trade workspace",
  description: "메일에서 프로젝트까지, 하나의 업무 공간",
  icons: { icon: "/brand/atlasgori-blue-black.ico", apple: "/brand/atlasgori-blue-black-192.png" },
  appleWebApp: { capable: true, title: "atlasgori", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#081c3b' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
