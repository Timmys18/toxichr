"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonaId } from "@/lib/personas";
import { track } from "@/lib/analytics";
import { ROSTER } from "@/components/home/hr-roster";

const MAX_BYTES = 8 * 1024 * 1024;

export function HomeClient() {
  const router = useRouter();
  const [sel, setSel] = useState<PersonaId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const select = useCallback((id: PersonaId) => {
    setSel(id);
    setError(null);
    setTimeout(
      () => dockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      120,
    );
  }, []);

  const upload = useCallback(
    async (file: File) => {
      if (!sel) return;
      const okType =
        file.type === "application/pdf" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        /\.(pdf|docx)$/i.test(file.name);
      if (!okType) {
        setError("Нужен PDF или DOCX.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("Файл больше 8 МБ.");
        return;
      }
      setBusy(true);
      setError(null);
      track("resume_upload_started", { source: "home", persona: sel });
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/resumes/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить файл");
        track("resume_uploaded", { mime: file.type || "unknown" });
        router.push(`/session?resumeId=${data.resumeId}&personaId=${sel}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
        setBusy(false);
      }
    },
    [sel, router],
  );

  const selEntry = ROSTER.find((r) => r.id === sel);

  return (
    <section className="home">
      <div className="hh">
        <h1>
          Токсичный <i>HR</i>
        </h1>
        <p>
          Точный диагноз вместо корпоративной{" "}
          <b>политкорректности.</b>
        </p>
      </div>

      <div className="pick">
        Выбери своего <b>HR</b>
      </div>

      <div className="roster">
        {ROSTER.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`hr ${sel === p.id ? "sel" : ""}`}
            onClick={() => select(p.id)}
            aria-pressed={sel === p.id}
          >
            <span
              className="hr-photo thr-photo"
              style={{ backgroundImage: `url('${p.img}')` }}
            >
              <span className="hr-tag thr-mono">{p.tag}</span>
              <span className="hr-check" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 7.5l2.5 2.5L11 4"
                    stroke="#06130c"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="hr-qt-overlay">
                <span className="hr-qt">«{p.quote}»</span>
              </span>
            </span>
            <span className="hr-body">
              <span className="hr-nm">{p.name}</span>
              <span className="hr-rl">{p.role}</span>
            </span>
          </button>
        ))}
      </div>

      <div ref={dockRef} className={`dock ${sel ? "open" : ""}`}>
        <div className="dock-in thr-card">
          <button
            type="button"
            className="drop"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <span className="drop-ic" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 13V4M6.5 7.5L10 4l3.5 3.5M4 14v2h12v-2"
                  stroke="#2ce08b"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>
              <span className="drop-t1">
                {busy ? "Читаем документ…" : "Кидай резюме"}
              </span>
              <span className="drop-t2 thr-mono">PDF / DOCX · ДО 8 МБ · ПРИВАТНО</span>
            </span>
          </button>
          <div className="who">
            <div className="who-k thr-mono">Приём ведёт</div>
            <div className="who-n">{selEntry?.name ?? "—"}</div>
            <button
              type="button"
              className="thr-btn thr-btn-tox who-btn"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? "Загрузка…" : "Получить разбор"}
            </button>
          </div>
        </div>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </div>

      <style jsx>{`
        .home {
          max-width: 1160px;
          margin: 0 auto;
          padding: 24px 40px 64px;
          animation: thr-fade 0.6s var(--ease);
        }
        @media (max-width: 720px) {
          .home {
            padding: 20px 18px 56px;
          }
        }
        .hh {
          text-align: center;
          max-width: 720px;
          margin: 0 auto;
        }
        .hh-over {
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }
        .hh-over span {
          width: 24px;
          height: 1px;
          background: var(--tox);
        }
        .hh h1 {
          font-weight: 800;
          font-size: clamp(40px, 4.6vw, 66px);
          line-height: 0.94;
          letter-spacing: -0.045em;
          margin-top: 18px;
        }
        .hh h1 i {
          font-style: normal;
          color: var(--tox);
        }
        .hh p {
          margin-top: 22px;
          font-size: 19px;
          line-height: 1.5;
          color: var(--dim);
          max-width: 34ch;
          margin-left: auto;
          margin-right: auto;
        }
        .hh p b {
          color: var(--fg);
          font-weight: 500;
        }
        .pick {
          text-align: center;
          margin: 36px 0 18px;
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--faint);
        }
        .pick b {
          color: var(--tox);
          font-weight: 500;
        }
        .roster {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
        }
        @media (max-width: 900px) {
          .roster {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 520px) {
          .roster {
            grid-template-columns: 1fr;
          }
        }
        .hr {
          display: flex;
          flex-direction: column;
          border-radius: 20px;
          overflow: hidden;
          cursor: pointer;
          border: 1px solid var(--hair);
          transition: 0.4s var(--ease);
          background: var(--metal-1);
          padding: 0;
          text-align: left;
          font-family: inherit;
          color: inherit;
        }
        .hr:hover {
          transform: translateY(-4px);
          border-color: var(--hair2);
        }
        .hr.sel {
          border-color: var(--tox);
          box-shadow: 0 0 0 1px var(--tox), 0 30px 70px rgba(44, 224, 139, 0.14);
        }
        .hr-photo {
          position: relative;
          aspect-ratio: 4 / 5;
          flex-shrink: 0;
          background-position: center 22%;
        }
        .hr-qt-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: flex-end;
          padding: 18px 16px;
          background: linear-gradient(
            180deg,
            rgba(8, 9, 10, 0.35),
            rgba(8, 9, 10, 0.92)
          );
          backdrop-filter: blur(1px);
          opacity: 0;
          transition: opacity 0.28s var(--ease);
        }
        .hr:hover .hr-qt-overlay,
        .hr.sel .hr-qt-overlay {
          opacity: 1;
        }
        .hr-tag {
          position: absolute;
          top: 12px;
          left: 12px;
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--fg);
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(6px);
          padding: 5px 9px;
          border-radius: 6px;
          border: 1px solid var(--hair2);
        }
        .hr-check {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: var(--tox);
          display: none;
          align-items: center;
          justify-content: center;
        }
        .hr.sel .hr-check {
          display: flex;
        }
        .hr-body {
          display: flex;
          flex-direction: column;
          flex: 1;
          padding: 16px 16px 18px;
          background: var(--metal-1);
        }
        .hr-nm {
          font-weight: 700;
          font-size: 17px;
          letter-spacing: -0.02em;
          line-height: 1.15;
        }
        .hr-rl {
          font-size: 12px;
          color: var(--dim);
          margin-top: 3px;
        }
        .hr-qt {
          font-size: 12.5px;
          line-height: 1.5;
          color: var(--fg);
        }
        .dock {
          margin-top: 22px;
          overflow: hidden;
          max-height: 0;
          opacity: 0;
          transition: 0.6s var(--ease);
        }
        .dock.open {
          max-height: 340px;
          opacity: 1;
        }
        .dock-in {
          background: linear-gradient(180deg, var(--metal-1), var(--metal-0));
          padding: 26px 28px;
          display: flex;
          align-items: center;
          gap: 26px;
        }
        @media (max-width: 680px) {
          .dock-in {
            flex-direction: column;
            text-align: center;
            gap: 18px;
          }
        }
        .drop {
          flex: 1;
          border: 1.5px dashed var(--hair2);
          border-radius: 14px;
          padding: 26px;
          display: flex;
          align-items: center;
          gap: 18px;
          cursor: pointer;
          transition: 0.25s;
          background: rgba(255, 255, 255, 0.015);
          font-family: inherit;
          color: inherit;
          text-align: left;
          width: 100%;
        }
        .drop:hover {
          border-color: var(--tox);
          background: var(--tox-dim);
        }
        .drop-ic {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          background: var(--metal-2);
          border: 1px solid var(--hair);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .drop-t1 {
          display: block;
          font-size: 15px;
          font-weight: 600;
        }
        .drop-t2 {
          display: block;
          font-size: 12.5px;
          color: var(--faint);
          margin-top: 3px;
          letter-spacing: 0.06em;
        }
        .who {
          flex-shrink: 0;
          text-align: right;
        }
        @media (max-width: 680px) {
          .who {
            text-align: center;
          }
        }
        .who-k {
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--faint);
        }
        .who-n {
          font-weight: 700;
          font-size: 18px;
          margin-top: 4px;
        }
        .who-q {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.5;
          color: var(--dim);
          max-width: 30ch;
          margin-left: auto;
        }
        .who-btn {
          height: 48px;
          padding: 0 26px;
          margin-top: 14px;
          font-size: 14px;
        }
        .err {
          margin-top: 12px;
          font-size: 13.5px;
          color: var(--crit);
        }
      `}</style>
    </section>
  );
}
