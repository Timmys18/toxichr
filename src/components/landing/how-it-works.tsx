"use client";

import { motion } from "motion/react";

const steps = [
  {
    n: "01",
    title: "Бросаешь резюме",
    text: "PDF, DOCX или текст. Без анкеты, вакансии и регистрации.",
  },
  {
    n: "02",
    title: "Выбираешь HR",
    text: "Тамара, Лера, Глеб или Вадик. Один аналитический костяк — разный голос.",
  },
  {
    n: "03",
    title: "Получаешь разбор",
    text: "Живой вердикт выбранного HR, метрики текста и план правок. Можно поржать — и сразу понять, что чинить.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how"
      className="relative border-t border-ink/10 bg-paper-deep/55 px-5 py-20 sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-3xl font-display text-3xl tracking-tight text-ink sm:text-4xl lg:text-[2.75rem]"
        >
          Толерантность? Её тут нет.
        </motion.h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Наши HR не злоупотребляют деликатностью. Зато за пару минут дадут
          честный разбор текста — жёстко, с сарказмом и без оскорблений личности.
        </p>

        <ol className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {steps.map((step, i) => (
            <motion.li
              key={step.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08 }}
              className="relative border-t-2 border-ink pt-6"
            >
              <div className="font-mono text-xs tracking-[0.2em] text-signal">
                {step.n}
              </div>
              <h3 className="mt-4 font-display text-2xl tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted sm:text-[0.95rem]">
                {step.text}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
