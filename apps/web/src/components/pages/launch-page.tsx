"use client";

import { ArrowLeft, ArrowUpRight, Coins, ImageSquare, Info, Lock, Rocket, UploadSimple, Warning } from "@phosphor-icons/react";
import { CHARACTERS, estimateFirstBuy, PONS, PONS_FACTORY_ABI, PONS_LAUNCH_AND_BUY_ABI, PONS_NATIVE_PAIR, type Launch } from "@elyagents/shared";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { formatEther, parseAbi, parseEther, toHex } from "viem";
import { useAccount, useSwitchChain, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { CharacterPicker, StrategyEditor, type StrategyDraft } from "@/components/agents/strategy-editor";
import { Card, PageHeader, PillButton, Tag } from "@/components/common/bits";
import { ChainIcon } from "@/components/common/chain";
import { api, API_URL, getToken } from "@/lib/api";
import { qk, useLaunchConfig } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { launchChain, wagmiConfig } from "@/lib/wagmi";

const factoryAbi = parseAbi(PONS_FACTORY_ABI);
const routerAbi = parseAbi(PONS_LAUNCH_AND_BUY_ABI);

interface CoinForm {
  name: string;
  symbol: string;
  description: string;
  twitter: string;
  website: string;
  initialBuy: string;
  imageUrl: string | null;
  /** ipfs:// form of the logo when the server pinned it, which pons prefers. */
  imageIpfs: string | null;
}

const supplyLabel = (supply: number | null | undefined) =>
  supply ? (supply >= 1e9 ? `${+(supply / 1e9).toFixed(2)}B` : supply.toLocaleString()) : "—";

/** Above this share of supply, holder checkers start calling the creator an insider. */
const HEAVY_FIRST_BUY = 0.03;

export function LaunchPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: config } = useLaunchConfig();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { user, requireSession } = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [withAgent, setWithAgent] = useState(false);
  const [buyback, setBuyback] = useState(false);
  const [coin, setCoin] = useState<CoinForm>({ name: "", symbol: "", description: "", twitter: "", website: "", initialBuy: "", imageUrl: null, imageIpfs: null });
  const [agentName, setAgentName] = useState("");
  const [characterId, setCharacterId] = useState(CHARACTERS[0].id);
  const [draft, setDraft] = useState<StrategyDraft>({ type: "preset", presetId: CHARACTERS[0].strategyId });
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "checking" | "signing" | "confirming" | "recording">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  const fee = config?.launchFeeWei ? BigInt(config.launchFeeWei) : 0n;
  const graduation = config?.graduationThresholdWei ? `${+Number(formatEther(BigInt(config.graduationThresholdWei))).toFixed(4)} ETH` : null;
  let buy = 0n;
  try {
    buy = coin.initialBuy.trim() ? parseEther(coin.initialBuy.trim() as `${number}`) : 0n;
  } catch {
    buy = -1n;
  }
  const valid = coin.name.trim().length > 0 && /^[A-Za-z0-9]{1,16}$/.test(coin.symbol.trim()) && buy >= 0n && (!withAgent || agentName.trim().length > 0);
  const ready = Boolean(config?.deployed && config.launchConfigId !== null);
  const firstBuy =
    buy > 0n && config?.phantomQuoteWei && config.totalSupply && config.curveFeeBps !== null
      ? estimateFirstBuy(buy, BigInt(config.phantomQuoteWei), config.totalSupply, config.curveFeeBps)
      : null;
  const heavyFirstBuy = (firstBuy?.shareOfSupply ?? 0) > HEAVY_FIRST_BUY;
  const sharePct = firstBuy ? `${(firstBuy.shareOfSupply * 100).toFixed(2)}%` : null;

  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = getToken();
      const res = await fetch(`${API_URL}/api/uploads`, { method: "POST", body: form, headers: token ? { authorization: `Bearer ${token}` } : {} });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setCoin((c) => ({ ...c, imageUrl: body.url, imageIpfs: body.ipfs ?? null }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const launch = async () => {
    if (!config || !ready || config.launchConfigId === null) {
      toast.error("pons is not taking launches right now.");
      return;
    }
    if (!(await requireSession()) || !address) return;
    try {
      if (chainId !== launchChain.id) await switchChainAsync({ chainId: launchChain.id });
      setPhase("checking");
      const factory = config.factory as `0x${string}`;
      const launchConfigId = BigInt(config.launchConfigId);
      // Read the gate and the terms right before signing: pons can whitelist launches or edit a config at any time.
      // The economics pin makes the launch revert instead of settling on terms that changed in between.
      const [allowed, expectedEconomics, launchFee] = await Promise.all([
        readContract(wagmiConfig, { chainId: launchChain.id, address: factory, abi: factoryAbi, functionName: "canLaunch", args: [address] }),
        readContract(wagmiConfig, { chainId: launchChain.id, address: factory, abi: factoryAbi, functionName: "previewLaunchEconomics", args: [launchConfigId, PONS_NATIVE_PAIR] }),
        readContract(wagmiConfig, { chainId: launchChain.id, address: factory, abi: factoryAbi, functionName: "launchFee" }),
      ]);
      if (!allowed) {
        toast.error("pons only lets whitelisted wallets launch right now", { description: "This wallet is not on the list yet." });
        return;
      }
      const params = {
        name: coin.name.trim(),
        symbol: coin.symbol.trim().toUpperCase(),
        logo: coin.imageIpfs ?? coin.imageUrl ?? "",
        description: coin.description.trim(),
        socials: { twitter: coin.twitter.trim(), telegram: "", discord: "", website: coin.website.trim(), farcaster: "" },
        creatorFeeRecipient: address,
        creatorTaxBps: 0,
        buybackEnabled: buyback,
        expectedEconomics,
        salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
      };
      setPhase("signing");
      const hash =
        buy > 0n
          ? await writeContractAsync({
              chainId: launchChain.id,
              address: config.launchAndBuy as `0x${string}`,
              abi: routerAbi,
              functionName: "launchAndBuy",
              // The curve is created inside this same transaction, so nothing can trade ahead of the buy
              // and its price follows from the pinned config: a minimum output would add no protection.
              args: [params, launchConfigId, PONS_NATIVE_PAIR, buy, 0n, address, []],
              value: launchFee + buy,
            })
          : await writeContractAsync({
              chainId: launchChain.id,
              address: factory,
              abi: factoryAbi,
              functionName: "launchToken",
              args: [params, launchConfigId, PONS_NATIVE_PAIR],
              value: launchFee,
            });
      setPhase("confirming");
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: launchChain.id });
      setPhase("recording");
      const strategy = draft.type === "preset" ? { type: "preset", presetId: draft.presetId } : { type: "custom", name: draft.name, config: draft.config, instructions: draft.instructions };
      const { launch: recorded } = await api<{ launch: Launch }>("/launches", {
        method: "POST",
        json: {
          txHash: hash,
          name: coin.name.trim(),
          symbol: coin.symbol.trim().toUpperCase(),
          description: coin.description.trim(),
          imageUri: coin.imageUrl,
          website: coin.website.trim() || null,
          twitter: coin.twitter.trim() || null,
          agent: withAgent ? { name: agentName.trim(), characterId, strategy } : null,
        },
      });
      await qc.invalidateQueries({ queryKey: qk.launches });
      toast.success(`${recorded.name} launched on pons`, { description: "It trades on the pons curve until it graduates to Uniswap." });
      router.push(`/tokens/${recorded.chain}/${recorded.tokenAddress}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : "Launch failed";
      toast.error(/rejected|denied/i.test(msg) ? "Transaction was rejected" : msg);
    } finally {
      setPhase("idle");
    }
  };

  const input = "h-11 w-full rounded-xl bg-surface-2 px-4 text-sm outline-none ring-1 ring-hairline placeholder:text-faint focus:ring-foreground/30";

  return (
    <div>
      <PageHeader
        eyebrow="The launch studio"
        title="Launch a token"
        description="Launch a coin on pons, on Robinhood Chain. Attach an agent and a strategy if you want one to trade for it."
      >
        <div className="flex flex-wrap gap-2 pt-2">
          {["Set the coin", "Review & launch"].map((label, i) => (
            <span key={label} className={cn("rounded-full px-3 py-1 text-xs", step === i + 1 ? "bg-primary font-semibold text-primary-foreground" : "bg-foreground/[0.04] text-muted-foreground ring-1 ring-hairline")}>
              {String(i + 1).padStart(2, "0")} · {label}
            </span>
          ))}
        </div>
      </PageHeader>

      {config && !ready && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-amber/10 p-4 text-sm text-amber ring-1 ring-amber/25">
          <Warning weight="fill" className="mt-0.5 size-4 shrink-0" />
          <span>{config.error ?? "pons is not taking launches right now."} You can fill in and preview everything; signing unlocks once pons answers.</span>
        </div>
      )}
      {config && ready && !config.publicLaunchOpen && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-amber/10 p-4 text-sm text-amber ring-1 ring-amber/25">
          <Warning weight="fill" className="mt-0.5 size-4 shrink-0" />
          <span>
            pons only lets whitelisted wallets launch right now. Your wallet is checked before you sign.{" "}
            <a href={PONS.site} target="_blank" rel="noreferrer" className="underline underline-offset-2">ponsfamily.com</a>
          </span>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 xl:col-span-8">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div key="s1" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}>
                <Card>
                  <div className="space-y-4 border-b border-hairline p-6 md:p-7">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"><span className="text-foreground">01</span> / Launch</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[false, true].map((v) => (
                        <button key={String(v)} type="button" onClick={() => setWithAgent(v)} className={cn("rounded-2xl p-4 text-left ring-1 transition-all", withAgent === v ? "bg-white ring-2 ring-primary" : "bg-surface-2 ring-hairline hover:ring-hairline-strong")}>
                          <p className="font-medium">{v ? "Token + agent" : "Token only"}</p>
                          <p className="text-xs text-muted-foreground">{v ? "Attach a character and playbook to trade for it" : "Launch the coin on its own"}</p>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-foreground/[0.02] p-4 ring-1 ring-hairline">
                      <ChainIcon chain="robinhood" className="size-9 text-base" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{config?.chainName ?? "Robinhood Chain"} · pons v2 · paired with ETH</p>
                        <p className="text-xs text-muted-foreground">
                          Bonding curve first{graduation ? `, graduating at ${graduation} raised` : ""}, then a Uniswap v4 pool with its liquidity locked for good
                        </p>
                      </div>
                      <Tag tone="ink">pons</Tag>
                    </div>
                  </div>

                  <div className="grid gap-6 border-b border-hairline p-6 md:grid-cols-[180px_1fr] md:p-7">
                    <div>
                      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"><span className="text-foreground">02</span> / Coin logo</p>
                      <button type="button" onClick={() => fileRef.current?.click()} className="group relative grid aspect-square w-full place-items-center overflow-hidden rounded-3xl bg-surface-2 ring-1 ring-dashed ring-hairline-strong transition-colors hover:ring-foreground/30">
                        {coin.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={coin.imageUrl} alt="Coin logo" className="size-full object-cover" />
                        ) : (
                          <span className="flex flex-col items-center gap-2 text-muted-foreground">
                            {uploading ? <UploadSimple weight="light" className="size-6 animate-bounce" /> : <ImageSquare weight="light" className="size-7" />}
                            <span className="text-xs">{uploading ? "Uploading…" : "Upload image"}</span>
                          </span>
                        )}
                      </button>
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
                      <p className="mt-2 text-[11px] text-faint">PNG, JPG, GIF, WebP or AVIF under 5 MB</p>
                    </div>
                    <div className="space-y-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"><span className="text-foreground">03</span> / Coin</p>
                      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                        <input className={input} placeholder="Coin name" maxLength={64} value={coin.name} onChange={(e) => setCoin({ ...coin, name: e.target.value })} />
                        <input className={cn(input, "font-mono uppercase")} placeholder="TICKER" maxLength={16} value={coin.symbol} onChange={(e) => setCoin({ ...coin, symbol: e.target.value.replace(/[^A-Za-z0-9]/g, "") })} />
                      </div>
                      <textarea className={cn(input, "h-auto py-3")} rows={3} maxLength={2000} placeholder="Description — shown on pons and in token metadata" value={coin.description} onChange={(e) => setCoin({ ...coin, description: e.target.value })} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input className={input} placeholder="X link (optional)" value={coin.twitter} onChange={(e) => setCoin({ ...coin, twitter: e.target.value })} />
                        <input className={input} placeholder="Website (optional)" value={coin.website} onChange={(e) => setCoin({ ...coin, website: e.target.value })} />
                      </div>
                      <label className="block space-y-1.5">
                        <span className="text-xs text-muted-foreground">Initial buy (ETH, optional) — bought in the same transaction</span>
                        <input className={cn(input, "font-mono")} placeholder="0.0" inputMode="decimal" value={coin.initialBuy} onChange={(e) => setCoin({ ...coin, initialBuy: e.target.value })} />
                        {buy < 0n && <span className="text-xs text-coral">Enter a valid ETH amount</span>}
                        {firstBuy && (
                          <span className={cn("block text-xs", heavyFirstBuy ? "text-amber" : "text-muted-foreground")}>
                            About {Math.round(firstBuy.tokens).toLocaleString("en-US")} tokens, {sharePct} of supply.
                            {heavyFirstBuy ? " Holder checkers flag a creator who holds a real share, so keep it near 3% or below." : ""}
                          </span>
                        )}
                      </label>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={buyback}
                        onClick={() => setBuyback((v) => !v)}
                        className="flex w-full items-center justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3 text-left ring-1 ring-hairline transition-colors hover:ring-hairline-strong"
                      >
                        <span>
                          <span className="block text-sm font-medium">Buybacks</span>
                          <span className="block text-xs text-muted-foreground">Spend part of your creator fees buying the coin back. You can switch this later on pons.</span>
                        </span>
                        <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", buyback ? "bg-primary" : "bg-foreground/15")}>
                          <span className={cn("absolute top-1 size-4 rounded-full bg-white shadow transition-all", buyback ? "left-5" : "left-1")} />
                        </span>
                      </button>
                    </div>
                  </div>

                  {withAgent && (
                    <div className="space-y-5 border-b border-hairline p-6 md:p-7">
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"><span className="text-foreground">04</span> / Agent</p>
                      <input className={input} placeholder="Agent name" maxLength={32} value={agentName} onChange={(e) => setAgentName(e.target.value)} />
                      <CharacterPicker value={characterId} onChange={(id) => { setCharacterId(id); if (draft.type === "preset") setDraft({ type: "preset", presetId: CHARACTERS.find((c) => c.id === id)!.strategyId }); }} />
                      <StrategyEditor characterId={characterId} draft={draft} onChange={setDraft} />
                    </div>
                  )}

                  <div className="flex justify-end p-6 md:p-7">
                    <PillButton size="lg" disabled={!valid} onClick={() => setStep(2)}>Review launch</PillButton>
                  </div>
                </Card>
              </motion.div>
            ) : (
              <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}>
                <Card coreClassName="space-y-6 p-6 md:p-8">
                  <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft weight="light" className="size-4" /> Edit details</button>
                  <h2 className="text-3xl font-semibold tracking-tight">Review & launch</h2>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    {[
                      "Your wallet signs one transaction to pons on Robinhood Chain. mythos desk never holds launch funds.",
                      `The full ${supplyLabel(config?.totalSupply)} supply starts on a pons bonding curve. When the curve sells out${graduation ? ` (${graduation} raised)` : ""}, it graduates into a Uniswap v4 pool and that liquidity is locked permanently.`,
                      buy > 0n
                        ? `Your initial buy of ${formatEther(buy)} ETH${sharePct ? ` (about ${sharePct} of supply)` : ""} runs in the same transaction through the pons launch-and-buy router, so nobody can trade before it.`
                        : "No initial buy. The first trade is open to everyone.",
                      "Holder checkers count the creator's share, and any wallet linked to it, as insiders. Buy from this one wallet only.",
                      withAgent ? `${agentName || "Your agent"} is created with its own vault and starts in paper mode on the showcase.` : "No agent is attached. You can create one later.",
                      `Your wallet receives the creator fees. pons splits trading fees by its own policy, and you claim them on pons.${buyback ? " Part of them buys the coin back." : ""}`,
                      "pons v2 is still under audit. Launch tokens are volatile and can lose all value.",
                    ].map((line) => (
                      <li key={line} className="flex gap-3"><Lock weight="light" className="mt-0.5 size-4 shrink-0 text-foreground" />{line}</li>
                    ))}
                  </ul>
                  <PillButton size="lg" disabled={phase !== "idle" || !ready} onClick={() => void launch()} icon={<Rocket weight="bold" className="size-4" />} className="w-full justify-between">
                    {phase === "checking"
                      ? "Checking pons…"
                      : phase === "signing"
                        ? "Confirm in your wallet…"
                        : phase === "confirming"
                          ? "Waiting for confirmation…"
                          : phase === "recording"
                            ? "Recording launch…"
                            : !ready
                              ? "pons unavailable"
                              : user
                                ? "Sign & launch on pons"
                                : "Connect wallet to launch"}
                  </PillButton>
                  <a href={PONS.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    How pons launches work <ArrowUpRight weight="light" className="size-3.5" />
                  </a>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Preview (Ref 3 invoice detail) */}
        <div className="lg:sticky lg:top-28 lg:col-span-5 xl:col-span-4">
          <Card coreClassName="overflow-hidden">
            <div className="flex items-center gap-4 bg-gradient-to-br from-foreground/[0.06] to-transparent p-5">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-hairline">
                {coin.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coin.imageUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Coins weight="light" className="size-6 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold tracking-tight">{coin.name || "Coin name"}</p>
                <p className="font-mono text-sm text-muted-foreground">${coin.symbol.toUpperCase() || "TICKER"}</p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <p className="line-clamp-3 text-sm text-muted-foreground">{coin.description || "Shown on pons and in token metadata."}</p>
              <dl className="divide-y divide-hairline rounded-2xl bg-surface-2 px-4 text-sm ring-1 ring-hairline">
                {[
                  ["Venue", "pons v2 curve"],
                  ["Network", config?.chainName ?? "Robinhood Chain"],
                  ["Quote asset", "ETH"],
                  ["Total supply", supplyLabel(config?.totalSupply)],
                  ["Graduates at", graduation ? `${graduation} raised` : "—"],
                  ["Curve fee", config?.curveFeeBps !== null && config?.curveFeeBps !== undefined ? `${config.curveFeeBps / 100}%` : "—"],
                  ["Buybacks", buyback ? "On" : "Off"],
                  ["Initial buy", `${buy > 0n ? formatEther(buy) : "0"} ETH`],
                  ["Your share", sharePct ?? "0%"],
                  ["Launch fee", config?.launchFeeWei ? `${formatEther(fee)} ETH` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2.5">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="num font-mono">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center justify-between rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
                <span className="text-sm font-medium">Paid from your wallet</span>
                <span className="num font-mono text-lg font-semibold">{formatEther(fee + (buy > 0n ? buy : 0n))} ETH</span>
              </div>
              <p className="flex items-start gap-2 text-[11px] text-faint"><Info weight="light" className="mt-0.5 size-3.5 shrink-0" /> Plus Robinhood Chain gas. Your wallet launches the coin on pons; no other wallet holds launch funds.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
