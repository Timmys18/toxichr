import { test, expect } from "@playwright/test";
import { passwordResetEmailConfigured, sendPasswordResetEmail } from "../../src/lib/password-reset-email";

test("reset mail uses protected settings and reports provider failures", async () => {
  const original = {
    fetch: globalThis.fetch,
    key: process.env.RESEND_API_KEY,
    from: process.env.PASSWORD_RESET_FROM_EMAIL,
    url: process.env.NEXT_PUBLIC_APP_URL,
    resetUrl: process.env.PASSWORD_RESET_APP_URL,
  };
  process.env.RESEND_API_KEY = "test-only-key";
  process.env.PASSWORD_RESET_FROM_EMAIL = "ToxicHR <reset@example.test>";
  process.env.PASSWORD_RESET_APP_URL = "https://toxichr.example";
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    expect(input).toBe("https://api.resend.com/emails");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-only-key" });
    const body = JSON.parse(String(init?.body));
    expect(body.to).toEqual(["person@example.test"]);
    expect(body.text).toContain("https://toxichr.example/auth?reset=one-use-token");
    return new Response(JSON.stringify({ id: "test-mail" }), { status: 200 });
  };
  try {
    expect(passwordResetEmailConfigured()).toBe(true);
    await sendPasswordResetEmail("person@example.test", "one-use-token");
    expect(calls).toBe(1);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await expect(sendPasswordResetEmail("person@example.test", "one-use-token")).rejects.toThrow("503");
    delete process.env.RESEND_API_KEY;
    expect(passwordResetEmailConfigured()).toBe(false);
  } finally {
    globalThis.fetch = original.fetch;
    for (const [name, value] of [["RESEND_API_KEY", original.key], ["PASSWORD_RESET_FROM_EMAIL", original.from], ["NEXT_PUBLIC_APP_URL", original.url], ["PASSWORD_RESET_APP_URL", original.resetUrl]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
