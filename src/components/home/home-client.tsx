"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload } from "lucide-react";
import type { PersonaId } from "@/lib/personas";
import { track } from "@/lib/analytics";
import { HrCarousel } from "@/components/ui/hr-carousel";
import { OfferCard, PrimaryAction, SecondaryAction } from "@/components/ui/system";
import { updateReferral } from "@/lib/referral-client";
import { clearPendingResume, readPendingResume, savePendingResume } from "@/lib/pending-resume";
import { requestErrorMessage } from "@/lib/user-facing-errors";
import styles from "./home-client.module.css";

const MAX_BYTES = 8 * 1024 * 1024;
type Pending = { kind: "file"; file: File; persona: PersonaId } | { kind: "text"; text: string; persona: PersonaId };

export function HomeClient({ initialPersona, priceRub }: { initialPersona?: PersonaId; priceRub: number }) {
  const router = useRouter();
  const [sel, setSel] = useState<PersonaId | null>(initialPersona ?? null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [consentApproved, setConsentApproved] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    track("landing_viewed", {});
    const timer = window.setTimeout(() => {
      const draft = readPendingResume();
      if (draft) {
        setPastedText(draft);
        setShowPaste(true);
        setDraftRestored(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => savePendingResume(pastedText), 300);
    return () => window.clearTimeout(timer);
  }, [pastedText]);

  const select = useCallback((id: PersonaId) => {
    setSel(id);
    setError(null);
    track("persona_selected", { persona: id });
  }, []);

  const upload = useCallback(async (file: File, persona: PersonaId) => {
    setBusy(true);
    setError(null);
    track("resume_upload_started", { source: "home", persona });
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/resumes/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить файл");
      track("resume_uploaded", { mime: file.type || "unknown" });
      await updateReferral("started", { resumeId: data.resumeId }).catch(() => undefined);
      router.push(`/session?resumeId=${data.resumeId}&personaId=${persona}`);
    } catch (reason) {
      setError(requestErrorMessage(reason, "Не удалось загрузить файл. Попробуй ещё раз."));
      setBusy(false);
    }
  }, [router]);

  const pasteResume = useCallback(async (text: string, persona: PersonaId) => {
    if (text.trim().length < 80) return;
    setBusy(true);
    setError(null);
    track("resume_upload_started", { source: "paste", persona });
    try {
      const response = await fetch("/api/resumes/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось прочитать текст");
      track("resume_uploaded", { mime: "text/plain" });
      await updateReferral("started", { resumeId: data.resumeId }).catch(() => undefined);
      clearPendingResume();
      router.push(`/session?resumeId=${data.resumeId}&personaId=${persona}`);
    } catch (reason) {
      setError(requestErrorMessage(reason, "Не удалось отправить текст. Черновик сохранён — попробуй ещё раз."));
      setBusy(false);
    }
  }, [router]);

  function stageFile(file: File) {
    const okType = file.type === "application/pdf" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.(pdf|docx)$/i.test(file.name);
    if (!okType) return setError("Нужен PDF или DOCX.");
    if (file.size > MAX_BYTES) return setError("Файл больше 8 МБ.");
    setSelectedFile(file);
    setShowPaste(false);
    setError(null);
  }
  function start(pendingResume: Pending) {
    if (pendingResume.kind === "file") void upload(pendingResume.file, pendingResume.persona);
    else void pasteResume(pendingResume.text, pendingResume.persona);
  }
  function requestAnalysis() {
    if (!sel || busy) return;
    const resume: Pending | null = showPaste
      ? pastedText.trim().length >= 80 ? { kind: "text", text: pastedText, persona: sel } : null
      : selectedFile ? { kind: "file", file: selectedFile, persona: sel } : null;
    if (!resume) return;
    if (consentApproved) start(resume);
    else setPending(resume);
  }
  function continueAfterConsent() {
    if (!consentChecked || !pending) return;
    setConsentApproved(true);
    setPending(null);
    start(pending);
  }

  const pastedLength = pastedText.trim().length;
  const missingPasteChars = Math.max(0, 80 - pastedLength);
  const resumeReady = showPaste ? pastedLength >= 80 : selectedFile !== null;

  return <div className={styles.home}>
    <section className={styles.hero} id="top" aria-labelledby="home-title">
      <div className={styles.intro}>
        <div><h1 id="home-title">Твоё резюме <em>не работает?</em></h1><p>Выбери своего HR и узнай почему</p></div>
        <div id="resume-start" className={`${styles.actions} ${dragActive ? styles.drag : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => { event.preventDefault(); setDragActive(false); const file = event.dataTransfer.files?.[0]; if (file && !busy) stageFile(file); }}>
          <button type="button" className={`${styles.action} ${styles.primary}`} onClick={() => fileRef.current?.click()} disabled={busy}>
            <span className={styles.actionIcon}><Upload size={27} strokeWidth={1.8} aria-hidden /></span><span className={styles.actionCopy}><b>{dragActive ? "Отпускай резюме" : "Кидай резюме"}</b>{selectedFile && !showPaste ? <small>{selectedFile.name}</small> : null}</span><span className={styles.actionArrow} aria-hidden>↗</span>
          </button>
          <button type="button" className={`${styles.action} ${styles.secondary}`} onClick={() => setShowPaste((value) => !value)} disabled={busy} aria-expanded={showPaste} aria-controls="paste-panel">
            <span className={styles.actionIcon}><FileText size={26} strokeWidth={1.7} aria-hidden /></span><span className={styles.actionCopy}><b>{showPaste ? "Скрыть текст" : "Вставить текст"}</b><small>Если нет файла</small></span><span className={styles.actionArrow} aria-hidden>↗</span>
          </button>
          {error ? <p className={styles.actionError} role="alert">{error}</p> : null}
        </div>
        {showPaste ? <div className={styles.pasteBox} id="paste-panel">
          <label htmlFor="resume-text">Резюме без файла</label>
          <textarea id="resume-text" value={pastedText} onChange={(event) => { setPastedText(event.target.value); setDraftRestored(false); }} placeholder="Опыт, проекты, результаты, образование…" rows={7} maxLength={60_000} aria-describedby="paste-requirement" />
          <p id="paste-requirement" aria-live="polite">{draftRestored ? "Черновик восстановлен. Проверь текст и продолжай." : pastedLength === 0 ? "Нужно минимум 80 символов." : missingPasteChars > 0 ? `Добавь ещё ${missingPasteChars} символов.` : "Текста достаточно."}</p>
        </div> : null}
      </div>
      <div className={styles.carousel}><h2 className={styles.srOnly}>Выбери HR</h2><HrCarousel selected={sel} featured={initialPersona ?? "vadik"} onSelect={select} /></div>
      <div className={styles.launch} aria-live="polite"><PrimaryAction onClick={requestAnalysis} disabled={!resumeReady || !sel || busy} className={styles.launchButton}>{busy ? "Начинаем разбор…" : "Начать разбор"}</PrimaryAction></div>
    </section>

    <section className={styles.section} id="how" aria-labelledby="how-title"><h2 id="how-title">Как это работает</h2><div className={styles.steps}>
      <article><span>01</span><h3>Добавляешь резюме</h3><p>Файл или текст.</p></article>
      <article><span>02</span><h3>Выбираешь HR</h3><p>Разбор с выбранным взглядом.</p></article>
      <article><span>03</span><h3>Запускаешь разбор</h3><p>И видишь замечания по тексту.</p></article>
      <article><span>04</span><h3>Исправляешь</h3><p>Собираешь новую версию.</p></article>
    </div></section>

    <section className={styles.section} id="pricing" aria-labelledby="pricing-title"><h2 id="pricing-title">Цены</h2><div className={styles.prices}>
      <OfferCard label="Бесплатно" price="0 ₽" priceNote="" items={["Полный первый HR-разбор", "Ещё один HR-взгляд", "Замечания с опорой на текст", "Самостоятельный разбор вакансии"]} action={<SecondaryAction href="#resume-start">Начать бесплатно</SecondaryAction>} />
      <OfferCard highlighted label="Пакет ToxicHR" price={`${priceRub} ₽`} priceNote="за одно резюме" items={["Все четыре HR-взгляда", "До 5 сопоставлений с вакансиями", "Одно улучшение резюме", "Одна адаптация под вакансию", "До 5 повторных проверок"]} action={<PrimaryAction href="#resume-start">Начать с бесплатного разбора</PrimaryAction>} />
    </div></section>

    <section className={styles.finalCta} aria-labelledby="final-title"><h2 id="final-title">Сколько офферов ты ещё хочешь <em>пропустить?</em></h2><PrimaryAction href="#resume-start">Проверить резюме</PrimaryAction></section>

    <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) stageFile(file); event.target.value = ""; }} />
    {pending ? <div className={styles.consentBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPending(null); }}><div className={styles.consentDialog} role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <h2 id="consent-title">Перед разбором</h2><p>Для разбора нужно обработать текст твоего резюме.</p>
      <label><input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} /><span>Согласен на обработку резюме для работы сервиса. <a href="/privacy" target="_blank" rel="noopener noreferrer">Условия</a></span></label>
      <div><button type="button" className="thr-btn thr-btn-line" onClick={() => setPending(null)}>Отмена</button><button type="button" className="thr-btn thr-btn-tox" disabled={!consentChecked} onClick={continueAfterConsent}>Начать разбор</button></div>
    </div></div> : null}
  </div>;
}
