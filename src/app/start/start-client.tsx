"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UploadDropzone } from "@/components/upload/upload-dropzone";
import { track } from "@/lib/analytics";
import type { PublicSharePayload } from "@/lib/public-share";
import {
  getOrCreateVisitorId,
  readReferral,
  rememberReferral,
} from "@/lib/referral-client";

export function StartClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<PublicSharePayload | null>(null);

  useEffect(() => {
    const ref =
      searchParams.get("ref") ??
      searchParams.get("challenge") ??
      readReferral()?.slug;
    const campaign =
      searchParams.get("campaign") ??
      (searchParams.get("challenge") ? "challenge" : "toast");

    if (!ref) return;

    rememberReferral({ slug: ref, campaign });
    const visitorId = getOrCreateVisitorId();

    void fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: ref,
        visitorId,
        campaign,
        platform: "start",
      }),
    });

    void fetch(`/api/public-shares/${ref}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.payload) setChallenge(data.payload);
      })
      .catch(() => null);
  }, [searchParams]);

  const goToPersonas = useCallback(
    (resumeId: string) => {
      track("resume_upload_started");
      const ref = readReferral();
      if (ref) {
        void fetch("/api/referrals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: "started",
            visitorId: getOrCreateVisitorId(),
            slug: ref.slug,
            resumeId,
          }),
        });
      }
      router.push(`/personas?resumeId=${resumeId}`);
    },
    [router],
  );

  const submitText = useCallback(
    async (text: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/resumes/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
        goToPersonas(data.resumeId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить");
      } finally {
        setLoading(false);
      }
    },
    [goToPersonas],
  );

  const submitFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/resumes/upload", {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
        goToPersonas(data.resumeId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить");
      } finally {
        setLoading(false);
      }
    },
    [goToPersonas],
  );

  return (
    <div className="w-full max-w-xl space-y-5">
      {challenge ? (
        <div className="border-2 border-roast/40 bg-roast/[0.06] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-roast">
            Challenge · соперник уже в деле
          </p>
          <p className="mt-3 font-display text-2xl tracking-tight text-ink">
            {challenge.scoreTotal}/100 · «{challenge.verdictTitle}»
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {challenge.personaName}: «{challenge.quote}»
          </p>
        </div>
      ) : null}

      <UploadDropzone
        disabled={loading}
        onFileSelected={submitFile}
        onTextSubmit={submitText}
      />

      {loading ? (
        <p className="font-mono text-sm text-signal">Читаем показания…</p>
      ) : null}

      {error ? (
        <p className="text-sm text-roast" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
