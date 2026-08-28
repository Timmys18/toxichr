import {
  CollapsibleSection,
  CommandRail,
  EditorialSection,
  EmptyState,
  EvidenceItem,
  LeadText,
  MetricStrip,
  PageContainer,
  PageShell,
  PageTitle,
  PrimaryAction,
  SectionLabel,
  SecondaryAction,
  SummaryRail,
  VerdictBlock,
} from "@/components/ui/system";

const metrics = [
  { value: "2", label: "подтверждено" },
  { value: "3", label: "можно доказать" },
  { value: "4", label: "не найдено" },
];

export default function UiKitPage() {
  return (
    <PageShell>
      <PageContainer className="ui-kit">
        <SectionLabel>ToxicHR · внутренняя витрина</SectionLabel>
        <PageTitle>Система без случайных деталей</PageTitle>
        <LeadText>Эта страница — визуальный эталон для продукта. В публичной навигации её нет.</LeadText>

        <section className="ui-block">
          <SectionLabel>Типографика и действия</SectionLabel>
          <h2>Заголовок секции</h2>
          <h3>Подзаголовок и читаемый текст</h3>
          <p>Основной текст всегда остаётся не меньше 16 пикселей. Служебный текст не прячется в декоративную пыль.</p>
          <div className="ui-actions"><PrimaryAction href="/">Главное действие</PrimaryAction><SecondaryAction href="/vacancy">Вторичное действие</SecondaryAction></div>
        </section>

        <section className="ui-block ui-colors"><SectionLabel>Цвета</SectionLabel><span>Фон</span><span>Основной текст</span><span>Вторичный текст</span><span>Акцент</span><span>Проблема</span></section>

        <section className="ui-block">
          <SectionLabel>Строка и метрики</SectionLabel>
          <SummaryRail title="Менеджер продукта" meta="Вакансия сохранена · 1 616 знаков" action={<button type="button" className="ds-inline-link">Изменить</button>} />
          <MetricStrip items={metrics} />
        </section>

        <VerdictBlock label="Вердикт" title="Есть за что цепляться" summary="Опыт в аналитике виден, но связь с продуктовой работой ещё нужно доказать реальными деталями." metrics={metrics} />

        <section className="ui-block">
          <SectionLabel>Редакционная сетка</SectionLabel>
          <EditorialSection title="Что работает на тебя">
            <EvidenceItem title="Финансовое моделирование" description="В резюме есть модели, но не видно объекта расчёта и принятого по нему решения." quote="Формирование финансовых моделей для инвестиционных проектов" />
            <EvidenceItem title="Работа с командой" description="Опыт подтверждён, если назвать состав команды и свою ответственность." />
          </EditorialSection>
        </section>

        <section className="ui-block">
          <SectionLabel>Вторичные блоки</SectionLabel>
          <CollapsibleSection title="Риски и словесный шум"><p>Показываем как дополнительный материал: спокойно и без конкуренции с вердиктом.</p></CollapsibleSection>
          <EmptyState action={<PrimaryAction href="/vacancy">Разобрать вакансию</PrimaryAction>}>Прямых совпадений пока нет. Не приписываем опыт, которого резюме не доказывает.</EmptyState>
        </section>

        <CommandRail primary={<span>Адаптировать резюме под вакансию →</span>} hint="Только на основании подтверждённого опыта" secondary={<SecondaryAction href="/vacancy">Другая вакансия</SecondaryAction>} />
      </PageContainer>
      <style>{`
        .ui-kit{padding:64px 0 100px}.ui-kit>.ds-page-title{margin-top:14px;max-width:900px}.ui-kit>.ds-lead{margin-top:20px}.ui-block{margin-top:64px}.ui-block>h2{margin-top:18px;font-size:34px;letter-spacing:-.035em}.ui-block>h3{margin-top:18px;font-size:22px}.ui-block>p{max-width:66ch;margin-top:12px;color:var(--dim);font-size:16px;line-height:1.6}.ui-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.ui-colors{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.ui-colors>.ds-section-label{grid-column:1/-1}.ui-colors span{min-height:106px;border:1px solid var(--hair);padding:12px;color:var(--fg);font-size:13px;display:flex;align-items:flex-end}.ui-colors span:nth-of-type(1){background:var(--bg)}.ui-colors span:nth-of-type(2){background:var(--fg);color:var(--bg)}.ui-colors span:nth-of-type(3){background:var(--metal-1);color:var(--dim)}.ui-colors span:nth-of-type(4){background:var(--tox);color:#06130c}.ui-colors span:nth-of-type(5){background:var(--crit)}.ui-block .ds-summary-rail{margin-top:20px}.ui-block .ds-metric-strip{margin-top:0}.ui-kit :global(.ds-verdict){margin-top:64px}.ui-kit :global(.ds-command-rail){margin-bottom:0}@media(max-width:820px){.ui-kit{padding:40px 0 72px}.ui-block{margin-top:48px}.ui-colors{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </PageShell>
  );
}
