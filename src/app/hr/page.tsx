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
          <PageIntro title="Выбери своего HR." />
          <section className="ds-persona-grid" aria-label="Выбор HR">
            {ROSTER.map((person) => (
              <PersonaCard key={person.id} name={person.name} role={person.role} image={person.img} quote={person.quote} href={`/?persona=${person.id}#resume-start`} />
            ))}
          </section>
        </PageContainer>
      </main>
    </ServicePage>
  );
}
