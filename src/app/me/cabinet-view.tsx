"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CollapsibleSection, EmptyState, PrimaryAction } from "@/components/ui/system";
import type { CabDocument, CabDraftTarget, CabItem, CabUpload, CabinetPackage } from "./cabinet-client";

type Props = { name: string; items: CabItem[]; uploads: CabUpload[]; vacancyCount: number; packageStatus: CabinetPackage; documents: CabDocument[]; draftTargets: CabDraftTarget[]; initialView: "resumes" | "documents" };
type Priority = { title: string; action: string; href: string; image?: string };

function date(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function shortDateTime(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function subscribeDrafts(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

export function CabinetClient({ items, uploads, documents, draftTargets, packageStatus, initialView: view }: Props) {
  const last = items[0];
  const latestDocument = documents[0];
  const draftSnapshot = useSyncExternalStore(subscribeDrafts, () => JSON.stringify([
    ...items.map((item) => [item.id, window.localStorage.getItem(`toxichr:revenge:${item.id}`)]),
    ...draftTargets.map((target) => [`${target.analysisId}:${target.vacancyId}`, window.localStorage.getItem(`toxichr:adaptation:${target.analysisId}:${target.vacancyId}`)]),
  ]), () => "[]");
  const draft: Priority | null = (() => {
    const stored = new Map<string, string | null>(JSON.parse(draftSnapshot) as [string, string | null][]);
    const hasAnswers = (key: string) => {
      try { return Object.values(JSON.parse(stored.get(key) ?? "{}") as Record<string, unknown>).some((answer) => typeof answer === "string" && answer.trim()); }
      catch { return false; }
    };
    for (const item of items) {
      if (documents.some((document) => document.kind === "improvement" && document.analysisId === item.id)) continue;
      if (hasAnswers(item.id)) return { title: `Исправление · ${item.resumeTitle}`, action: "Продолжить ответы ↗", href: `/revenge?analysisId=${item.id}`, image: item.img };
    }
    for (const target of draftTargets) {
      if (hasAnswers(`${target.analysisId}:${target.vacancyId}`)) {
        const person = items.find((item) => item.id === target.analysisId);
        return { title: `Адаптация · ${person?.resumeTitle ?? "резюме"} под «${target.vacancyTitle}»`, action: "Продолжить ответы ↗", href: `/adaptation?analysisId=${target.analysisId}&vacancyId=${target.vacancyId}`, image: person?.img };
      }
    }
    return null;
  })();

  const documentPerson = latestDocument ? items.find((item) => item.id === latestDocument.analysisId) : null;
  const priority: Priority | null = draft ?? (latestDocument
    ? { title: latestDocument.title, action: `Скачать DOCX · ${shortDate(latestDocument.updatedAt)} ↗`, href: latestDocument.downloadHref, image: documentPerson?.img }
    : last ? { title: `Разбор ${last.personaName} · ${last.resumeTitle}`, action: "Смотреть разбор ↗", href: `/session?view=${last.id}`, image: last.img } : null);

  return <>
      {view === "resumes" ? <>
        <header className="cabinet-header"><h1>Мои резюме<span>.</span></h1><Link href="/" className="cabinet-add">Добавить резюме</Link></header>
        {priority ? priority.href.endsWith("/docx") ? <a href={priority.href} className="cabinet-feature"><span className="cabinet-feature-copy"><strong>{priority.title}</strong><span>{priority.action}</span></span>{priority.image ? <span className="cabinet-feature-photo thr-photo" style={{ backgroundImage: `url('${priority.image}')` }} aria-hidden="true" /> : null}</a> : <Link href={priority.href} className="cabinet-feature"><span className="cabinet-feature-copy"><strong>{priority.title}</strong><span>{priority.action}</span></span>{priority.image ? <span className="cabinet-feature-photo thr-photo" style={{ backgroundImage: `url('${priority.image}')` }} aria-hidden="true" /> : null}</Link> : null}
        {packageStatus.active ? <p className="cabinet-package">Пакет ToxicHR · сопоставлений осталось {packageStatus.matchesRemaining}</p> : null}
        <section className="cabinet-section cabinet-history"><h2>История</h2>
          {uploads.length ? <div className="cabinet-resumes">{uploads.map((upload) => {
            const analyses = items.filter((item) => item.resumeId === upload.id);
            const readyDocuments = documents.filter((document) => document.resumeId === upload.id);
            const latest = analyses[0];
            return <CollapsibleSection key={upload.id} className="cabinet-resume-card" title={<span className="cabinet-resume-summary"><strong>{upload.title}</strong><span>{shortDateTime(upload.createdAt)} · {latest ? `разбор ${latest.personaName}` : "ещё без разбора"}</span></span>}><div className="cabinet-events">
              <div className="cabinet-event"><div><b>Исходное резюме</b><span className="cabinet-filename" title={upload.filename}>{upload.filename}</span></div></div>
              {analyses.map((item) => <Link key={item.id} className="cabinet-event" href={`/session?view=${item.id}`}><div><b>Разбор {item.personaName}</b><span>Готов · {date(item.createdAt)}</span></div><strong>Смотреть ↗</strong></Link>)}
              {readyDocuments.map((document) => <div key={document.id} className="cabinet-event"><div><b>{document.title}</b><span>Готово · {date(document.updatedAt)}</span></div><div className="cabinet-event-actions"><Link href={document.href}>Открыть</Link><a href={document.downloadHref}>Скачать DOCX ↗</a></div></div>)}
            </div></CollapsibleSection>;
          })}</div> : <EmptyState action={<PrimaryAction href="/">Добавить резюме</PrimaryAction>}>Резюме пока нет.</EmptyState>}
        </section>
      </> : <>
        <header className="cabinet-header"><h1>Готовые документы<span>.</span></h1></header>
        {documents.length ? <div className="cabinet-documents">{documents.map((document) => <div key={document.id} className="cabinet-document"><div><b>{document.title}</b><span>{date(document.updatedAt)}</span></div><div className="cabinet-event-actions"><Link href={document.href}>Открыть</Link><a href={document.downloadHref}>Скачать DOCX ↗</a></div></div>)}</div> : <EmptyState>Готовых документов пока нет.</EmptyState>}
      </>}
  </>;
}
