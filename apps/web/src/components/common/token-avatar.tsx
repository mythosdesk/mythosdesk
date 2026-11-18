"use client";

import type { MarketToken } from "@elyagents/shared";
import { useState } from "react";
import { ChainIcon } from "./chain";
import { cn } from "@/lib/utils";

export function TokenAvatar({
  token,
  size = 36,
  className,
}: {
  token: Pick<MarketToken, "symbol" | "imageUrl" | "chain">;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const hue = [...token.symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <span className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <span
        className="grid size-full place-items-center overflow-hidden rounded-full ring-1 ring-foreground/10"
        style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 30%), hsl(${(hue + 50) % 360} 60% 18%))` }}
      >
        {token.imageUrl && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={token.imageUrl} alt="" className="size-full object-cover" onError={() => setBroken(true)} loading="lazy" />
        ) : (
          <span className="font-mono text-[11px] font-semibold text-white/90">{token.symbol.slice(0, 3).toUpperCase()}</span>
        )}
      </span>
      <ChainIcon chain={token.chain} className="absolute -bottom-0.5 -right-0.5 size-4 ring-2 ring-background" />
    </span>
  );
}
