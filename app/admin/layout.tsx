import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true
  }
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
