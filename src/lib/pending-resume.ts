const KEY = "toxichr:pending-resume";

export function savePendingResume(text: string): void {
  if (typeof window === "undefined") return;
  try {
    const value = text.trim();
    if (value) window.localStorage.setItem(KEY, value.slice(0, 60_000));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Черновик остаётся в поле, если хранилище браузера недоступно.
  }
}

export function readPendingResume(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function clearPendingResume(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Нечего очищать, если хранилище недоступно.
  }
}
