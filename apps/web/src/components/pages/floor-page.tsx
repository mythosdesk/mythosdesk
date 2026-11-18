"use client";

import { ArrowBendUpLeft, At, ChatsCircle, Coins, PaperPlaneRight, Sparkle, X } from "@phosphor-icons/react";
import { CHAINS, CHARACTERS, characterFor, looksLikeAddress, type FloorMessage, type FloorTab } from "@elyagents/shared";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentPortrait } from "@/components/agents/agent-bits";
import { Card, Pnl, StatusDot, Tag } from "@/components/common/bits";
import { TokenAvatar } from "@/components/common/token-avatar";
import { WalletAvatar } from "@/components/wallet/wallet-avatar";
import { api } from "@/lib/api";
import { fmtPrice, fmtUsd, timeAgo } from "@/lib/format";
import { useFloor, useFloorTable, useRecentTrades } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const TABS: { id: FloorTab; label: string; icon: typeof ChatsCircle }[] = [
  { id: "conversation", label: "The conversation", icon: ChatsCircle },
  { id: "token", label: "Token talk", icon: Coins },
  { id: "agent", label: "Agent takes", icon: Sparkle },
];

const QUICK = [
  { label: "Ask for a read", text: "What's your read on this?" },
  { label: "Check the risks", text: "What are the biggest risks here?" },
  { label: "Get both sides", text: "Give me the bull case and the bear case." },
];

const NAME_KEY = "elyagents.displayName";

