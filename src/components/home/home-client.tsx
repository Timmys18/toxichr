"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PersonaId } from "@/lib/personas";
import { track } from "@/lib/analytics";
import { ROSTER } from "@/components/home/hr-roster";
import { updateReferral } from "@/lib/referral-client";
import { readPendingVacancy } from "@/lib/pending-vacancy";
import styles from "./home-client.module.css";

const MAX_BYTES = 8 * 1024 * 1024;

export function HomeClient() {
  const router = useRouter();
  const [sel, setSel] = useState<PersonaId>("vadik");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [hasPendingVacancy, setHasPendingVacancy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    track("landing_viewed", {});
    const timer = window.setTimeout(
      () => setHasPendingVacancy(Boolean(readPendingVacancy())),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const selected = ROSTER.find((person) => person.id === sel) ?? ROSTER[0];

  const select = useCallback((id: PersonaId) => {
    setSel(id);
    setError(null);
    track("persona_selected", { persona: id });
  }, []);

  const upload = useCallback(async (file: File) => {
    const okType =
      file.type === "application/pdf" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.(pdf|docx)$/i.test(file.name);
    if (!okType) return setError("Нужен PDF или DOCX.");
    if (file.size > MAX_BYTES) return setError("Файл больше 8 МБ.");

    setBusy(true);
    setError(null);
    track("resume_upload_started", { source: "home", persona: sel });
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/resumes/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить файл");
      track("resume_uploaded", { mime: file.type || "unknown" });
      await updateReferral("started", { resumeId: data.resumeId }).catch(() => undefined);
      router.push(`/session?resumeId=${data.resumeId}&personaId=${sel}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка загрузки");
      setBusy(false);
    }
  }, [router, sel]);

  const pasteResume = useCallback(async () => {
    if (pastedText.trim().length < 80) return;
    setBusy(true);
    setError(null);
    track("resume_upload_started", { source: "paste", persona: sel });
    try {
      const response = await fetch("/api/resumes/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pastedText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось прочитать текст");
      track("resume_uploaded", { mime: "text/plain" });
      await updateReferral("started", { resumeId: data.resumeId }).catch(() => undefined);
      router.push(`/session?resumeId=${data.resumeId}&personaId=${sel}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка загрузки");
      setBusy(false);
    }
  }, [pastedText, router, sel]);

  const pastedLength = pastedText.trim().length;
  const missingPasteChars = Math.max(0, 80 - pastedLength);

  return (
    <section className={styles.home}>
      <div className={styles.grid}>
        <div className={styles.intro}>
          <div className={`${styles.badge} thr-mono`}><i /> Хирургическая точность</div>
          <h1>Токсичный <em>HR</em></h1>
          <p>Саркастичный разбор резюме без корпоративного тумана. Жёстко к тексту — бережно к человеку.</p>
          <div className={styles.journey} aria-label="Как работает ToxicHR">
            <span><b>01</b> честный разбор</span><i />
            <span><b>02</b> новая версия</span><i />
            <span><b>03</b> проверка вакансией</span>
          </div>
          {hasPendingVacancy ? (
            <div className={styles.returnNote} role="status">
              Вакансия сохранена. Сначала проверим резюме, затем вернёмся к сопоставлению.
            </div>
          ) : null}
        </div>

        <div className={styles.personaPanel}>
          <div
            className={`${styles.portrait} thr-photo`}
            style={{ backgroundImage: `url('${selected.img}')` }}
            role="img"
            aria-label={`${selected.name}, ${selected.role}`}
          >
            <div className={`${styles.leadBadge} thr-mono`}>Ведущий разбора</div>
            <div className={styles.portraitCopy}>
              <b>{selected.name}</b>
              <span>{selected.role}</span>
              <p>«{selected.quote}»</p>
              <small>{selected.focus}</small>
            </div>
          </div>
          <div className={styles.roster} aria-label="Выбрать HR">
            {ROSTER.map((person) => (
              <button
                key={person.id}
                type="button"
                className={sel === person.id ? styles.selectedThumb : ""}
                onClick={() => select(person.id)}
                aria-pressed={sel === person.id}
                aria-label={`${person.name} — ${person.role}`}
              >
                <span className="thr-photo" style={{ backgroundImage: `url('${person.img}')` }} />
                <b>{person.name}</b>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.drop} ${dragActive ? styles.drag : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void upload(file);
            }}
            disabled={busy}
          >
            <span className={styles.uploadIcon} aria-hidden>↥</span>
            <b>{busy ? "Читаем документ…" : dragActive ? "Отпускай — берём в работу" : "Загрузите резюме"}</b>
            <span>Перетащите PDF или DOCX сюда<br />или выберите файл на устройстве</span>
          </button>
          <div className={`${styles.fileMeta} thr-mono`}>PDF / DOCX · до 8 МБ · приватно</div>
          <button
            type="button"
            className={`${styles.cta} thr-btn thr-btn-tox`}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <span>{busy ? "Загружаем…" : `Получить разбор · ${selected.name}`}</span><b aria-hidden>→</b>
          </button>
          <div className={styles.alternatives}>
            <button type="button" onClick={() => setShowPaste((value) => !value)} disabled={busy}>
              {showPaste ? "Скрыть поле" : "Вставить текст резюме"}
            </button>
            <Link href="/vacancy">Уже есть вакансия? Разобрать требования</Link>
          </div>
          <p className={styles.trust}>Без регистрации. Не добавляем в резюме факты, которых вы не подтверждали.</p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
      </div>

      {showPaste ? (
        <div className={`${styles.pastePanel} thr-card`}>
          <div><b>Резюме без файла</b><span className="thr-mono">{pastedLength} / 60 000</span></div>
          <textarea
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            placeholder="Опыт, проекты, результаты, образование…"
            rows={8}
            aria-label="Текст резюме"
            maxLength={60_000}
            aria-describedby="paste-requirement"
          />
          <p id="paste-requirement" aria-live="polite">
            {pastedLength === 0
              ? "Нужно минимум 80 символов — обычно это несколько строк об опыте."
              : missingPasteChars > 0
                ? `Добавьте ещё ${missingPasteChars} симв. — и можно запускать разбор.`
                : "Текста достаточно. Можно отдавать HR."}
          </p>
          <button type="button" className="thr-btn thr-btn-tox" onClick={() => void pasteResume()} disabled={busy || pastedLength < 80}>
            {busy ? "Читаем текст…" : `Отдать текст · ${selected.name}`}
          </button>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
    </section>
  );
}
