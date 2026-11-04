const RESET_EMAIL_ENDPOINT = "https://api.resend.com/emails";

function resetBaseUrl() {
  return process.env.PASSWORD_RESET_APP_URL || (process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_APP_URL : undefined);
}

export function passwordResetEmailConfigured() {
  const appUrl = resetBaseUrl();
  if (!process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_FROM_EMAIL || !appUrl) return false;
  try {
    const parsed = new URL(appUrl);
    return parsed.protocol === "https:" || (process.env.NODE_ENV !== "production" && parsed.protocol === "http:");
  } catch {
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, token: string) {
  if (!passwordResetEmailConfigured()) throw new Error("Password reset email is not configured");

  const url = new URL("/auth", resetBaseUrl());
  url.searchParams.set("reset", token);
  const response = await fetch(RESET_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.PASSWORD_RESET_FROM_EMAIL,
      to: [email],
      subject: "Сброс пароля ToxicHR",
      text: `Чтобы задать новый пароль, открой ссылку в течение 30 минут: ${url.toString()}\n\nЕсли ты не запрашивал сброс, проигнорируй это письмо.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Password reset email provider returned ${response.status}`);
}
