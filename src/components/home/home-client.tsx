"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import type { PersonaId } from "@/lib/personas";
import { track } from "@/lib/analytics";
import { ROSTER } from "@/components/home/hr-roster";
import { updateReferral } from "@/lib/referral-client";
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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    track("landing_viewed", {});
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
          <h1>Токсичный <em>HR</em></h1>
          <p>Загрузи резюме. Выбери, кто его прочитает.</p>
        </div>

        <div className={styles.personaPanel}>
          <div
            className={`${styles.portrait} thr-photo`}
            style={{ backgroundImage: `url('${selected.img}')` }}
            role="img"
            aria-label={`${selected.name}, ${selected.role}`}
          >
            <div className={styles.portraitCopy}>
              <b>{selected.name}</b>
              <span>{selected.role}</span>
              <p>«{selected.quote}»</p>
            </div>
          </div>
        </div>

        <div
          className={`${styles.uploadRail} ${dragActive ? styles.drag : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
        >
          <button type="button" className={styles.fileAction} onClick={() => fileRef.current?.click()} disabled={busy}>
            <FileText size={26} strokeWidth={1.7} aria-hidden />
            <span>
              <b>{busy ? "Читаем резюме" : dragActive ? "Отпускай резюме" : "Кидай резюме"}</b>
              <small>PDF или DOCX</small>
            </span>
            <i aria-hidden>→</i>
          </button>
          <button type="button" className={styles.textAction} onClick={() => setShowPaste((value) => !value)} disabled={busy}>
            {showPaste ? "Скрыть текст" : "Вставить текст"}
          </button>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
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
                <span>
                  <b>{person.name}</b>
                  <small>{person.tag}</small>
                </span>
              </button>
            ))}
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
