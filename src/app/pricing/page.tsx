import type { Metadata } from "next";
import { TOXICHR_PACKAGE_PRICE_RUB } from "@/lib/package";
import { ServicePage } from "@/components/ui/page-templates";
import { InfoNote, OfferCard, PageContainer, PageIntro, PrimaryAction, SecondaryAction } from "@/components/ui/system";

export const metadata: Metadata = { title: "Цены" };

const FREE = [
  "Полное заключение HR без урезаний",
  "Факты и цитаты из резюме",
  "Первый HR-разбор и ещё один взгляд",
  "Публичная карточка и шаринг",
  "Самостоятельный разбор вакансии",
];

const PACKAGE = [
  "Все 4 HR-взгляда для текущего резюме",
  "До 5 сопоставлений с вакансиями",
  "Одно полноценное улучшение резюме",
  "Одна адаптация резюме под выбранную вакансию",
  "До 5 повторных проверок после новой версии",
];

export default function PricingPage() {
  return (
    <ServicePage>
      <main id="main" className="ds-pricing-page">
        <PageContainer>
          <PageIntro label="Цены без сюрпризов" title="Понять проблему — бесплатно. Дальше — один пакет." lead="Никакой подписки и мелких платежей. Один пакет ToxicHR для работы с текущим резюме." />

          <div className="ds-offer-grid">
            <OfferCard label="Разбор + вакансии" price="0 ₽" priceNote="без урезаний" items={FREE} action={<SecondaryAction href="/">Проверить резюме</SecondaryAction>} />
            <OfferCard highlighted label="Пакет ToxicHR" badge="цена беты" price={`${TOXICHR_PACKAGE_PRICE_RUB} ₽`} priceNote="одно резюме" description="Не покупаешь каждый шаг отдельно. Пакет открывает персональную работу с резюме и выбранными вакансиями." items={PACKAGE} action={<PrimaryAction href="/">Сначала получить бесплатный разбор</PrimaryAction>} />
          </div>

          <InfoNote title="Почему оплата только здесь?">Бесплатно ты видишь основной разбор, второй HR-взгляд, share и самостоятельный разбор вакансии. Пакет за 199 ₽ не подписка: внутри нет повторных оплат.</InfoNote>
          <InfoNote title="Если что-то пошло не так">Оплата открывает доступ к пакету для текущего резюме. Неуспешная или отменённая операция доступ не открывает. Запрос на возврат или помощь подготовь через канал поддержки, указанный в платёжной квитанции; реквизиты здесь не дублируем.</InfoNote>
        </PageContainer>
      </main>
    </ServicePage>
  );
}
