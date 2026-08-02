"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { track } from "@/lib/analytics";

type Mode = "login" | "register";

export function AuthClient() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get("next") || "/me";
  const analysisId = params.get("analysisId") || undefined;

  const [mode, setMode] = useState<Mode>(analysisId ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            displayName: name || undefined,
            analysisId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Не удалось создать аккаунт");
        track("auth_registered", {});
      }

      const signRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (signRes?.error) {
        throw new Error(
          mode === "login"
            ? "Неверная почта или пароль."
            : "Аккаунт создан, но войти не вышло. Попробуй войти вручную.",
        );
      }

      if (analysisId) {
        await fetch(`/api/analyses/${analysisId}/claim`, {
          method: "POST",
        }).catch(() => null);
      }

      router.push(nextUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
      setBusy(false);
    }
  }

  return (
    <div className="authwrap">
      <div className="auth">
        <div className="k thr-mono">
          {analysisId ? "Сохраним разбор?" : "Вход в ToxicHR"}
        </div>
        <h2>{mode === "login" ? "С возвращением" : "Пара секунд — и готово"}</h2>
        <p>
          {analysisId
            ? "Аккаунт привяжет разбор к тебе — появятся история и динамика правок."
            : "Почта и пароль. Без анкет и лишних шагов."}
        </p>

        <form onSubmit={submit}>
          {mode === "register" ? (
            <input
              type="text"
              placeholder="Имя (по желанию)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          ) : null}
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder={mode === "register" ? "Пароль (от 8 символов)" : "Пароль"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />
          {error ? (
            <p className="err" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="thr-btn thr-btn-tox sub"
            disabled={busy}
          >
            {busy ? "Секунду…" : mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>

        <div className="switch">
          {mode === "login" ? (
            <>
              Нет аккаунта?{" "}
              <button type="button" onClick={() => setMode("register")}>
                Зарегистрироваться
              </button>
            </>
          ) : (
            <>
              Уже есть аккаунт?{" "}
              <button type="button" onClick={() => setMode("login")}>
                Войти
              </button>
            </>
          )}
        </div>

        <div className="fine">
          Резюме приватно. Публичной ссылки нет, пока сам не создашь.{" "}
          <Link href="/">На главную</Link>
        </div>
      </div>

      <style jsx>{`
        .authwrap {
          min-height: calc(100vh - 68px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
        }
        .auth {
          width: 400px;
          max-width: 100%;
          border: 1px solid var(--hair2);
          border-radius: 24px;
          background: linear-gradient(180deg, var(--metal-1), var(--metal-0));
          padding: 36px;
          animation: thr-fade 0.6s var(--ease);
        }
        .k {
          font-size: 10.5px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--tox);
        }
        .auth h2 {
          font-weight: 700;
          font-size: 26px;
          letter-spacing: -0.03em;
          margin-top: 12px;
        }
        .auth p {
          font-size: 14px;
          color: var(--dim);
          margin-top: 10px;
          line-height: 1.55;
        }
        form {
          margin-top: 22px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        input {
          width: 100%;
          background: var(--metal-2);
          border: 1px solid var(--hair2);
          border-radius: 14px;
          height: 52px;
          padding: 0 18px;
          color: var(--fg);
          font-family: inherit;
          font-size: 15px;
          outline: none;
          transition: 0.2s;
        }
        input:focus {
          border-color: var(--tox);
        }
        input::placeholder {
          color: var(--faint);
        }
        .err {
          color: var(--crit);
          font-size: 13px;
          margin: 2px 0 0;
        }
        .sub {
          width: 100%;
          height: 52px;
          justify-content: center;
          margin-top: 4px;
          font-size: 15px;
        }
        .switch {
          margin-top: 18px;
          font-size: 13.5px;
          color: var(--dim);
          text-align: center;
        }
        .switch button {
          background: none;
          border: none;
          color: var(--tox);
          font-family: inherit;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .fine {
          margin-top: 20px;
          font-size: 11.5px;
          color: var(--faint);
          line-height: 1.5;
          text-align: center;
        }
        .fine :global(a) {
          color: var(--dim);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
