"use client";

export function PageSkeleton({ variant = "page" }: { variant?: "page" | "session" | "vacancy" | "history" | "editor" }) {
  const rows = variant === "history" ? 5 : variant === "session" ? 4 : 3;

  return (
    <section className={`page-skeleton ${variant}`} aria-busy="true" aria-label="Загрузка страницы">
      <div className="skeleton-head"><i /><b /><span /></div>
      <div className="skeleton-body">{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>
      <style jsx>{`
        .page-skeleton{width:min(1180px,calc(100% - 48px));min-height:calc(100vh - 78px);margin:0 auto;padding:62px 0 96px}.skeleton-head i,.skeleton-head b,.skeleton-head span,.skeleton-body>span{display:block;background:linear-gradient(90deg,var(--metal-0),var(--metal-1),var(--metal-0));background-size:200% 100%;animation:skeleton-shift 1.15s ease-in-out infinite;border-radius:4px}.skeleton-head i{width:136px;height:13px}.skeleton-head b{width:min(600px,90%);height:64px;margin-top:20px}.skeleton-head span{width:min(460px,72%);height:20px;margin-top:20px}.skeleton-body{display:grid;gap:14px;max-width:100%;margin-top:50px}.skeleton-body>span{height:112px}.history .skeleton-body{max-width:900px}.history .skeleton-body>span{height:84px}.session .skeleton-body{grid-template-columns:300px minmax(0,1fr);grid-template-rows:270px 150px}.session .skeleton-body>span:first-child{grid-row:span 2;height:auto}.vacancy .skeleton-body>span:first-child{height:74px}.editor .skeleton-body>span:first-child{height:360px}@keyframes skeleton-shift{to{background-position:-200% 0}}@media(max-width:720px){.page-skeleton{width:calc(100% - 36px);min-height:calc(100vh - 62px);padding:36px 0 72px}.skeleton-head b{height:46px}.session .skeleton-body{grid-template-columns:1fr;grid-template-rows:none}.session .skeleton-body>span:first-child{grid-row:auto;height:220px}}@media(prefers-reduced-motion:reduce){.skeleton-head i,.skeleton-head b,.skeleton-head span,.skeleton-body>span{animation:none}}
      `}</style>
    </section>
  );
}
