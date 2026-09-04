# ToxicHR — Roadmap

> Пользователь приходит проверить резюме → остаётся из-за точности → исследует вакансии → платит за персональную работу → получает новую версию → повторно проверяет результат.
> Язык: RU. Первый платный продукт закрытой беты — пакет ToxicHR за 199 ₽.

Живой прогресс: [`BURNDOWN.md`](../BURNDOWN.md)
Активный план до закрытой беты: [`docs/RELEASE-PLAN.md`](./RELEASE-PLAN.md)

---

## Статус продукта

**Подготовка к закрытой бете.**  
Цель визуала: **top-tier premium editorial brutality**.

| Слой | Статус |
|------|--------|
| Review loop | shipped |
| Viral (share / toast / challenge) | shipped |
| Auth / history | shipped |
| Product analytics / referral funnel | shipped |
| Resume improvement | shipped, переводится на пакетный доступ |
| Vacancy review / resume match | shipped, переводится на пакетный доступ |
| Package Model | Sprint 1.1 ACTIVE |
| Vacancy-specific adaptation | Sprint 2 PLANNED |
| UX / design unification | Sprint 3 PLANNED |
| Full journey / states | Sprint 4 PLANNED |
| Real beta calibration | Sprint 5 PLANNED |
| Release hardening | Sprint 6 PLANNED |

---

## Visual production track

| Pass | Scope | Status |
|------|-------|--------|
| V1 | Tokens, landing, seals, personas, verdict, upload | done |
| V2 | Report, share, pricing, auth, start | done |
| V3 | History, settings, a11y, mobile targets | done |

В Sprint 3 существующие экраны повторно унифицируются уже вокруг фактической продуктовой воронки и пакетной модели.

---

## Feature board

Бесплатный разбор резюме, второй HR-взгляд, standalone-разбор вакансий и share: **бесплатный входной контур**.

### Целевой продуктовый цикл закрытой беты

`резюме → бесплатный разбор → второй HR → standalone-вакансия → пакет ToxicHR → персональные match → improvement / vacancy-specific adaptation → re-check → кабинет / история`

Пользователь не покупает отдельные AI-вызовы и не видит внутренние токены или кредиты.

### Монетизация

В закрытой бете действует **один пакет ToxicHR за 199 ₽**, без подписки и дополнительных платежей внутри пакета.

Пакет привязан к текущему резюме и включает:

- все 4 HR-взгляда по текущему резюме;
- до 5 персональных сопоставлений резюме с вакансиями;
- 1 универсальное улучшение резюме;
- 1 адаптацию резюме под конкретную вакансию;
- до 5 повторных сопоставлений после изменения или адаптации резюме.

Standalone-разбор вакансий остаётся бесплатным и не расходует пакет.

Система должна хранить и показывать остатки доступных действий; сервер обязан предотвращать обход лимитов и не списывать действие за неуспешный AI-запуск или простое повторное открытие уже готового результата.

---

## Порядок дальнейшей работы

1. Sprint 1.1 — Package Model.
2. Sprint 2 — Vacancy-specific adaptation внутри уже купленного пакета.
3. Sprint 3 — UX/UI unification с корректными CTA, состояниями пакета и остатками.
4. Sprint 4 — полный пользовательский путь, ошибки, refresh/back/forward/payment return и сохранение контекста.
5. Sprint 5 — проверка качества на реальных резюме и вакансиях плюс наблюдение за фактическим потреблением пакета.
6. Sprint 6 — production hardening, YooKassa, аналитика, privacy, deploy и финальный smoke.

---

## NOT now

Мягкий режим, голосовые персонажи, мобильное приложение, лента, B2B, автоотклики, подписка, сложные тарифы и десятки персонажей.
