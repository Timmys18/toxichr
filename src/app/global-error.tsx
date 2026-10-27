"use client";

import styles from "./global-error.module.css";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ru">
      <body className={styles.body}>
        <main className={styles.main}>
          <div className={styles.content}>
            <p className={styles.label}>
              ToxicHR · критический сбой
            </p>
            <h1>
              Интерфейс не загрузился
            </h1>
            <p className={styles.description}>
              Данные не исчезли. Перезапусти экран — чаще всего этого достаточно.
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              className={styles.action}
            >
              Перезапустить экран
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
