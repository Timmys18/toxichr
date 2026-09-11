import type { Metadata } from "next";
import { ROSTER } from "@/components/home/hr-roster";
import { ServicePage } from "@/components/ui/page-templates";
import { PageContainer, PageIntro, PersonaCard } from "@/components/ui/system";

export const metadata: Metadata = { title: "HR-состав" };

export default function HrPage() {
  return (
    <ServicePage>
      <main id="main" className="ds-roster-page">
        <PageContainer>
          <PageIntro label="HR-состав" title="Четыре взгляда. Факты — одни." lead="У всех единое аналитическое ядро. Меняются оптика, лексика и характер комментария — ни один HR не придумывает факты о человеке." />
          <section className="ds-persona-grid" aria-label="Выбор HR">
            {ROSTER.map((person) => (
              <PersonaCard key={person.id} name={person.name} role={person.role} tag={person.tag} image={person.img} quote={person.quote} focus={person.focus} lenses={person.lenses} description={person.pick} href={`/?persona=${person.id}#resume-start`} />
            ))}
          </section>
        </PageContainer>
      </main>
    </ServicePage>
  );
}
