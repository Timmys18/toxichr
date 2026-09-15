"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { track } from "@/lib/analytics";
import { FormCard, PageContainer, PrimaryAction } from "@/components/ui/system";
import { requestErrorMessage } from "@/lib/user-facing-errors";

type Mode = "login" | "register";

export function AuthClient() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next");
  const nextUrl =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/me";
  const analysisId = params.get("analysisId") || undefined;

  const [mode, setMode] = useState<Mode>(analysisId ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

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
            consent,
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
        const claimResponse = await fetch(`/api/analyses/${analysisId}/claim`, {
          method: "POST",
        });
        if (!claimResponse.ok) {
          throw new Error("Не удалось привязать разбор к аккаунту. Попробуй ещё раз — сам разбор сохранён.");
        }
      }

      router.push(nextUrl);
      router.refresh();
    } catch (err) {
      setError(requestErrorMessage(err, "Не удалось продолжить. Данные формы и разбор сохранены — попробуй ещё раз."));
      setBusy(false);
    }
  }

  async function requestReset() {
    setResetMessage(null); setError(null);
    const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error); return; }
    setResetMessage(data.resetToken ? `Ссылка для восстановления готова для локальной проверки: /auth?reset=${data.resetToken}` : data.message);
  }

  return (
    <div className="ds-auth-page">
      <PageContainer>
        <FormCard
          label={analysisId ? "Сохраним разбор?" : "Вход в ToxicHR"}
          title={mode === "login" ? "С возвращением" : "Пара секунд — и готово"}
          description={analysisId ? "Аккаунт привяжет разбор к тебе — появятся история и динамика правок." : "Почта и пароль. Без анкет и лишних шагов."}
          footer={<>Резюме приватно. Публичной ссылки нет, пока сам не создашь. <Link href="/">На главную</Link></>}
        >
          <form className="ds-auth-form" onSubmit={submit}>
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
          {mode === "register" ? (
            <label className="ds-consent-field">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                required
              />
              <span>
                Согласен с <Link href="/privacy" target="_blank">правилами приватности</Link> и обработкой резюме для работы сервиса.
              </span>
            </label>
          ) : null}
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
            <p className="ds-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <PrimaryAction
            type="submit"
            className="ds-auth-submit"
            disabled={busy || (mode === "register" && !consent)}
          >
            {busy ? "Секунду…" : mode === "login" ? "Войти" : "Создать аккаунт"}
          </PrimaryAction>
          {mode === "login" ? <button type="button" className="ds-inline-link" onClick={() => { setForgot(true); void requestReset(); }}>Забыли пароль?</button> : null}
          {forgot ? <p className="ds-form-note">Укажи email выше, чтобы запросить новую ссылку. {resetMessage}</p> : null}
          </form>

        <div className="ds-auth-switch">
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
        </FormCard>
      </PageContainer>
    </div>
  );
}
