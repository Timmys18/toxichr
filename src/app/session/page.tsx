import { redirect } from "next/navigation";
import { SessionClient } from "@/app/session/session-client";
import { AnalysisResultPage } from "@/components/ui/page-templates";
import type { PersonaId } from "@/lib/personas";
import { TOXICHR_PACKAGE_PRICE_RUB } from "@/lib/package";

const PERSONA_CODES: PersonaId[] = ["tamara", "lera", "gleb", "vadik"];

type Props = {
  searchParams: Promise<{
    resumeId?: string;
    personaId?: string;
    view?: string;
  }>;
};

export default async function SessionPage({ searchParams }: Props) {
  const { resumeId, personaId, view } = await searchParams;

  // Режим просмотра готового разбора
  if (view) {
    return (
      <AnalysisResultPage>
        <SessionClient key={`view:${view}`} viewId={view} priceRub={TOXICHR_PACKAGE_PRICE_RUB} />
      </AnalysisResultPage>
    );
  }

  if (!resumeId || !personaId || !PERSONA_CODES.includes(personaId as PersonaId)) {
    redirect("/");
  }

  return (
    <AnalysisResultPage>
      <SessionClient
        key={`${resumeId}:${personaId}`}
        resumeId={resumeId!}
        personaId={personaId as PersonaId}
        priceRub={TOXICHR_PACKAGE_PRICE_RUB}
      />
    </AnalysisResultPage>
  );
}
