import { HomeClient } from "@/components/home/home-client";
import { LandingPage } from "@/components/ui/page-templates";
import type { PersonaId } from "@/lib/personas";
import { TOXICHR_PACKAGE_PRICE_RUB } from "@/lib/package";

const PERSONAS = new Set<PersonaId>(["vadik", "lera", "gleb", "tamara"]);

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const requested = (await searchParams).persona;
  const initialPersona = typeof requested === "string" && PERSONAS.has(requested as PersonaId) ? requested as PersonaId : undefined;
  return (
    <LandingPage>
      <HomeClient initialPersona={initialPersona} priceRub={TOXICHR_PACKAGE_PRICE_RUB} />
    </LandingPage>
  );
}
