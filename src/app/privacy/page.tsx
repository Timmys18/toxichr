import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/shared/top-nav";

export const metadata: Metadata = { title: "Приватность" };

export default function PrivacyPage() {
  return (
    <>
      <TopNav />
      <main id="main" className="privacy">
        <p className="over thr-mono">Приватность без мелкого шрифта</p>
        <h1>Что происходит с резюме</h1>
        <p className="lead">
          Коротко: резюме не становится публичным автоматически и не должно
          попадать в открытую карточку. Публичную ссылку создаёт только сам пользователь.
        </p>

        <section>
          <h2>Что хранится</h2>
          <p>Загруженный файл, очищенный от прямых контактов текст, результаты разборов, сохранённые версии и вакансии.</p>
        </section>
        <section>
          <h2>Что получает AI-провайдер</h2>
          <p>Только очищенный текст, необходимый для разбора. Перед отправкой сервис удаляет email, телефоны и другие очевидные контактные данные.</p>
        </section>
        <section>
          <h2>Что видно по публичной ссылке</h2>
          <p>Выбранный результат, несколько метрик и цитата. Имя, контакты и компании не включаются в публичную карточку.</p>
        </section>
        <section>
          <h2>Как удалить данные</h2>
          <p>В кабинете открой «Настройки» и выбери удаление. Публичные ссылки отключатся, загруженные файлы и тексты будут удалены, аккаунт — обезличен.</p>
        </section>

        <div className="actions">
          <Link href="/settings" className="thr-btn thr-btn-line">Настройки данных</Link>
          <Link href="/" className="thr-btn thr-btn-tox">На главную</Link>
        </div>
      </main>
      <style>{`
        .privacy{width:min(760px,calc(100% - 36px));margin:0 auto;padding:54px 0 90px}.privacy .over{color:var(--tox);font-size:10px;letter-spacing:.18em;text-transform:uppercase}
        .privacy h1{margin-top:12px;font-size:clamp(36px,6vw,64px);letter-spacing:-.05em;line-height:1.02}.privacy .lead{margin-top:20px;color:var(--dim);font-size:17px;line-height:1.65}
        .privacy section{margin-top:18px;padding:22px 24px;border:1px solid var(--hair);border-radius:18px;background:var(--metal-0)}.privacy h2{font-size:18px}.privacy section p{margin-top:8px;color:var(--dim);font-size:14px;line-height:1.65}
        .privacy .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.privacy .actions a{min-height:50px;padding:0 22px;text-decoration:none}
      `}</style>
    </>
  );
}
