import type { Metadata } from "next";
import { TOXICHR_PACKAGE_PRICE_RUB } from "@/lib/package";
import { ServicePage } from "@/components/ui/page-templates";
import { OfferCard, PageContainer, PageIntro, PrimaryAction, SecondaryAction } from "@/components/ui/system";

export const metadata: Metadata = { title: "Цены" };

const FREE = [
  "Первый HR-разбор и второй взгляд",
  "Разбор вакансии",
  "Публичная карточка резюме",
];

const PACKAGE = [
  "Все 4 HR-взгляда",
  "До 5 сопоставлений с вакансиями",
  "Одно улучшение резюме",
  "Одна адаптация под вакансию",
  "До 5 повторных проверок",
];

export default function PricingPage() {
  return (
    <ServicePage>
      <main id="main" className="ds-pricing-page">
        <PageContainer>
          <PageIntro title="Цены." />

          <div className="ds-offer-grid">
            <OfferCard label="Бесплатно" price="0 ₽" priceNote="" items={FREE} action={<SecondaryAction href="/">Начать разбор</SecondaryAction>} />
            <OfferCard highlighted label="Пакет ToxicHR" price={`${TOXICHR_PACKAGE_PRICE_RUB} ₽`} priceNote="за одно резюме" items={PACKAGE} action={<PrimaryAction href="/">Начать бесплатно</PrimaryAction>} />
          </div>
        </PageContainer>
      </main>
    </ServicePage>
  );
}
