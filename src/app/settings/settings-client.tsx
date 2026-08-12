"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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
    <div className="settings">
      <header>
        <div className="over thr-mono">Приватность · контроль</div>
        <h1>Настройки</h1>
        <p className="acc">
          {session?.user?.email
            ? `Аккаунт: ${session.user.email}`
            : "Нужен вход."}
        </p>
      </header>

      <section className="panel">
        <h2>Сессия</h2>
        <p>
          Выход не удаляет историю. Данные остаются, пока ты не удалишь аккаунт.
        </p>
        <div className="row">
          <button
            className="thr-btn thr-btn-line"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Выйти
          </button>
          <Link href="/me" className="thr-btn thr-btn-line">
            В кабинет
          </Link>
          <Link href="/privacy" className="thr-btn thr-btn-line">
            Правила приватности
          </Link>
        </div>
      </section>

      <section className="panel danger">
        <h2>Удалить данные</h2>
        <p>
          Отключим публичные ссылки, удалим загруженные файлы и тексты,
          затем обезличим аккаунт. Действие необратимо.
        </p>
        <label>
          <span className="lab thr-mono">Напиши УДАЛИТЬ</span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="УДАЛИТЬ"
          />
        </label>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="thr-btn del"
          onClick={deleteAccount}
          disabled={loading}
        >
          {loading ? "Удаляем…" : "Удалить аккаунт и данные"}
        </button>
      </section>

      <style jsx>{`
        .settings {
          max-width: 560px;
          margin: 0 auto;
          padding: 44px 20px 80px;
          animation: thr-fade 0.6s var(--ease);
        }
        .over {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--faint);
        }
        h1 {
          font-weight: 800;
          font-size: clamp(30px, 4.4vw, 44px);
          letter-spacing: -0.04em;
          margin-top: 12px;
        }
        .acc {
          margin-top: 14px;
          color: var(--dim);
          font-size: 14.5px;
        }
        .panel {
          margin-top: 28px;
          border: 1px solid var(--hair);
          border-radius: 18px;
          background: var(--metal-0);
          padding: 26px;
        }
        .panel.danger {
          border-color: rgba(255, 86, 71, 0.32);
          background: rgba(255, 86, 71, 0.04);
        }
        .panel h2 {
          font-weight: 700;
          font-size: 20px;
          letter-spacing: -0.02em;
        }
        .panel p {
          margin-top: 10px;
          font-size: 14px;
          line-height: 1.6;
          color: var(--dim);
        }
        .row {
          margin-top: 18px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .row :global(.thr-btn) {
          height: 46px;
          padding: 0 22px;
          font-size: 14px;
          text-decoration: none;
        }
        label {
          display: block;
          margin-top: 18px;
        }
        .lab {
          display: block;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--faint);
          margin-bottom: 8px;
        }
        input {
          width: 100%;
          background: var(--metal-2);
          border: 1px solid var(--hair2);
          border-radius: 12px;
          height: 48px;
          padding: 0 16px;
          color: var(--fg);
          font-family: inherit;
          font-size: 15px;
          outline: none;
        }
        input:focus {
          border-color: var(--crit);
        }
        .err {
          color: var(--crit);
          font-size: 13.5px;
          margin-top: 12px;
        }
        .del {
          margin-top: 18px;
          height: 48px;
          padding: 0 24px;
          background: var(--crit);
          color: #fff;
          font-weight: 700;
        }
        .del:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
