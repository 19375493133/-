import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "大学课堂听课助手",
  description: "录音、分片上传、课堂标记与后续智能分析的基础平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`${inter.className} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