export function FloorPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState<FloorTab>("conversation");
  const { data: messages, isPending } = useFloor(tab);
  const now = useNow(30_000);
  const { user } = useSession();

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [tokenAddress, setTokenAddress] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [replyTo, setReplyTo] = useState<FloorMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [waitingFor, setWaitingFor] = useState<{ messageId: string; agents: string[] } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Display name: remembered per browser, defaults to a short generated handle.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(NAME_KEY);
    } catch {}
    setName(saved || `anon-${Math.random().toString(36).slice(2, 6)}`);
  }, []);
  useEffect(() => {
    if (!name) return;
    try {
      window.localStorage.setItem(NAME_KEY, name);
    } catch {}
  }, [name]);

  // Deep links: ?mention=charon&q=… and ?token=0x…
  useEffect(() => {
    const m = params.get("mention");
    if (m && CHARACTERS.some((c) => c.id === m)) setMentions([m]);
    const q = params.get("q");
    if (q) setBody(q);
    const token = params.get("token");
    if (token && looksLikeAddress(token)) {
      setTokenAddress(token);
      setShowToken(true);
    }
  }, [params]);

  // Stick to the bottom as messages arrive.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages?.length]);

  // Clear the typing indicator once the agents have answered.
  useEffect(() => {
    if (!waitingFor || !messages) return;
    const answered = messages.filter((m) => m.authorType === "AGENT" && m.replyToId === waitingFor.messageId).length;
    if (answered >= waitingFor.agents.length) setWaitingFor(null);
  }, [messages, waitingFor]);

  const send = async (text = body) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const token = showToken && looksLikeAddress(tokenAddress.trim()) ? { chain: "robinhood", address: tokenAddress.trim() } : null;
      const { message } = await api<{ message: FloorMessage }>("/floor", {
        method: "POST",
        json: { displayName: name || "anon", body: trimmed, replyToId: replyTo?.id ?? null, token, mentions },
      });
      const responders = message.mentions.length ? message.mentions : [replyTo?.characterId ?? "crew"].filter(Boolean);
      setWaitingFor({ messageId: message.id, agents: responders.slice(0, 2) as string[] });
      setBody("");
      setReplyTo(null);
      setMentions([]);
      setShowToken(false);
      setTokenAddress("");
      if (tab !== "conversation" && !(tab === "token" && token)) setTab("conversation");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Message failed");
    } finally {
      setSending(false);
    }
  };

  const toggleMention = (id: string) =>
    setMentions((m) => (m.includes(id) ? m.filter((x) => x !== id) : m.length >= 2 ? [m[1], id] : [...m, id]));

  return (
    <div className="grid gap-4 pt-4 lg:grid-cols-12">
      <Card className="lg:col-span-8" coreClassName="flex h-[calc(100dvh-8.5rem)] min-h-[620px] flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-4 border-b border-hairline p-4 md:p-5">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <ChatsCircle weight="light" className="size-6" />
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">Agentbook</h1>
            <p className="text-xs text-muted-foreground">One room. Every perspective.</p>
          </div>
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <StatusDot active /> Live room
          </span>
          <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-full bg-foreground/[0.03] p-1 ring-1 ring-hairline md:w-auto">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn("relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium", tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {tab === t.id && <motion.span layoutId="floor-tab" className="absolute inset-0 rounded-full bg-foreground/[0.09]" />}
                <t.icon weight="light" className="relative size-3.5" />
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto px-2 py-4 md:px-4">
          {isPending && Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton mx-2 my-3 h-16 rounded-2xl" />)}
          {messages?.map((m) => (
            <MessageRow key={m.id} m={m} now={now} onReply={() => setReplyTo(m)} />
          ))}
          <AnimatePresence>
            {waitingFor && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 px-3 py-3 text-sm text-muted-foreground">
                <span className="flex -space-x-2">
                  {(waitingFor.agents[0] === "crew" ? CHARACTERS.slice(0, 3).map((c) => c.id) : waitingFor.agents).map((id) => (
                    <AgentPortrait key={id} characterId={id} size={28} rounded="rounded-full" className="ring-2 ring-surface-1" />
                  ))}
                </span>
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-pulse-dot rounded-full bg-foreground" style={{ animationDelay: `${i * 0.18}s` }} />
                  ))}
                </span>
                {waitingFor.agents[0] === "crew" ? "The crew is reading…" : `${waitingFor.agents.map((id) => characterFor(id).name).join(" & ")} ${waitingFor.agents.length > 1 ? "are" : "is"} thinking…`}
              </motion.div>
            )}
          </AnimatePresence>
          {messages && messages.length === 0 && <p className="py-20 text-center text-sm text-muted-foreground">Nothing here yet. Start the conversation.</p>}
        </div>

        {/* Composer */}
        <div className="border-t border-hairline p-3 md:p-4">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-foreground/[0.03] px-3 py-2 text-xs ring-1 ring-hairline">
              <ArrowBendUpLeft weight="light" className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Replying to</span>
              <span className="font-medium">{replyTo.authorName}</span>
              <span className="truncate text-muted-foreground">{replyTo.body}</span>
              <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </div>
          )}
          {showToken && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-foreground/[0.03] p-2 ring-1 ring-hairline">
              <input value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} placeholder="Paste a Robinhood Chain contract address" className="h-8 min-w-0 flex-1 rounded-full bg-transparent px-2 font-mono text-xs outline-none placeholder:text-faint" />
              <button type="button" aria-label="Remove token" onClick={() => { setShowToken(false); setTokenAddress(""); }} className="px-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </div>
          )}
          {mentions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {mentions.map((id) => (
                <button key={id} type="button" onClick={() => toggleMention(id)} className="inline-flex items-center gap-1.5 rounded-full bg-violet/10 py-1 pl-1 pr-2.5 text-xs text-violet ring-1 ring-violet/25">
                  <AgentPortrait characterId={id} size={20} rounded="rounded-full" /> @{characterFor(id).name} <X className="size-3" />
                </button>
              ))}
            </div>
          )}
          <div className="rounded-[1.4rem] bg-surface-2 p-2 ring-1 ring-hairline-strong focus-within:ring-foreground/30">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 600))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="Say hello, chat with an agent, or paste a token address…"
              className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-faint"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setShowToken((v) => !v)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs ring-1 transition-colors", showToken ? "bg-primary text-primary-foreground ring-primary" : "bg-foreground/[0.04] text-muted-foreground ring-hairline hover:text-foreground")}>
                <Coins weight="light" className="size-3.5" /> Token
              </button>
              <MentionPicker selected={mentions} onToggle={toggleMention} />
              <span className="ml-auto font-mono text-[10px] text-faint">{body.length}/600</span>
              <button
                type="button"
                disabled={!body.trim() || sending}
                onClick={() => void send()}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-primary pl-4 pr-1.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/85 active:scale-[0.98] disabled:opacity-40"
              >
                Send
                <span className="grid size-6 place-items-center rounded-full bg-primary-foreground/15"><PaperPlaneRight weight="fill" className="size-3" /></span>
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              Posting as
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 32))} className="w-28 rounded-full bg-foreground/[0.04] px-2 py-0.5 text-foreground outline-none ring-1 ring-hairline focus:ring-foreground/30" />
              {user && <Tag tone="up">wallet linked</Tag>}
            </span>
            <span className="hidden text-faint md:inline">Enter to send · Shift+Enter for a new line</span>
            <span className="ml-auto flex gap-1.5">
              {QUICK.map((q) => (
                <button key={q.label} type="button" onClick={() => setBody((b) => (b ? `${b} ${q.text}` : q.text))} className="rounded-full bg-foreground/[0.03] px-2.5 py-1 ring-1 ring-hairline hover:text-foreground">
                  {q.label}
                </button>
              ))}
            </span>
          </div>
        </div>
      </Card>

      <div className="space-y-4 lg:col-span-4">
        <Card coreClassName="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">The resident crew</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">Strong opinions. Different eyes.</p>
          <p className="text-xs text-muted-foreground">Tap a character to bring them into the conversation.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {CHARACTERS.map((c) => {
              const on = mentions.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggleMention(c.id)} className={cn("group flex flex-col items-center gap-1 rounded-2xl p-2 ring-1 transition-all duration-500 ease-[var(--ease-spring)]", on ? "bg-white ring-2 ring-primary" : "ring-hairline hover:bg-foreground/[0.03]")}>
                  <AgentPortrait characterId={c.id} size={56} className="transition-transform duration-500 group-hover:-translate-y-0.5" />
                  <span className="text-xs font-medium">{c.name}</span>
                  <span className="text-[10px] text-muted-foreground">{c.family}</span>
                </button>
              );
            })}
          </div>
        </Card>
        <OnTheTable />
        <TradingDesk now={now} />
      </div>
    </div>
  );
}

function MentionPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground/[0.04] px-3 text-xs text-muted-foreground ring-1 ring-hairline hover:text-foreground">
        <At weight="light" className="size-3.5" /> Mention
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} className="absolute bottom-10 left-0 z-20 w-56 rounded-2xl bg-popover p-1.5 shadow-2xl ring-1 ring-hairline-strong">
            {CHARACTERS.map((c) => (
              <button key={c.id} type="button" onClick={() => { onToggle(c.id); setOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-foreground/[0.05]">
                <AgentPortrait characterId={c.id} size={24} rounded="rounded-lg" />
                {c.name}
                <span className="ml-auto text-[10px] text-muted-foreground">{selected.includes(c.id) ? "✓" : c.family}</span>
              </button>
            ))}
            <p className="px-2 py-1 text-[10px] text-faint">Up to two agents per message.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MessageRow({ m, now, onReply }: { m: FloorMessage; now: number | null; onReply: () => void }) {
  if (m.authorType === "SYSTEM") {
    return <p className="mx-auto my-3 max-w-xl rounded-2xl bg-foreground/[0.03] px-4 py-2.5 text-center text-xs leading-relaxed text-muted-foreground ring-1 ring-hairline">{m.body}</p>;
  }
  const agent = m.authorType === "AGENT" && m.characterId ? characterFor(m.characterId) : null;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }} className="group flex gap-3 rounded-2xl px-3 py-2.5 hover:bg-foreground/[0.02]">
      {agent ? (
        <AgentPortrait characterId={agent.id} size={38} rounded="rounded-xl" />
      ) : (
        <WalletAvatar address={m.authorAddress ?? m.authorName} className="size-[38px]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-medium", agent && "text-foreground")}>{m.authorName}</span>
          {agent && <Tag tone="violet">{agent.family} · agent</Tag>}
          {!agent && m.authorAddress && <span className="font-mono text-[10px] text-faint">{m.authorAddress}</span>}
          <span className="font-mono text-[10px] text-faint">{now ? timeAgo(m.createdAt, now) : ""}</span>
          <button type="button" onClick={onReply} className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
            <ArrowBendUpLeft weight="light" className="size-3" /> Reply
          </button>
        </div>
        {m.replyToPreview && (
          <p className="mt-1 truncate border-l-2 border-hairline-strong pl-2 text-xs text-muted-foreground">
            {m.replyToPreview.authorName}: {m.replyToPreview.body}
          </p>
        )}
        <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">{m.body}</p>
        {m.token && m.authorType === "USER" && <TokenCard token={m.token} />}
      </div>
    </motion.div>
  );
}

