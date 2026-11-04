import type { Metadata } from "next";
import { PageContainer, PageIntro, PrimaryAction, SecondaryAction } from "@/components/ui/system";

export const metadata: Metadata = { title: "Приватность" };
export const dynamic = "force-dynamic";

const sections = [
  { title: "Что хранится", text: "Загруженный файл, текст без прямых контактов, результаты разборов, сохранённые версии и вакансии." },
  { title: "Что получает AI-провайдер", text: "Текст для разбора без email, телефонов и других очевидных контактных данных." },
  { title: "Что видно по публичной ссылке", text: "Выбранный результат разбора. Ссылка создаётся только по твоему действию; её можно отключить в кабинете." },
  { title: "Как удалить данные", text: "В кабинете открой «Настройки» и выбери удаление. Публичные ссылки отключатся, файлы и тексты будут удалены, аккаунт — обезличен." },
];

export default function PrivacyPage() {
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();
  return (
    <main id="main">
      <PageContainer className="ds-plain-page">
        <PageIntro title="Что происходит с резюме." lead="Резюме не становится публичным автоматически. Ссылку создаёшь только ты." />
        <div className="ds-plain-sections">
          {sections.map(({ title, text }) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}
          <section><h2>Поддержка и возврат</h2><p>{supportEmail ? <>Напиши на <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Для вопроса об оплате укажи email аккаунта и номер платежа. Резюме в письме присылать не нужно.</> : "Адрес поддержки будет опубликован до открытия оплаты."}</p></section>
        </div>
        <div className="ds-plain-actions">
          <SecondaryAction href="/settings">Настройки данных</SecondaryAction>
          <PrimaryAction href="/">На главную</PrimaryAction>
        </div>
      </PageContainer>
    </main>
  );
}
