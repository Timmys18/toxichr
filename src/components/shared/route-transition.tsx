"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { CabinetNav } from "@/components/shared/cabinet-nav";

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  if (pathname === "/me" || pathname === "/vacancies" || pathname === "/settings") {
    return <div className="route-content cabinet-route"><main id="main" className="cabinet-main"><div className="ds-page-container cabinet-view"><CabinetNav /><div className="cabinet-content">{children}</div></div></main></div>;
  }

  return (
    <motion.div key={pathname} className="route-content" initial={reducedMotion ? false : { opacity: 0.94, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}
