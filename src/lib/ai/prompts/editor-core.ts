export const EDITOR_CORE_VERSION = "editor-core@1.0";

/** Вызывается только после детерминированного провала writer-ответа. */
export function editorPrompt(errors: string[]): string {
  return `Исправь JSON результата ToxicHR. Верни только JSON той же структуры. Не добавляй новых фактов и не меняй ссылки на findingIds. Исправь только эти нарушения: ${errors.join("; ")}.`;
}
