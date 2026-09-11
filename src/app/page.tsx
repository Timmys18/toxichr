import { HomeClient } from "@/components/home/home-client";
import { LandingPage } from "@/components/ui/page-templates";
import type { PersonaId } from "@/lib/personas";

const PERSONAS = new Set<PersonaId>(["vadik", "lera", "gleb", "tamara"]);

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const requested = (await searchParams).persona;
  const initialPersona = typeof requested === "string" && PERSONAS.has(requested as PersonaId) ? requested as PersonaId : "vadik";
  return (
    <LandingPage>
      <HomeClient initialPersona={initialPersona} />
    </LandingPage>
  );
}
