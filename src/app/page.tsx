import { HomeClient } from "@/components/home/home-client";
import { LandingPage } from "@/components/ui/page-templates";

export default function HomePage() {
  return (
    <LandingPage>
      <main id="main" className="flex flex-1 flex-col">
        <HomeClient />
      </main>
    </LandingPage>
  );
}
