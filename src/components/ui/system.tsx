import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";
import { TopNav } from "@/components/shared/top-nav";

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main id="main" className={cn("ds-page-shell", className)}>{children}</main>;
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("ds-page-container", className)}>{children}</div>;
}

export function AppHeader() { return <TopNav />; }

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("ds-section-label thr-mono", className)}>{children}</p>;
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("ds-page-title", className)}>{children}</h1>;
}

export function LeadText({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("ds-lead", className)}>{children}</p>;
}

export function PageIntro({
  label,
  action,
  title,
  lead,
  className,
}: {
  label?: ReactNode;
  action?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("ds-page-intro", className)}>
      {label || action ? <div className="ds-page-intro-top">{label ? <SectionLabel>{label}</SectionLabel> : <span />}{action}</div> : null}
      <PageTitle>{title}</PageTitle>
      {lead ? <LeadText>{lead}</LeadText> : null}
    </header>
  );
}

export function SummaryRail({ title, meta, action, className }: { title: ReactNode; meta?: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={cn("ds-summary-rail", className)}><b>{title}</b>{meta ? <span>{meta}</span> : null}{action}</div>;
}

export type Metric = { value: ReactNode; label: ReactNode };
export function MetricStrip({ items, className }: { items: Metric[]; className?: string }) {
  return <div className={cn("ds-metric-strip", className)}>{items.map((item, index) => <div key={index}><b>{item.value}</b><span>{item.label}</span></div>)}</div>;
}

export function VerdictBlock({ label = "Вердикт", title, summary, metrics, className }: { label?: ReactNode; title: ReactNode; summary: ReactNode; metrics?: Metric[]; className?: string }) {
  return <section className={cn("ds-verdict", className)}><div><SectionLabel>{label}</SectionLabel><h2>{title}</h2><p>{summary}</p></div>{metrics?.length ? <MetricStrip items={metrics} /> : null}</section>;
}

export function EditorialSection({ title, children, label, className }: { title: ReactNode; children: ReactNode; label?: ReactNode; className?: string }) {
  return <section className={cn("ds-editorial", className)}>{label ? <SectionLabel className="ds-editorial-label">{label}</SectionLabel> : null}<h3>{title}</h3><div className="ds-editorial-content">{children}</div></section>;
}

export function EvidenceQuote({ children, className }: { children: ReactNode; className?: string }) {
  return <blockquote className={cn("ds-evidence-quote", className)}>{children}</blockquote>;
}

export function EvidenceItem({ title, description, quote, className }: { title: ReactNode; description: ReactNode; quote?: ReactNode; className?: string }) {
  return <article className={cn("ds-evidence-item", className)}><b>{title}</b><p>{description}</p>{quote ? <EvidenceQuote>{quote}</EvidenceQuote> : null}</article>;
}

export function PrimaryAction(props: ButtonProps) { return <Button {...props} variant="primary" className={cn("ds-primary-action", props.className)} />; }
export function SecondaryAction(props: ButtonProps) { return <Button {...props} variant="outline" className={cn("ds-secondary-action", props.className)} />; }

export function CommandRail({ primary, hint, secondary, className }: { primary: ReactNode; hint?: ReactNode; secondary?: ReactNode; className?: string }) {
  return <div className={cn("ds-command-rail", className)}><div><div className="ds-command-primary">{primary}</div>{hint ? <p>{hint}</p> : null}</div>{secondary ? <div className="ds-command-secondary">{secondary}</div> : null}</div>;
}

export function CollapsibleSection({ title, children, defaultOpen = false, className }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  return <details className={cn("ds-collapsible", className)} open={defaultOpen}><summary>{title}</summary><div>{children}</div></details>;
}

export function EmptyState({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={cn("ds-empty-state", className)}><p>{children}</p>{action}</div>;
}

export function PaymentPrompt({
  title,
  description,
  price,
  action,
  secondary,
  className,
}: {
  title: ReactNode;
  description: ReactNode;
  price: ReactNode;
  action: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return <section className={cn("ds-payment-prompt", className)} aria-label="Оплата действия"><div><SectionLabel>Платное действие</SectionLabel><h2>{title}</h2><p>{description}</p></div><div className="ds-payment-prompt-action"><b>{price}</b>{action}{secondary ? <span>{secondary}</span> : null}</div></section>;
}

export function InlineLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href} className={cn("ds-inline-link", className)}>{children}</Link>;
}
