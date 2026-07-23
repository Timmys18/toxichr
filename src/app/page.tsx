import { TopNav } from "@/components/shared/top-nav";
import { HomeClient } from "@/components/home/home-client";

export default function HomePage() {
  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <HomeClient />
      </main>
    </>
  );
}
