"use client";

import { useCallback, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type UploadDropzoneProps = {
  onFileSelected?: (file: File) => void;
  onTextSubmit?: (text: string) => void;
  disabled?: boolean;
};

export function UploadDropzone({
  onFileSelected,
  onTextSubmit,
  disabled = false,
}: UploadDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");

  const validate = useCallback((file: File) => {
    const okType =
      file.type === "application/pdf" ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.(pdf|docx)$/i.test(file.name);

    if (!okType) {
      return "Нужен PDF или DOCX. Или вставь текст вручную.";
    }
    if (file.size > MAX_BYTES) {
      return "Файл больше 8 МБ. Сожми или вставь текст.";
    }
    return null;
  }, []);

  const takeFile = useCallback(
    (file: File) => {
      const problem = validate(file);
      if (problem) {
        setError(problem);
        setFileName(null);
        track("resume_parse_failed", { reason: "validation" });
        return;
      }
      setError(null);
      setFileName(file.name);
      track("resume_uploaded", { mime: file.type || "unknown" });
      onFileSelected?.(file);
    },
    [onFileSelected, validate],
  );

  return (
    <div className="w-full max-w-xl">
      <div className="mb-4 flex gap-1 border border-ink/10 bg-surface p-1">
        {(
          [
            ["file", "Файл"],
            ["text", "Вставить текст"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "flex-1 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
              mode === id
                ? "bg-ink text-paper"
                : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <motion.label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) takeFile(file);
          }}
          className={cn(
            "relative flex cursor-pointer flex-col items-center justify-center border px-6 py-16 text-center transition-colors",
            disabled && "pointer-events-none opacity-50",
            dragOver
              ? "border-toxic bg-toxic/15"
              : "border-ink/20 bg-surface hover:border-ink/40",
          )}
        >
          <input
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) takeFile(file);
            }}
          />
          <span className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Брось резюме сюда
          </span>
          <span className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            PDF или DOCX · до 8 МБ
          </span>
          {fileName ? (
            <span className="mt-5 border border-signal/30 bg-signal/5 px-3 py-1.5 font-mono text-sm text-signal">
              {fileName}
            </span>
          ) : null}
        </motion.label>
      ) : (
        <div className="border border-ink/12 bg-surface p-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={11}
            placeholder="Вставь текст резюме…"
            className="w-full resize-y bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-muted/70"
          />
          <Button
            className="mt-4"
            disabled={disabled || text.trim().length < 80}
            onClick={() => {
              if (text.trim().length < 80) {
                setError("Слишком коротко — даже прожаривать нечего.");
                return;
              }
              setError(null);
              track("resume_uploaded", { mime: "text/plain" });
              onTextSubmit?.(text.trim());
            }}
          >
            Передать на стол
          </Button>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-sm text-roast" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Результат приватный · публичная ссылка только по твоему действию
        </p>
      )}
    </div>
  );
}
