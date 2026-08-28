import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type TemplateName = "landing" | "analysis" | "comparison" | "service";

function Template({ name, children, className }: { name: TemplateName; children: ReactNode; className?: string }) {
  const classes = cn("ds-template", `ds-template-${name}`, className);

  if (name === "service") {
    return <section className={classes} data-page-template={name}><div className="ds-template-content">{children}</div></section>;
  }

  return <main id="main" className={classes} data-page-template={name}><div className="ds-template-content">{children}</div></main>;
}

export function LandingPage({ children, className }: { children: ReactNode; className?: string }) {
  return <Template name="landing" className={className}>{children}</Template>;
}

export function AnalysisResultPage({ children, className }: { children: ReactNode; className?: string }) {
  return <Template name="analysis" className={className}>{children}</Template>;
}

export function ComparisonResultPage({ children, className }: { children: ReactNode; className?: string }) {
  return <Template name="comparison" className={className}>{children}</Template>;
}

export function ServicePage({ children, className }: { children: ReactNode; className?: string }) {
  return <Template name="service" className={className}>{children}</Template>;
}
