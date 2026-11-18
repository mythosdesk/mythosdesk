"use client";

import { Check, Copy, Eye, EyeSlash, Key, Warning } from "@phosphor-icons/react";
import { CHAINS, type ChainKey, type MyAgent, type VaultWallet } from "@elyagents/shared";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount, useSignMessage } from "wagmi";
import { ChainIcon } from "@/components/common/chain";
import { PillButton } from "@/components/common/bits";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";

function CopyRow({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex w-full items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-left ring-1 ring-hairline hover:ring-hairline-strong"
    >
      <span className={`min-w-0 flex-1 break-all text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
      {copied ? <Check weight="bold" className="size-4 shrink-0 text-up" /> : <Copy weight="light" className="size-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

export function DepositDialog({ wallet, open, onOpenChange }: { wallet: VaultWallet | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!wallet) return null;
  const meta = CHAINS[wallet.chain];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <span className="eyebrow w-fit"><ChainIcon chain={wallet.chain} className="size-4" /> {meta.name}</span>
          <DialogTitle className="text-2xl">Deposit {meta.nativeSymbol}</DialogTitle>
          <DialogDescription>Send only native {meta.nativeSymbol} on {meta.name} (chain {meta.chainId}) to this address. Bridge it to {meta.name} first if your ETH is on another network.</DialogDescription>
        </DialogHeader>
        <div className="mx-auto rounded-2xl bg-white p-3">
          <QRCodeSVG value={wallet.address} size={180} />
        </div>
        <CopyRow value={wallet.address} />
        <p className="flex items-start gap-2 rounded-xl bg-amber/10 p-3 text-xs text-amber ring-1 ring-amber/20">
          <Warning weight="fill" className="mt-0.5 size-4 shrink-0" />
          ETH on Ethereum, Arbitrum or any other network is a different balance. Sending from another chain does not bridge it.
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function WithdrawDialog({ agent, open, onOpenChange }: { agent: MyAgent; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();
  const funded = agent.wallets.filter((w) => (w.balance ?? 0) > 0);
  const [chain, setChain] = useState<ChainKey>(funded[0]?.chain ?? "robinhood");
  const [amount, setAmount] = useState("max");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const wallet = agent.wallets.find((w) => w.chain === chain);
  const meta = CHAINS[chain];
  const destination = to.trim() || address || "";

  const submit = async () => {
    if (!destination) {
      toast.error("Enter a destination address");
      return;
    }
    setBusy(true);
    try {
      const { message } = await api<{ message: string }>(`/me/agents/${agent.id}/challenge`, {
        method: "POST",
        json: { purpose: "withdraw", chain, amount: amount.trim() || "max", to: destination },
      });
      const signature = await signMessageAsync({ message });
      const result = await api<{ txHash: string; amount: string; explorer: string }>(`/me/agents/${agent.id}/withdraw`, {
        method: "POST",
        json: { message, signature },
      });
      toast.success(`Withdrew ${result.amount} ${meta.nativeSymbol}`, {
        action: { label: "View", onClick: () => window.open(result.explorer, "_blank") },
      });
      await qc.invalidateQueries({ queryKey: qk.myAgents });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <span className="eyebrow w-fit">Vault · {agent.name}</span>
          <DialogTitle className="text-2xl">Withdraw ETH</DialogTitle>
          <DialogDescription>Withdrawal sends available ETH after network fees. It does not sell open token positions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={chain} onValueChange={(v) => setChain(v as ChainKey)}>
            <SelectTrigger className="h-11 w-full rounded-xl bg-surface-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {agent.wallets.map((w) => (
                <SelectItem key={w.chain} value={w.chain}>
                  <span className="flex items-center gap-2"><ChainIcon chain={w.chain} className="size-4" />{CHAINS[w.chain].name} · {w.balance?.toFixed(6) ?? "—"} {w.nativeSymbol}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">Amount ({meta.nativeSymbol}) — type a number or “max”</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 w-full rounded-xl bg-surface-2 px-3 font-mono text-sm outline-none ring-1 ring-hairline focus:ring-foreground/30" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">Destination (defaults to your connected wallet)</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={address} className="h-11 w-full rounded-xl bg-surface-2 px-3 font-mono text-xs outline-none ring-1 ring-hairline placeholder:text-faint focus:ring-foreground/30" />
          </label>
          <p className="text-xs text-muted-foreground">Available: <span className="font-mono text-foreground">{wallet?.balance?.toFixed(6) ?? "—"} {meta.nativeSymbol}</span></p>
        </div>
        <PillButton disabled={busy || !(wallet?.balance ?? 0)} onClick={() => void submit()} className="w-full justify-between">
          {busy ? "Sign in your wallet…" : "Sign & withdraw"}
        </PillButton>
      </DialogContent>
    </Dialog>
  );
}

export function ExportKeysDialog({ agent, open, onOpenChange }: { agent: MyAgent; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<{ evm: { address: string; privateKey: string } } | null>(null);
  const [visible, setVisible] = useState(false);

  const reveal = async () => {
    setBusy(true);
    try {
      const { message } = await api<{ message: string }>(`/me/agents/${agent.id}/challenge`, { method: "POST", json: { purpose: "export-keys" } });
      const signature = await signMessageAsync({ message });
      setKeys(await api(`/me/agents/${agent.id}/export`, { method: "POST", json: { message, signature } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setKeys(null);
          setVisible(false);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <span className="eyebrow w-fit"><Key weight="light" className="size-3" /> Custodial vault</span>
          <DialogTitle className="text-2xl">Export private key</DialogTitle>
          <DialogDescription>Anyone with this key can move the vault&apos;s funds. Keep it private and hide it when you are done.</DialogDescription>
        </DialogHeader>
        {!keys ? (
          <PillButton disabled={busy} onClick={() => void reveal()} className="w-full justify-between" variant="dark">
            {busy ? "Sign in your wallet…" : "Sign to reveal the key"}
          </PillButton>
        ) : (
          <div className="space-y-4">
            <button type="button" onClick={() => setVisible((v) => !v)} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
              {visible ? <EyeSlash weight="light" className="size-4" /> : <Eye weight="light" className="size-4" />} {visible ? "Hide key" : "Show key"}
            </button>
            <div className="space-y-2">
              <p className="break-all text-xs text-muted-foreground">{keys.evm.address}</p>
              {visible ? <CopyRow value={keys.evm.privateKey} /> : <p className="rounded-xl bg-surface-2 px-3 py-2.5 font-mono text-xs text-faint ring-1 ring-hairline">•••••••••••••••••••••••••••••••</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
