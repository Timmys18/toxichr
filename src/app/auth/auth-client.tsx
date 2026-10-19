"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { track } from "@/lib/analytics";
import { FormCard, PageContainer, PrimaryAction } from "@/components/ui/system";
import { requestErrorMessage } from "@/lib/user-facing-errors";
import styles from "./auth-client.module.css";

type Mode = "login" | "register" | "forgot" | "reset";

export function AuthClient() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next");
  const nextUrl =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/me";
  const analysisId = params.get("analysisId") || undefined;
  const resetToken = params.get("reset") || undefined;

  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : analysisId ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Не удалось запросить ссылку.");
        setResetMessage(data.resetToken ? `Ссылка для локальной проверки: /auth?reset=${data.resetToken}` : data.message);
        setBusy(false);
        return;
      }
      if (mode === "reset") {
        const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: resetToken, password }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Не удалось сменить пароль.");
        setMode("login"); setPassword(""); setResetMessage("Пароль изменён. Теперь войди."); setBusy(false);
        return;
      }
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
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

  return (
    <div className={`${styles.page} ds-auth-page`}>
      <PageContainer>
        <FormCard
          className={styles.formCard}
          title={<>{mode === "login" ? "Вход" : mode === "register" ? "Регистрация" : mode === "forgot" ? "Сброс пароля" : "Новый пароль"}<span className={styles.dot}>.</span></>}
        >
          <form className={`${styles.form} ds-auth-form`} onSubmit={submit}>
          {mode !== "reset" ? <div className={styles.field}><label htmlFor="auth-email">Почта</label><input id="auth-email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div> : null}
          {mode !== "forgot" ? <div className={styles.field}><label htmlFor="auth-password">{mode === "reset" ? "Новый пароль" : "Пароль"}</label><input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "login" ? undefined : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} /></div> : null}
          {mode === "register" ? <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>Согласен на обработку резюме для работы сервиса. <Link href="/privacy" target="_blank">Условия</Link></span></label> : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {resetMessage ? <p className={styles.message} role="status">{resetMessage}</p> : null}
          <PrimaryAction
            type="submit"
            className={styles.submit}
            disabled={busy || (mode === "register" && !consent)}
          >
            {busy ? "Секунду…" : mode === "login" ? "Войти" : mode === "register" ? "Создать аккаунт" : mode === "forgot" ? "Получить ссылку" : "Сменить пароль"}<span aria-hidden>↗</span>
          </PrimaryAction>
          </form>

        <div className={styles.links}>
          {mode === "login" ? (
            <>
              <button type="button" onClick={() => { setMode("forgot"); setError(null); setResetMessage(null); }}>Забыли пароль?</button>
              <button type="button" onClick={() => { setMode("register"); setError(null); }}>Создать аккаунт</button>
            </>
          ) : (
            <button type="button" onClick={() => { setMode("login"); setError(null); setResetMessage(null); }}>Вернуться ко входу</button>
          )}
        </div>
        </FormCard>
      </PageContainer>
    </div>
  );
}
