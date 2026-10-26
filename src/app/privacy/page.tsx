import type { Metadata } from "next";
import { PageContainer, PageIntro, PrimaryAction, SecondaryAction } from "@/components/ui/system";

export const metadata: Metadata = { title: "Приватность" };

const sections = [
  { title: "Что хранится", text: "Загруженный файл, текст без прямых контактов, результаты разборов, сохранённые версии и вакансии." },
  { title: "Что получает AI-провайдер", text: "Текст для разбора без email, телефонов и других очевидных контактных данных." },
  { title: "Что видно по публичной ссылке", text: "Выбранный результат, несколько метрик и цитата. Имя, контакты и компании в карточку не входят." },
  { title: "Как удалить данные", text: "В кабинете открой «Настройки» и выбери удаление. Публичные ссылки отключатся, файлы и тексты будут удалены, аккаунт — обезличен." },
  { title: "Поддержка и возврат", text: "По вопросам оплаты и возврата используй канал поддержки из платёжной квитанции. Укажи email аккаунта и номер платежа." },
];

export default function PrivacyPage() {
  return (
    <main id="main">
      <PageContainer className="ds-plain-page">
        <PageIntro title="Что происходит с резюме." lead="Резюме не становится публичным автоматически. Ссылку создаёшь только ты." />
        <div className="ds-plain-sections">
          {sections.map(({ title, text }) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}
        </div>
        <div className="ds-plain-actions">
          <SecondaryAction href="/settings">Настройки данных</SecondaryAction>
          <PrimaryAction href="/">На главную</PrimaryAction>
        </div>
      </PageContainer>
    </main>
  );
}
