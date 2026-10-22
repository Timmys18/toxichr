"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CabinetNav } from "@/components/shared/cabinet-nav";
import { CollapsibleSection, EmptyState, PageContainer, PrimaryAction, SurfacePanel } from "@/components/ui/system";
import type { CabDocument, CabDraftTarget, CabItem, CabUpload, CabinetPackage } from "./cabinet-client";

type Props = { name: string; items: CabItem[]; uploads: CabUpload[]; vacancyCount: number; packageStatus: CabinetPackage; documents: CabDocument[]; draftTargets: CabDraftTarget[]; initialView: "resumes" | "documents" };
type Priority = { status: string; title: string; href: string; action: string; image?: string; persona?: string };

function date(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
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
            setDraft({ status: "Продолжить работу", title: "Исправление резюме не закончено", href: `/revenge?analysisId=${item.id}`, action: "Продолжить", image: item.img, persona: item.personaName });
            return;
          }
        } catch { /* повреждённый черновик пропускаем */ }
      }
      for (const target of draftTargets) {
        try {
          const answers = JSON.parse(window.localStorage.getItem(`toxichr:adaptation:${target.analysisId}:${target.vacancyId}`) ?? "{}") as Record<string, unknown>;
          if (Object.values(answers).some((answer) => typeof answer === "string" && answer.trim())) {
            const person = items.find((item) => item.id === target.analysisId);
            setDraft({ status: "Продолжить работу", title: `Адаптация под «${target.vacancyTitle}» не закончена`, href: `/adaptation?analysisId=${target.analysisId}&vacancyId=${target.vacancyId}`, action: "Продолжить", image: person?.img, persona: person?.personaName });
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
    ? { status: "Документ готов", title: latestDocument.kind === "adaptation" ? "Адаптация резюме готова" : "Новая версия резюме готова", href: latestDocument.href, action: "Открыть документ", image: documentPerson?.img, persona: documentPerson?.personaName }
    : last ? { status: "Разбор готов", title: `${last.personaName} ${verb} твоё резюме`, href: `/session?view=${last.id}`, action: "Смотреть разбор", image: last.img, persona: last.personaName } : null);

  return <PageContainer className="cabinet-view">
    <CabinetNav active={view} />

    <div className="cabinet-content">
      {view === "resumes" ? <>
        <header className="cabinet-header"><h1>Мои резюме<span>.</span></h1><Link href="/" className="cabinet-add">Добавить резюме</Link></header>
        {priority ? <section className="cabinet-section"><h2>Продолжить работу</h2><SurfacePanel className="cabinet-feature"><div className="cabinet-feature-copy"><span>{priority.status}</span><h3>{priority.title}</h3><PrimaryAction href={priority.href}>{priority.action}</PrimaryAction></div>{priority.image ? <div className="cabinet-feature-photo thr-photo" style={{ backgroundImage: `url('${priority.image}')` }} role="img" aria-label={priority.persona ?? "HR"}><b>{priority.persona}</b></div> : null}</SurfacePanel></section> : null}
        <section className="cabinet-section cabinet-history"><h2>История резюме</h2>
          {uploads.length ? <div className="cabinet-resumes">{uploads.map((upload) => {
            const analyses = items.filter((item) => item.resumeId === upload.id);
            const readyDocuments = documents.filter((document) => document.resumeId === upload.id);
            const latest = analyses[0];
            return <CollapsibleSection key={upload.id} className="cabinet-resume-card" title={<span className="cabinet-resume-summary"><strong>Резюме от {date(upload.createdAt)}</strong><span>{latest ? `Последний разбор: ${latest.personaName}` : "Ещё без разбора"}</span></span>}><div className="cabinet-events">
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
    </div>
  </PageContainer>;
}
