"use client";

import { ArrowUpRight, Brain, Coins, Info, Pulse, Rocket, ShieldCheck, Swap } from "@phosphor-icons/react";
import { BRAND, CHAINS } from "@elyagents/shared";
import type { ReactNode } from "react";
import { Card, EmptyState, PageHeader, StatusDot, Tag } from "@/components/common/bits";
import { API_URL } from "@/lib/api";
import { fmtInt, fmtTime, fmtUsd, shortAddress, timeAgo } from "@/lib/format";
import { useProof } from "@/lib/queries";

const explorer = CHAINS.robinhood;

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-foreground underline-offset-4 hover:underline">
      {children}
      <ArrowUpRight weight="light" className="size-3" />
    </a>
  );
}

function Tile({ icon, label, value, detail, ok }: { icon: ReactNode; label: string; value: ReactNode; detail: ReactNode; ok: boolean }) {
  return (
    <div className="panel space-y-2 p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">{icon}{label}</span>
        <StatusDot active={ok} />
      </div>
      <p className="text-lg font-semibold tracking-tight">{value}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

export function ProofPage() {
  const { data } = useProof();
  // Measured on the server's clock: the report says when it was made and when the engine last ticked.
  const fresh = data?.engine.lastTickAt
    ? new Date(data.generatedAt).getTime() - new Date(data.engine.lastTickAt).getTime() < data.engine.tickSeconds * 3000
    : false;

  return (
    <div>
      <PageHeader
        eyebrow="Check it yourself"
        title="Proof"
        description={`Every claim ${BRAND.name} makes, with the evidence behind it. Each line points at the chain or at a public API response, and the page says plainly what is still simulated.`}
        action={<Tag tone="ink"><ShieldCheck weight="fill" className="size-3" /> Updated {data ? timeAgo(data.generatedAt) : "…"}</Tag>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={<Pulse weight="light" className="size-3.5" />}
          label="Engine"
          ok={fresh}
          value={fresh ? "Running" : data ? "No recent tick" : "…"}
          detail={data ? `Last tick ${timeAgo(data.engine.lastTickAt)}, every ${data.engine.tickSeconds}s. ${fmtInt(data.engine.tokensScanned)} tokens scanned, ${fmtInt(data.engine.decisions24h)} decisions in 24h.` : "Reading the engine…"}
        />
        <Tile
          icon={<Brain weight="light" className="size-3.5" />}
          label="Who decides"
          ok={Boolean(data?.engine.aiModel)}
          value={data ? (data.engine.aiModel ?? "Rules engine") : "…"}
          detail={data?.engine.aiModel ? "The model picks one token from a screened shortlist or holds. The worker enforces every limit." : "No AI key is set, so a deterministic rules engine ranks the shortlist."}
        />
        <Tile
          icon={<Swap weight="light" className="size-3.5" />}
          label="Trading"
          ok={Boolean(data?.trading.liveExecution)}
          value={data ? (data.trading.liveExecution ? "Live execution on" : "Paper only") : "…"}
          detail={data ? `${fmtInt(data.trading.paperTrades24h)} paper and ${fmtInt(data.trading.liveTrades24h)} live fills in 24h. Live fills are listed below with their transactions.` : "…"}
        />
        <Tile
          icon={<Rocket weight="light" className="size-3.5" />}
          label="Launches"
          ok={Boolean(data?.launches.open)}
          value={data ? (data.launches.open ? `${data.launches.venue}, ${data.launches.publicLaunchOpen ? "open" : "whitelist only"}` : "pons unavailable") : "…"}
          detail={data ? <>Your wallet calls the pons factory <Ext href={explorer.explorerAddress(data.launches.factory)}>{shortAddress(data.launches.factory)}</Ext>. {fmtInt(data.launches.launchedHere)} coins launched here.</> : "…"}
        />
      </div>

      <Card className="mt-4">
        <div className="border-b border-hairline p-5">
          <p className="flex items-center gap-2 font-medium"><Info weight="light" className="size-4" /> What is simulated</p>
          <p className="text-xs text-muted-foreground">Read from the running server, so it changes when the setup changes.</p>
        </div>
        <ul className="space-y-2 p-5 text-sm text-muted-foreground">
          {(data?.simulated ?? []).map((line) => (
            <li key={line} className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/40" />{line}</li>
          ))}
        </ul>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-hairline p-5">
            <p className="font-medium">Resident agents</p>
            <p className="text-xs text-muted-foreground">A live resident shows its vault, so every trade it makes can be checked on {explorer.name}.</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {(data?.trading.agents ?? []).map((a) => (
                <tr key={a.id} className="border-b border-hairline/50 last:border-0">
                  <td className="px-5 py-3 font-medium">{a.name}</td>
                  <td className="px-3 py-3"><Tag tone={a.mode === "LIVE" ? "up" : "default"}>{a.mode === "LIVE" ? "Live" : "Paper"}</Tag></td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{a.status === "ACTIVE" ? "Active" : "Paused"}</td>
                  <td className="px-5 py-3 text-right text-xs">{a.vault ? <Ext href={explorer.explorerAddress(a.vault)}>{shortAddress(a.vault)}</Ext> : <span className="text-faint">No vault</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <div className="border-b border-hairline p-5">
            <p className="flex items-center gap-2 font-medium"><Coins weight="light" className="size-4" /> The {BRAND.name} token</p>
            <p className="text-xs text-muted-foreground">Read from the pons factory, not typed in by us.</p>
          </div>
          {data?.token.address ? (
            <dl className="divide-y divide-hairline px-5 text-sm">
              {[
                ["Contract", <Ext key="c" href={explorer.explorerAddress(data.token.address)}>{shortAddress(data.token.address)}</Ext>],
                ["pons phase", data.token.pons?.phase ?? "Not a pons launch"],
                ["Creator fees go to", data.token.pons ? <Ext key="f" href={explorer.explorerAddress(data.token.pons.creatorFeeRecipient)}>{shortAddress(data.token.pons.creatorFeeRecipient)}</Ext> : "—"],
                ["Deployer", data.token.pons ? <Ext key="d" href={explorer.explorerAddress(data.token.pons.deployer)}>{shortAddress(data.token.pons.deployer)}</Ext> : "—"],
                ["Creator tax", data.token.pons ? `${data.token.pons.creatorTaxBps / 100}%` : "—"],
                ["Buybacks", data.token.pons ? (data.token.pons.buybackEnabled ? "On" : "Off") : "—"],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">Not launched yet. When it is, its contract, fee recipient and pons record appear here automatically. Until then, any coin using this name is not ours.</p>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="border-b border-hairline p-5">
          <p className="font-medium">Live trades on-chain</p>
          <p className="text-xs text-muted-foreground">Real swaps from agent vaults, newest first. Paper fills are in the activity feed.</p>
        </div>
        {data?.trading.liveFills.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-5 py-3 font-normal">Time</th>
                  <th className="px-3 py-3 font-normal">Agent</th>
                  <th className="px-3 py-3 font-normal">Trade</th>
                  <th className="px-3 py-3 text-right font-normal">Value</th>
                  <th className="px-5 py-3 text-right font-normal">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {data.trading.liveFills.map((f) => (
                  <tr key={f.txHash} className="border-b border-hairline/50 last:border-0">
                    <td className="px-5 py-3 font-mono text-xs">{fmtTime(f.at).date} {fmtTime(f.at).time}</td>
                    <td className="px-3 py-3">{f.agentName}</td>
                    <td className="px-3 py-3">{f.side === "BUY" ? "Bought" : "Sold"} {f.symbol}</td>
                    <td className="num px-3 py-3 text-right font-mono">{fmtUsd(f.valueUsd, { compact: false })}</td>
                    <td className="px-5 py-3 text-right"><Ext href={f.explorer}>{shortAddress(f.txHash)}</Ext></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Swap weight="light" className="size-6" />}
            title="No live trades yet"
            description={data?.trading.liveExecution ? "Live execution is on; the first real fill will show here with its transaction." : "Live execution is off, so every fill so far is on paper."}
          />
        )}
      </Card>

      <Card className="mt-4">
        <div className="border-b border-hairline p-5">
          <p className="font-medium">Check the raw data</p>
          <p className="text-xs text-muted-foreground">Public JSON, no key needed. This page is built from the first one.</p>
        </div>
        <ul className="divide-y divide-hairline text-sm">
          {(data?.endpoints ?? []).map((e) => (
            <li key={e.path} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <Ext href={`${API_URL}${e.path}`}>{e.path}</Ext>
              <span className="text-xs text-muted-foreground">{e.shows}</span>
            </li>
          ))}
        </ul>
        {data && (
          <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-hairline px-5 py-3 text-xs text-muted-foreground">
            {data.links.x && <Ext href={data.links.x}>X account</Ext>}
            {data.links.source && <Ext href={data.links.source}>Source code</Ext>}
            <Ext href={data.links.docs}>pons docs</Ext>
            <span>Network: {data.chain.name}, chain {data.chain.chainId}</span>
          </p>
        )}
      </Card>
    </div>
  );
}
