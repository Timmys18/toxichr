import { SiteHeader } from "@/components/landing/site-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteFooter } from "@/components/landing/site-footer";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        <LandingHero />
        <HowItWorks />
      </main>
      <SiteFooter />
    </>
  );
}
