const KEY = "toxichr:pending-vacancy";

export function savePendingVacancy(text: string): void {
  if (typeof window === "undefined") return;
  const value = text.trim();
  if (!value) return;
  try {
    window.localStorage.setItem(KEY, value.slice(0, 30_000));
  } catch {
    // Private browsing or a strict browser policy may disable local storage.
  }
}

export function readPendingVacancy(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function clearPendingVacancy(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clean when storage is unavailable.
  }
}
