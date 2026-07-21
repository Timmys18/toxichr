"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SettingsClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    if (confirm !== "УДАЛИТЬ") {
      setError("Введи УДАЛИТЬ заглавными буквами.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось удалить");
      await signOut({ redirect: false });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-10">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
          Приватность · контроль
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-ink sm:text-5xl">
          Настройки
        </h1>
        <p className="mt-4 text-muted leading-relaxed">
          {session?.user?.email
            ? `Аккаунт: ${session.user.email}`
            : "Нужен вход."}
        </p>
      </header>

      <section className="border border-ink/12 bg-surface p-6 space-y-4">
        <h2 className="font-display text-2xl tracking-tight text-ink">
          Сессия
        </h2>
        <p className="text-sm text-muted">
          Выход не удаляет историю. Данные остаются, пока ты не удалишь аккаунт.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Выйти
          </Button>
          <Button href="/history" variant="ghost">
            К истории
          </Button>
        </div>
      </section>

      <section className="border-2 border-roast/35 bg-roast/[0.05] p-6 space-y-4">
        <h2 className="font-display text-2xl tracking-tight text-ink">
          Удалить данные
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Отключим публичные ссылки, пометим резюме удалёнными и обезличим
          аккаунт. Действие необратимо.
        </p>
        <label className="block space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Напиши УДАЛИТЬ
          </span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-ink/15 bg-paper px-3.5 py-3 outline-none focus:border-ink/40"
            aria-describedby="delete-hint"
          />
        </label>
        <p id="delete-hint" className="font-mono text-[11px] text-muted">
          Только заглавными: УДАЛИТЬ
        </p>
        {error ? (
          <p className="text-sm text-roast" role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="danger" onClick={deleteAccount} disabled={loading}>
          {loading ? "Удаляем…" : "Удалить аккаунт и данные"}
        </Button>
      </section>
    </div>
  );
}
