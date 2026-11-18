"use client";

import { ArrowUpRight, ShieldCheck, Wallet } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAccount, useConnect, useConnectors } from "wagmi";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/lib/session";

export function ConnectDialog() {
  const { connectOpen, setConnectOpen, signIn } = useSession();
  const connectors = useConnectors();
  const { connectAsync, isPending, variables } = useConnect();
  const { isConnected } = useAccount();
  const pendingSignIn = useRef(false);

  // Once the wallet connects from this dialog, ask it to sign in.
  useEffect(() => {
    if (isConnected && pendingSignIn.current) {
      pendingSignIn.current = false;
      setConnectOpen(false);
      void signIn();
    }
  }, [isConnected, setConnectOpen, signIn]);

  // EIP-6963 wallets come first; hide the generic injected entry when a named one exists.
  const list = connectors.filter((c, _, all) => !(c.id === "injected" && all.length > 1));

  return (
    <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
      <DialogContent>
        <DialogHeader>
          <span className="eyebrow w-fit">EVM wallet</span>
          <DialogTitle className="text-2xl">Connect your wallet</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Your wallet owns your account and signs agent actions. Signing in never costs gas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {list.length === 0 && (
            <div className="panel p-4 text-sm text-muted-foreground">
              No browser wallet detected. Install{" "}
              <a className="font-medium text-foreground underline underline-offset-4" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                MetaMask
              </a>{" "}
              or{" "}
              <a className="font-medium text-foreground underline underline-offset-4" href="https://rabby.io" target="_blank" rel="noreferrer">
                Rabby
              </a>
              , then reload this page.
            </div>
          )}
          {list.map((connector) => {
            const busy = isPending && variables?.connector && "id" in variables.connector && variables.connector.id === connector.id;
            return (
              <button
                key={connector.uid}
                type="button"
                disabled={isPending}
                onClick={async () => {
                  pendingSignIn.current = true;
                  try {
                    await connectAsync({ connector });
                  } catch (err) {
                    pendingSignIn.current = false;
                    const msg = err instanceof Error ? err.message : "Connection failed";
                    toast.error(/rejected|denied/i.test(msg) ? "Connection request was rejected" : msg.split("\n")[0]);
                  }
                }}
                className="group flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left ring-1 ring-hairline transition-all duration-500 ease-[var(--ease-spring)] hover:bg-surface-3 hover:ring-hairline-strong active:scale-[0.98] disabled:opacity-60"
              >
                <span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-foreground/5 ring-1 ring-hairline">
                  {connector.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={connector.icon} alt="" className="size-6" />
                  ) : (
                    <Wallet weight="light" className="size-5 text-muted-foreground" />
                  )}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{connector.name === "Injected" ? "Browser wallet" : connector.name}</span>
                  <span className="block text-xs text-muted-foreground">{busy ? "Check your wallet…" : "Detected in this browser"}</span>
                </span>
                <span className="grid size-8 place-items-center rounded-full bg-foreground/5 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-translate-y-px group-hover:translate-x-0.5">
                  <ArrowUpRight weight="light" className="size-4" />
                </span>
              </button>
            );
          })}
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck weight="light" className="mt-0.5 size-4 shrink-0 text-up" />
          Connecting shares only your public address. We never ask for a seed phrase or private key.
        </p>
      </DialogContent>
    </Dialog>
  );
}
