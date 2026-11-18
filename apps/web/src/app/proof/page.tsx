import type { Metadata } from "next";
import { ProofPage } from "@/components/pages/proof-page";

export const metadata: Metadata = {
  title: "Proof",
  description: "Every claim on mythos desk with the evidence behind it: engine heartbeat, paper and live trades, vaults, pons launch terms and the token's on-chain record.",
};

export default function Page() {
  return <ProofPage />;
}
