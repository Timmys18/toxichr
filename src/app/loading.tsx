export default function Loading() {
  return (
    <main id="main" className="route-loading" aria-live="polite" aria-label="Загрузка страницы">
      <div className="mark thr-mono">TOXIC<span>HR</span></div>
      <div className="bar"><i /></div>
      <p>Загружаем рабочее место…</p>
    </main>
  );
}
