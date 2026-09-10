import type { Metadata } from "next";
import "./globals.css";
import "./workbench.css";
import {ThemeProvider} from "./theme-provider";

export const metadata: Metadata = {
  title: "ContentFlow · 商品内容工作台",
  description: "商品资料核验、内容版本组合、审核与商品发布。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
