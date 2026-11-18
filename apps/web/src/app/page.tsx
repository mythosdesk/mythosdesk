import { CrewNetwork } from "@/components/home/crew-network";
import { Hero } from "@/components/home/hero";
import { AgentsGrid, BuildCta, ChainsMarquee, KpiStrip, LaunchesRail, LiveActivity } from "@/components/home/sections";
import { Reveal } from "@/components/motion/reveal";

export default function HomePage() {
  return (
    <div className="space-y-24 md:space-y-32">
      <Hero />
      <Reveal id="crew" className="scroll-mt-[calc(var(--nav-clear)+1rem)]">
        <CrewNetwork />
      </Reveal>
      <div className="space-y-4">
        <KpiStrip />
        <ChainsMarquee />
      </div>
      <LaunchesRail />
      <AgentsGrid />
      <LiveActivity />
      <BuildCta />
    </div>
  );
}
