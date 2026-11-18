"use client";

import { ArrowUpRight, Lightning, Wallet } from "@phosphor-icons/react";
import { CHARACTERS, characterFor, STRATEGIES, type MyAgent, type PresetStrategyId } from "@elyagents/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CharacterPicker, ProfilePreview, StrategyEditor, type StrategyDraft } from "@/components/agents/strategy-editor";
import { Card, PageHeader, PillButton } from "@/components/common/bits";
import { Reveal } from "@/components/motion/reveal";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { useSession } from "@/lib/session";

function Section({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 border-b border-hairline p-6 last:border-0 md:p-7">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="text-foreground">{index}</span> / {title}
      </p>
      {children}
    </div>
  );
}

export function CreateAgentPage() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, requireSession, signingIn } = useSession();
  const [name, setName] = useState("");
  const [characterId, setCharacterId] = useState(CHARACTERS[0].id);
  const [draft, setDraft] = useState<StrategyDraft>({ type: "preset", presetId: CHARACTERS[0].strategyId });
  const [creating, setCreating] = useState(false);

  // Prefill from "Trade with X" links.
  useEffect(() => {
    const ch = params.get("character");
    const st = params.get("strategy");
    if (ch && CHARACTERS.some((c) => c.id === ch)) setCharacterId(ch);
    if (st && st in STRATEGIES) setDraft({ type: "preset", presetId: st as PresetStrategyId });
    else if (ch) setDraft({ type: "preset", presetId: characterFor(ch).strategyId });
  }, [params]);

  const pickCharacter = (id: string) => {
    setCharacterId(id);
    if (draft.type === "preset") setDraft({ type: "preset", presetId: characterFor(id).strategyId });
  };

  const create = async () => {
    if (!name.trim()) {
      toast.error("Give your agent a name first");
      return;
    }
    if (!(await requireSession())) return;
    setCreating(true);
    try {
      const strategy =
        draft.type === "preset"
          ? { type: "preset", presetId: draft.presetId }
          : { type: "custom", name: draft.name.trim() || "My Playbook", config: draft.config, instructions: draft.instructions };
      const { agent } = await api<{ agent: MyAgent }>("/me/agents", { method: "POST", json: { name: name.trim(), characterId, strategy } });
      await qc.invalidateQueries({ queryKey: qk.myAgents });
      toast.success(`${agent.name} is ready`, { description: "Start it in paper mode or fund its vault from My Portfolio." });
      router.push(`/profile?agent=${agent.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the agent");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Your crew · your strategy"
        title={
          <>
            Create a trading <span className="text-highlight">agent</span>
          </>
        }
        description="Build a personal agent with its own Robinhood Chain wallet and playbook. Fund it with ETH when you want it trading for real. No token launch required."
      >
        <Link href="/launch" className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline">
          Want to launch a token instead? Go to the launch studio <ArrowUpRight weight="bold" className="size-3.5" />
        </Link>
        <div className="flex flex-wrap gap-2 pt-2">
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">1 · Design your agent</span>
          <span className="rounded-full bg-foreground/[0.04] px-3 py-1 text-xs text-muted-foreground ring-1 ring-hairline">2 · Fund & start in Portfolio</span>
        </div>
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Reveal className="lg:col-span-7 xl:col-span-8">
          <Card>
            <Section index="01" title="Identity">
              <label className="block space-y-2">
                <span className="text-sm">Agent name</span>
                <input
                  value={name}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name your agent"
                  className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-base outline-none ring-1 ring-hairline placeholder:text-faint focus:ring-foreground/30"
                />
                <span className="block text-xs text-muted-foreground">This name is private to your portfolio. You can create more than one agent.</span>
              </label>
            </Section>
            <Section index="02" title="Choose a character">
              <CharacterPicker value={characterId} onChange={pickCharacter} />
            </Section>
            <Section index="03" title="Trading playbook">
              <StrategyEditor characterId={characterId} draft={draft} onChange={setDraft} />
            </Section>
            <div className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between md:p-7">
              <p className="text-xs text-muted-foreground">Agents start paused with no funds. Paper mode uses showcase credits so you can try the playbook first.</p>
              <PillButton size="lg" disabled={creating || signingIn} onClick={() => void create()} icon={user ? <Lightning weight="fill" className="size-4" /> : <Wallet weight="bold" className="size-4" />}>
                {creating ? "Creating…" : signingIn ? "Check your wallet…" : user ? "Create agent" : "Connect wallet to create"}
              </PillButton>
            </div>
          </Card>
        </Reveal>
        <div className="lg:sticky lg:top-28 lg:col-span-5 xl:col-span-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Your agent profile</p>
          <ProfilePreview name={name} characterId={characterId} draft={draft} />
        </div>
      </div>
    </div>
  );
}
