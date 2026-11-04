import type { Metadata } from "next";
import { TOXICHR_PACKAGE_PRICE_RUB } from "@/lib/package";
import { PageContainer, PageIntro, PrimaryAction } from "@/components/ui/system";

export const metadata: Metadata = { title: "Условия покупки" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();
  return (
    <main id="main">
      <PageContainer className="ds-plain-page">
        <PageIntro title="Условия покупки." lead={`Пакет ToxicHR — ${TOXICHR_PACKAGE_PRICE_RUB} ₽ за одно резюме. Подписки нет.`} />
        <div className="ds-plain-sections">
          <section><h2>Что входит</h2><p>Четыре HR-взгляда, до пяти сопоставлений с вакансиями, одно улучшение, одна адаптация и до пяти повторных проверок для этого резюме.</p></section>
          <section><h2>Когда откроется доступ</h2><p>После подтверждения оплаты YooKassa пакет появится в твоём кабинете. Если подтверждение задерживается, вернись к разбору: статус оплаты проверится снова.</p></section>
          <section><h2>Если оплата не прошла</h2><p>Пакет не откроется и лимиты не изменятся. Можно повторить попытку из того же разбора.</p></section>
          <section><h2>Помощь и возврат</h2><p>{supportEmail ? <>Напиши на <a href={`mailto:${supportEmail}`}>{supportEmail}</a> с email аккаунта и номером платежа. Опиши, что не получилось: мы проверим статус оплаты и ответим по обращению. Резюме в письме не требуется.</> : "Контакт для обращений появится до открытия оплаты."}</p></section>
        </div>
        <div className="ds-plain-actions"><PrimaryAction href="/pricing">К ценам</PrimaryAction></div>
      </PageContainer>
    </main>
  );
}