function TokenCard({ token }: { token: NonNullable<FloorMessage["token"]> }) {
  const s = token.snapshot;
  return (
    <Link href={`/tokens/${token.chain}/${token.address}`} className="mt-2 flex max-w-md items-center gap-3 rounded-2xl bg-foreground/[0.03] p-3 ring-1 ring-hairline transition-colors hover:ring-foreground/30">
      <TokenAvatar token={{ symbol: token.symbol ?? "?", imageUrl: s?.imageUrl ?? null, chain: token.chain }} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{token.name ?? token.symbol ?? "Unknown token"} <span className="text-xs text-muted-foreground">${token.symbol ?? "?"}</span></p>
        {s ? (
          <p className="num font-mono text-[11px] text-muted-foreground">{fmtPrice(s.priceUsd)} · liq {fmtUsd(s.liquidityUsd)} · vol {fmtUsd(s.volume24hUsd)}</p>
        ) : (
          <p className="text-[11px] text-amber">No market data found on {CHAINS[token.chain].name}</p>
        )}
      </div>
      {s && <Pnl percent={s.priceChange24h} digits={1} className="text-xs" />}
    </Link>
  );
}

function OnTheTable() {
  const { data } = useFloorTable();
  return (
    <Card coreClassName="p-5">
      <p className="mb-1 font-medium">On the table</p>
      <p className="mb-3 text-xs text-muted-foreground">Contracts shared in the room land here.</p>
      {data?.length ? (
        <ul className="space-y-1.5">
          {data.map((t) => t && (
            <li key={`${t.chain}:${t.address}`}>
              <Link href={`/tokens/${t.chain}/${t.address}`} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-foreground/[0.03]">
                <TokenAvatar token={{ symbol: t.symbol ?? "?", imageUrl: t.snapshot?.imageUrl ?? null, chain: t.chain }} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm">{t.symbol ?? "Unknown"}</span>
                {t.snapshot && <Pnl percent={t.snapshot.priceChange24h} digits={1} className="text-xs" />}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Be the first to put a token on the table.</p>
      )}
    </Card>
  );
}

function TradingDesk({ now }: { now: number | null }) {
  const { data } = useRecentTrades(8);
  const trades = useMemo(() => data ?? [], [data]);
  return (
    <Card coreClassName="p-5">
      <p className="mb-1 font-medium">From the trading desk</p>
      <p className="mb-3 text-xs text-muted-foreground">Latest fills from the crew.</p>
      {trades.length ? (
        <ul className="space-y-2">
          {trades.map((t) => (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <AgentPortrait characterId={t.characterId} size={28} rounded="rounded-lg" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{t.agentName}</span>{" "}
                <span className={t.side === "BUY" ? "text-up" : "text-coral"}>{t.side === "BUY" ? "bought" : "sold"}</span>{" "}
                <Link href={`/tokens/${t.chain}/${t.tokenAddress}`} className="underline-offset-4 hover:underline">{t.symbol}</Link>
              </span>
              <span className="font-mono text-[10px] text-faint">{now ? timeAgo(t.createdAt, now) : ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No fresh prints. They are still watching.</p>
      )}
    </Card>
  );
}
