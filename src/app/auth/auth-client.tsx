"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function AuthClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const analysisId = searchParams.get("analysisId");
  const next = searchParams.get("next") ?? "/history";

  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function claimIfNeeded() {
    if (!analysisId) return;
    await fetch(`/api/analyses/${analysisId}/claim`, { method: "POST" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, analysisId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Регистрация не удалась");
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error(
          mode === "login"
            ? "Неверный email или пароль"
            : "Войти после регистрации не удалось",
        );
      }

      if (mode === "login") {
        await claimIfNeeded();
      }

      track(mode === "register" ? "auth_registered" : "analysis_claimed", {
        hasAnalysis: Boolean(analysisId),
      });

      router.push(
        analysisId
          ? `${next}${next.includes("?") ? "&" : "?"}analysisId=${analysisId}`
          : next,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-md"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
        После ценности
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-tight text-ink sm:text-5xl">
        {mode === "register" ? "Сохранить приговор" : "С возвращением"}
      </h1>
      <p className="mt-4 text-muted leading-relaxed">
        Аккаунт — для истории, полного отчёта и новых загрузок. Результат ты
        уже получил.
      </p>

      <div className="mt-8 flex border border-ink/10 bg-surface p-1">
        {(
          [
            ["register", "Регистрация"],
            ["login", "Вход"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "flex-1 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
              mode === id ? "bg-ink text-paper" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-ink/15 bg-surface px-3.5 py-3 text-ink outline-none transition-colors focus:border-ink/45"
            autoComplete="email"
          />
        </label>
        <label className="block space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Пароль · минимум 8
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-ink/15 bg-surface px-3.5 py-3 text-ink outline-none transition-colors focus:border-ink/45"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />
        </label>

        {error ? (
          <p className="text-sm text-roast" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading
            ? "Секунду…"
            : mode === "register"
              ? "Создать аккаунт"
              : "Войти"}
        </Button>
      </form>

      {analysisId ? (
        <p className="mt-5 border border-toxic/30 bg-toxic/10 px-3 py-2 font-mono text-[11px] text-ink">
          Приговор будет привязан к аккаунту после входа.
        </p>
      ) : null}
    </motion.div>
  );
}
