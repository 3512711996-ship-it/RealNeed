import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppNavigation } from "@/components/AppNavigation";
import { CustomCursor } from "@/components/CustomCursor";
import "./globals.css";

export const metadata: Metadata = {
  title: "RealNeed | 小产品想法判断器",
  description: "输入一个想法，判断它值不值得做成新手可交付的小产品。"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <CustomCursor />
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
