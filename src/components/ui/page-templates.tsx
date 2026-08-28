import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function Template({ name, children, className }: { name: string; children: ReactNode; className?: string }) {
  return <div className={cn("ds-template", `ds-template-${name}`, className)}>{children}</div>;
}

export function LandingPage({ children, className }: { children: ReactNode; className?: string }) { return <Template name="landing" className={className}>{children}</Template>; }
export function AnalysisResultPage({ children, className }: { children: ReactNode; className?: string }) { return <Template name="analysis" className={className}>{children}</Template>; }
export function ComparisonResultPage({ children, className }: { children: ReactNode; className?: string }) { return <Template name="comparison" className={className}>{children}</Template>; }
export function ServicePage({ children, className }: { children: ReactNode; className?: string }) { return <Template name="service" className={className}>{children}</Template>; }
