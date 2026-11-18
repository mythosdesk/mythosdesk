"use client";

import { Diamond, Fire } from "@phosphor-icons/react";
import { BRAND } from "@elyagents/shared";
import { ChainBadge } from "@/components/common/chain";
import { Card, EmptyState, PageHeader, Pnl, Tag } from "@/components/common/bits";
import { TokenAvatar } from "@/components/common/token-avatar";
import { fmtNum, fmtPrice, fmtTime, fmtUsd, shortAddress } from "@/lib/format";
import { useBurns } from "@/lib/queries";

export function BurnsPage() {
  const { data } = useBurns();
  const t = data?.token;
  const started = data?.status === "active";
  return (
    <div>
      <PageHeader
        eyebrow="The long game"
        title="Token & burns"
        description={`The ${BRAND.name} token launches through the same contract as every coin here. Every burn is listed with its transaction.`}
        action={<Tag tone={started ? "up" : "default"}><Fire weight="fill" className="size-3" /> {started ? "Active" : "Not started"}</Tag>}
      />
      <Card coreClassName="grid gap-6 p-6 md:grid-cols-[1fr_1.4fr] md:p-8">
        <div className="flex items-center gap-4">
          {t ? <TokenAvatar token={t} size={72} /> : <span className="grid size-[72px] place-items-center rounded-2xl bg-surface-2 text-2xl font-semibold ring-1 ring-hairline">{BRAND.short}</span>}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Official token</p>
            <p className="text-2xl font-semibold tracking-tight">{t?.name ?? BRAND.name}</p>
            <p className="font-mono text-sm text-muted-foreground">{t?.symbol ?? "Ticker not announced"}</p>
            <div className="mt-2 flex items-center gap-2">
              {data && <ChainBadge chain={data.chain} />}
              <span className="font-mono text-[11px] text-faint">{data?.ca ? shortAddress(data.ca) : "No contract yet. Any coin using this name today is not ours."}</span>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
          {[
            ["Price", fmtPrice(t?.priceUsd)],
            ["Market cap", fmtUsd(t?.marketCapUsd)],
            ["Liquidity", fmtUsd(t?.liquidityUsd)],
            ["24h volume", fmtUsd(t?.volume24hUsd)],
            ["5m", <Pnl key="a" percent={t?.priceChange5m ?? null} />],
            ["1h", <Pnl key="b" percent={t?.priceChange1h ?? null} />],
            ["24h", <Pnl key="c" percent={t?.priceChange24h ?? null} />],
            ["FDV", fmtUsd(t?.fdvUsd)],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="num mt-0.5 font-mono">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mt-4">
        <div className="border-b border-hairline p-5">
          <p className="font-medium">Live burn activity</p>
          <p className="text-xs text-muted-foreground">Time, dollars spent, amount burned, and the transaction.</p>
        </div>
        {data?.burns.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-5 py-3 font-normal">Time</th>
                <th className="px-3 py-3 text-right font-normal">USD spent</th>
                <th className="px-3 py-3 text-right font-normal">Burned</th>
                <th className="px-5 py-3 text-right font-normal">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {data.burns.map((b) => (
                <tr key={b.id} className="border-b border-hairline/50 last:border-0">
                  <td className="px-5 py-3 font-mono text-xs">{fmtTime(b.createdAt).date} {fmtTime(b.createdAt).time}</td>
                  <td className="num px-3 py-3 text-right font-mono">{fmtUsd(b.usdSpent, { compact: false })}</td>
                  <td className="num px-3 py-3 text-right font-mono">{fmtNum(b.amountBurned)}</td>
                  <td className="px-5 py-3 text-right"><a href={b.explorer} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline">{shortAddress(b.txHash)} ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={<Diamond weight="light" className="size-5" />} title="No burns yet." description="Burned amounts and their transactions will show up here." />
        )}
      </Card>
    </div>
  );
}
