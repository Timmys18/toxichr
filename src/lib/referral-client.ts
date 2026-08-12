const VISITOR_KEY = "toxichr_vid";
const REF_KEY = "toxichr_ref";

export type StoredReferral = {
  slug: string;
  campaign: string;
  platform?: string;
  referralId?: string;
};

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(VISITOR_KEY, id);
  return id;
}

export function rememberReferral(ref: StoredReferral) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(REF_KEY, JSON.stringify(ref));
  window.localStorage.setItem(REF_KEY, JSON.stringify(ref));
}

export function readReferral(): StoredReferral | null {
  if (typeof window === "undefined") return null;
  const raw =
    window.sessionStorage.getItem(REF_KEY) ??
    window.localStorage.getItem(REF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredReferral;
    if (!parsed.slug) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearReferral() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(REF_KEY);
}

export async function updateReferral(
  stage: "started" | "completed",
  data: { resumeId?: string; analysisId?: string },
) {
  const ref = readReferral();
  if (!ref) return;

  const visitorId = getOrCreateVisitorId();
  const response = await fetch("/api/referrals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage,
      slug: ref.slug,
      visitorId,
      ...data,
    }),
    keepalive: true,
  });

  if (response.ok && stage === "completed") clearReferral();
}
