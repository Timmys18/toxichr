import { redirect } from "next/navigation";
import { TopNav } from "@/components/shared/top-nav";
import { SessionClient } from "@/app/session/session-client";
import type { PersonaId } from "@/lib/personas";

const PERSONA_CODES: PersonaId[] = ["tamara", "lera", "gleb", "vadik"];

type Props = {
  searchParams: Promise<{ resumeId?: string; personaId?: string }>;
};

export default async function SessionPage({ searchParams }: Props) {
  const { resumeId, personaId } = await searchParams;

  if (!resumeId || !personaId || !PERSONA_CODES.includes(personaId as PersonaId)) {
    redirect("/");
  }

  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <SessionClient resumeId={resumeId!} personaId={personaId as PersonaId} />
      </main>
    </>
  );
}
