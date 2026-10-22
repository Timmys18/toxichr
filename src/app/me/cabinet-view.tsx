"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CollapsibleSection, EmptyState, PrimaryAction } from "@/components/ui/system";
import type { CabDocument, CabDraftTarget, CabItem, CabUpload, CabinetPackage } from "./cabinet-client";

type Props = { name: string; items: CabItem[]; uploads: CabUpload[]; vacancyCount: number; packageStatus: CabinetPackage; documents: CabDocument[]; draftTargets: CabDraftTarget[]; initialView: "resumes" | "documents" };
type Priority = { title: string; href: string; image?: string; persona?: string };

function date(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function CabinetClient({ items, uploads, documents, draftTargets, initialView: view }: Props) {
  const [draft, setDraft] = useState<Priority | null>(null);
  const last = items[0];
  const latestDocument = documents[0];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const item of items) {
        if (documents.some((document) => document.kind === "improvement" && document.analysisId === item.id)) continue;
        try {
          const answers = JSON.parse(window.localStorage.getItem(`toxichr:revenge:${item.id}`) ?? "{}") as Record<string, unknown>;
          if (Object.values(answers).some((answer) => typeof answer === "string" && answer.trim())) {
            setDraft({ title: "Продолжить исправление резюме", href: `/revenge?analysisId=${item.id}`, image: item.img, persona: item.personaName });
            return;
          }
        } catch { /* повреждённый черновик пропускаем */ }
      }
      for (const target of draftTargets) {
        try {
          const answers = JSON.parse(window.localStorage.getItem(`toxichr:adaptation:${target.analysisId}:${target.vacancyId}`) ?? "{}") as Record<string, unknown>;
          if (Object.values(answers).some((answer) => typeof answer === "string" && answer.trim())) {
            const person = items.find((item) => item.id === target.analysisId);
            setDraft({ title: `Продолжить адаптацию под «${target.vacancyTitle}»`, href: `/adaptation?analysisId=${target.analysisId}&vacancyId=${target.vacancyId}`, image: person?.img, persona: person?.personaName });
            return;
          }
        } catch { /* повреждённый черновик пропускаем */ }
      }
      setDraft(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [items, documents, draftTargets]);

  const documentPerson = latestDocument ? items.find((item) => item.id === latestDocument.analysisId) : null;
  const verb = last && /^(Лера|Тамара)/.test(last.personaName) ? "разобрала" : "разобрал";
  const priority: Priority | null = draft ?? (latestDocument
    ? { title: latestDocument.kind === "adaptation" ? "Адаптация резюме готова" : "Новая версия резюме готова", href: latestDocument.href, image: documentPerson?.img, persona: documentPerson?.personaName }
    : last ? { title: `${last.personaName} ${verb} твоё резюме`, href: `/session?view=${last.id}`, image: last.img, persona: last.personaName } : null);

  return <>
      {view === "resumes" ? <>
        <header className="cabinet-header"><h1>Мои резюме<span>.</span></h1><Link href="/" className="cabinet-add">Добавить резюме</Link></header>
        {priority ? <Link href={priority.href} className="cabinet-feature"><span className="cabinet-feature-copy"><strong>{priority.title}</strong><span aria-hidden="true">Открыть ↗</span></span>{priority.image ? <span className="cabinet-feature-photo thr-photo" style={{ backgroundImage: `url('${priority.image}')` }} aria-hidden="true" /> : null}</Link> : null}
        <section className="cabinet-section cabinet-history"><h2>История</h2>
          {uploads.length ? <div className="cabinet-resumes">{uploads.map((upload) => {
            const analyses = items.filter((item) => item.resumeId === upload.id);
            const readyDocuments = documents.filter((document) => document.resumeId === upload.id);
            const latest = analyses[0];
            return <CollapsibleSection key={upload.id} className="cabinet-resume-card" title={<span className="cabinet-resume-summary"><strong>Резюме · {shortDate(upload.createdAt)}</strong><span>{latest ? `Последний разбор: ${latest.personaName}` : "Ещё без разбора"}</span></span>}><div className="cabinet-events">
              <div className="cabinet-event"><div><b>Исходное резюме</b><span className="cabinet-filename" title={upload.filename}>{upload.filename}</span></div></div>
              {analyses.map((item) => <Link key={item.id} className="cabinet-event" href={`/session?view=${item.id}`}><div><b>Разбор {item.personaName}</b><span>Готов · {date(item.createdAt)}</span></div><strong>Смотреть ↗</strong></Link>)}
              {readyDocuments.map((document) => <Link key={document.id} className="cabinet-event" href={document.href}><div><b>{document.title}</b><span>Готово · {date(document.updatedAt)}</span></div><strong>Открыть ↗</strong></Link>)}
            </div></CollapsibleSection>;
          })}</div> : <EmptyState action={<PrimaryAction href="/">Добавить резюме</PrimaryAction>}>Резюме пока нет.</EmptyState>}
        </section>
      </> : <>
        <header className="cabinet-header"><h1>Готовые документы<span>.</span></h1></header>
        {documents.length ? <div className="cabinet-documents">{documents.map((document) => <Link key={document.id} href={document.href} className="cabinet-document"><div><b>{document.title}</b><span>{date(document.updatedAt)}</span></div><strong>Открыть ↗</strong></Link>)}</div> : <EmptyState>Готовых документов пока нет.</EmptyState>}
      </>}
  </>;
}
