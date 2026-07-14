"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, HeartHandshake, KeyRound } from "lucide-react";
import { RealNeedLogo } from "@/components/RealNeedLogo";
import { cn } from "@/lib/utils";

export function AppNavigation() {
  function moveHistory(direction: "back" | "forward") {
    if (typeof window === "undefined") return;
    if (direction === "back") window.history.back();
    else window.history.forward();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/92 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => moveHistory("back")} className="grid h-9 w-9 place-items-center rounded-[6px] text-helper transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink" aria-label="返回上一页" title="返回上一页"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => moveHistory("forward")} className="grid h-9 w-9 place-items-center rounded-[6px] text-helper transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink" aria-label="前进到下一页" title="前进到下一页"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <Link href="/" className="absolute left-1/2 inline-flex -translate-x-1/2 items-center gap-2 text-base font-semibold text-ink">
          <span className="grid h-7 w-7 place-items-center rounded-[6px] bg-ink text-paper"><RealNeedLogo className="h-4 w-4" /></span>
          RealNeed
        </Link>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <NavLink href="/api-connections" label="API 连接" icon={<KeyRound className="h-4 w-4" />} />
          <NavLink href="/support" label="支持与交流" icon={<HeartHandshake className="h-4 w-4" />} emphasis />
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, label, icon, emphasis = false }: { href: string; label: string; icon: ReactNode; emphasis?: boolean }) {
  return <a href={href} className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink sm:px-3", emphasis ? "bg-lime text-ink hover:bg-[#B9EA58]" : "text-graphite hover:bg-white hover:text-ink")} aria-label={label} title={label}>{icon}<span className="hidden sm:inline">{label}</span></a>;
}
