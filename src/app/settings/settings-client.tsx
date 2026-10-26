"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PageIntro, PrimaryAction, SecondaryAction, SurfacePanel } from "@/components/ui/system";

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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ds-settings-page">
      <PageIntro title="Настройки." lead={session?.user?.email ?? "Нужен вход."} />
      <SurfacePanel>
        <h2>Аккаунт</h2>
        <p>Выход не удаляет историю.</p>
        <div className="ds-plain-actions">
          <SecondaryAction type="button" onClick={() => signOut({ callbackUrl: "/" })}>Выйти</SecondaryAction>
          <SecondaryAction href="/privacy">Приватность</SecondaryAction>
        </div>
      </SurfacePanel>
      <SurfacePanel>
        <h2>Удалить данные</h2>
        <p>Публичные ссылки отключатся, файлы и тексты будут удалены, аккаунт — обезличен. Это нельзя отменить.</p>
        <label className="ds-delete-label" htmlFor="delete-confirm">Напиши УДАЛИТЬ
          <input id="delete-confirm" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="УДАЛИТЬ" />
        </label>
        {error ? <p className="ds-form-error" role="alert">{error}</p> : null}
        <PrimaryAction type="button" className="ds-delete-action" onClick={() => void deleteAccount()} disabled={loading}>{loading ? "Удаляем…" : "Удалить аккаунт и данные"}</PrimaryAction>
      </SurfacePanel>
    </div>
  );
}
