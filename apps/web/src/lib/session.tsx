"use client";

import type { SessionUser } from "@elyagents/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { api, getToken, setToken } from "./api";

interface SessionValue {
  user: SessionUser | null;
  /** Wallet connected but not yet signed in. */
  needsSignIn: boolean;
  signingIn: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => void;
  connectOpen: boolean;
  setConnectOpen: (open: boolean) => void;
  /** Opens the connect dialog or signs in, whichever is needed. */
  requireSession: () => Promise<boolean>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  // Restore a saved session.
  useEffect(() => {
    if (!getToken()) return;
    api<{ user: SessionUser | null }>("/auth/me")
      .then(({ user }) => {
        if (user) setUser(user);
        else setToken(null);
      })
      .catch(() => setToken(null));
  }, []);

  // A different wallet means a different account.
  useEffect(() => {
    if (user && address && user.address !== address.toLowerCase()) {
      setToken(null);
      setUser(null);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  }, [address, user, queryClient]);

  const signIn = useCallback(async () => {
    if (!address) return false;
    setSigningIn(true);
    try {
      const { message } = await api<{ message: string }>("/auth/nonce", { method: "POST", json: { address } });
      const signature = await signMessageAsync({ message });
      const result = await api<{ token: string; user: SessionUser }>("/auth/verify", {
        method: "POST",
        json: { address, message, signature },
      });
      setToken(result.token);
      setUser(result.user);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Signed in", { description: "Your wallet now owns this account." });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      toast.error(/rejected|denied/i.test(msg) ? "Signature request was rejected" : msg);
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [address, signMessageAsync, queryClient]);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    disconnect();
    void queryClient.removeQueries({ queryKey: ["me"] });
  }, [disconnect, queryClient]);

  const requireSession = useCallback(async () => {
    if (user) return true;
    if (!isConnected) {
      setConnectOpen(true);
      return false;
    }
    return signIn();
  }, [user, isConnected, signIn]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      needsSignIn: Boolean(isConnected && !user),
      signingIn,
      signIn,
      signOut,
      connectOpen,
      setConnectOpen,
      requireSession,
    }),
    [user, isConnected, signingIn, signIn, signOut, connectOpen, requireSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
