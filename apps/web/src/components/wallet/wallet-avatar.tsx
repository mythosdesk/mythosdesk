import { cn } from "@/lib/utils";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic gradient avatar for a wallet address. */
export function WalletAvatar({ address, className }: { address: string; className?: string }) {
  const h = hash(address.toLowerCase());
  const a = h % 360;
  const b = (a + 60 + ((h >> 8) % 90)) % 360;
  const angle = (h >> 16) % 360;
  return (
    <span
      aria-hidden
      className={cn("inline-block size-6 shrink-0 rounded-full ring-1 ring-foreground/15", className)}
      style={{
        background: `conic-gradient(from ${angle}deg, hsl(${a} 85% 62%), hsl(${b} 80% 55%), hsl(${a} 85% 62%))`,
      }}
    />
  );
}
