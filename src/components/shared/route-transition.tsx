"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { CabinetNav, CabinetNavContent } from "@/components/shared/cabinet-nav";

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/me" || pathname === "/vacancies" || pathname === "/settings") {
    return <div className="route-content cabinet-route"><main id="main" className="cabinet-main"><div className="ds-page-container cabinet-view"><Suspense fallback={<CabinetNavContent active="resumes" />}><CabinetNav /></Suspense><div className="cabinet-content">{children}</div></div></main></div>;
  }

  return <div className="route-content">{children}</div>;
}
