import { AgentSprite } from "@/components/agents/agent-bits";
import { PillLink } from "@/components/common/bits";

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center text-center">
      <div className="space-y-5">
        <div className="mx-auto w-fit animate-float">
          <AgentSprite characterId="charon" alt="" className="size-[200px]" />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="text-4xl font-semibold tracking-tight">No crossing to this page.</h1>
        <p className="text-muted-foreground">The page moved, or never existed.</p>
        <PillLink href="/">Back to the crew</PillLink>
      </div>
    </div>
  );
}
