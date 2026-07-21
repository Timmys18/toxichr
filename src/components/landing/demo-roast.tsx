"use client";

import { motion } from "motion/react";

export function DemoRoast() {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 28, rotate: 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: -0.8 }}
      transition={{ duration: 0.7, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-xl"
      aria-label="Пример прожарки"
    >
      <div
        aria-hidden
        className="absolute -inset-3 translate-x-2 translate-y-3 border border-ink/10 bg-paper-deep/80"
      />
      <div className="relative border border-ink/12 bg-surface p-6 surface-lift sm:p-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            Пример удара · Лера
          </span>
          <span className="stamp px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-roast">
            слабо
          </span>
        </div>

        <blockquote className="font-display text-[1.35rem] leading-[1.2] tracking-tight text-ink sm:text-[1.65rem]">
          «Принимал участие в реализации стратегических проектов.»
        </blockquote>

        <motion.p
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.55, duration: 0.45 }}
          className="mt-6 border-l-2 border-toxic pl-4 font-mono text-sm leading-relaxed text-roast sm:text-[0.95rem]"
        >
          В качестве кого: руководителя, исполнителя или очевидца?
        </motion.p>

        <p className="mt-4 text-sm leading-relaxed text-muted">
          Роль, масштаб и результат — туман. Рекрутер закрыл вкладку, не открыв
          вторую страницу.
        </p>

        <div className="mt-7 grid grid-cols-3 gap-px border border-ink/10 bg-ink/10">
          {[
            ["доказанность", "34"],
            ["вода", "82"],
            ["ясность", "61"],
          ].map(([label, value], i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 + i * 0.08 }}
              className="bg-surface px-3 py-3"
            >
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                {label}
              </div>
              <div className="mt-1 font-mono text-xl tabular-nums text-ink">
                {value}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.aside>
  );
}
