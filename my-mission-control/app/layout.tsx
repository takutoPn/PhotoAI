import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Mission Control",
  description: "Personal workflow cockpit with three productivity tools"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
