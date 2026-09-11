import type { CSSProperties, ReactNode } from "react";
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
  return <div className={cn("ds-metric-strip", className)} style={{ "--metrics-count": items.length } as CSSProperties}>{items.map((item, index) => <div key={index}><b>{item.value}</b><span>{item.label}</span></div>)}</div>;
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

export function QuestionField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
  id,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const textarea = onChange
    ? <textarea id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} rows={5} maxLength={1_500} />
    : <textarea id={id} defaultValue={value} placeholder={placeholder} disabled={disabled} rows={5} maxLength={1_500} />;
  return <label className="ds-question-field" htmlFor={id}><b>{label}</b>{hint ? <span>{hint}</span> : null}{textarea}</label>;
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

export function PersonaCard({ name, role, tag, image, quote, focus, lenses, description, href }: { name: string; role: string; tag: string; image: string; quote: string; focus: string; lenses: string[]; description: string; href: string }) {
  return <article className="ds-persona-card">
    <div className="ds-persona-card-photo thr-photo" style={{ backgroundImage: `url('${image}')` }} role="img" aria-label={`${name}, ${role}`}><SectionLabel className="ds-persona-card-tag">{tag}</SectionLabel></div>
    <div className="ds-persona-card-body">
      <div><h2>{name}</h2><p>{role}</p></div>
      <blockquote>{quote}</blockquote>
      <p>{focus}</p>
      <ul aria-label="Фокус разбора">{lenses.map((lens) => <li key={lens}>{lens}</li>)}</ul>
      <p>{description}</p>
      <PrimaryAction href={href}>Выбрать этого HR</PrimaryAction>
    </div>
  </article>;
}

export function OfferCard({ label, badge, price, priceNote, description, items, action, highlighted = false }: { label: ReactNode; badge?: ReactNode; price: ReactNode; priceNote: ReactNode; description?: ReactNode; items: ReactNode[]; action: ReactNode; highlighted?: boolean }) {
  return <article className={cn("ds-offer-card", highlighted && "ds-offer-card-highlighted")}>
    <div className="ds-offer-card-head">
      <div className="ds-offer-card-label"><SectionLabel>{label}</SectionLabel>{badge ? <span>{badge}</span> : null}</div>
      <div className="ds-offer-card-price"><b>{price}</b><span>{priceNote}</span></div>
    </div>
    {description ? <p className="ds-offer-card-description">{description}</p> : null}
    <ul>{items.map((item, index) => <li key={index}><span aria-hidden>{highlighted ? "+" : "✓"}</span>{item}</li>)}</ul>
    <div className="ds-offer-card-action">{action}</div>
  </article>;
}

export function InfoNote({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return <aside className={cn("ds-info-note", className)}><b>{title}</b><p>{children}</p></aside>;
}

export function FormCard({ label, title, description, children, footer, className }: { label: ReactNode; title: ReactNode; description: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return <section className={cn("ds-form-card", className)}>
    <SectionLabel>{label}</SectionLabel>
    <h1>{title}</h1>
    <LeadText>{description}</LeadText>
    {children}
    {footer ? <footer>{footer}</footer> : null}
  </section>;
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "data" }) {
  return <span className={cn("ds-status-pill", `ds-status-pill-${tone}`)}>{children}</span>;
}

export function HistoryRow({ href, status, title, meta, aside, tone = "neutral" }: { href: string; status: ReactNode; title: ReactNode; meta: ReactNode; aside: ReactNode; tone?: "neutral" | "success" | "data" }) {
  return <Link href={href} className="ds-history-row">
    <StatusPill tone={tone}>{status}</StatusPill>
    <span className="ds-history-row-content"><b>{title}</b><small>{meta}</small></span>
    <span className="ds-history-row-aside">{aside}</span>
  </Link>;
}

export function SurfacePanel({ children, className, label, action }: { children: ReactNode; className?: string; label?: ReactNode; action?: ReactNode }) {
  return <section className={cn("ds-surface-panel", className)}>
    {label || action ? <header><SectionLabel>{label}</SectionLabel>{action}</header> : null}
    {children}
  </section>;
}
