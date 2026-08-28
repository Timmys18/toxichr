import { redirect } from "next/navigation";
import { SessionClient } from "@/app/session/session-client";
import { AnalysisResultPage } from "@/components/ui/page-templates";
import type { PersonaId } from "@/lib/personas";

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
        <main id="main" className="flex flex-1 flex-col">
          <SessionClient key={`view:${view}`} viewId={view} />
        </main>
      </AnalysisResultPage>
    );
  }

  if (!resumeId || !personaId || !PERSONA_CODES.includes(personaId as PersonaId)) {
    redirect("/");
  }

  return (
    <AnalysisResultPage>
      <main id="main" className="flex flex-1 flex-col">
        <SessionClient
          key={`${resumeId}:${personaId}`}
          resumeId={resumeId!}
          personaId={personaId as PersonaId}
        />
      </main>
    </AnalysisResultPage>
  );
}
