import { ROBINHOOD_NETWORK } from "@elyagents/shared";
import { robinhood } from "viem/chains";
import { createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors";

/** Launches and vault deposits happen here. */
export const launchChain = robinhood;

/**
 * Browser wallets are discovered through EIP-6963 (MetaMask, Rabby, Coinbase and
 * others). Sign-in is chain-agnostic; launches and deposits happen on Robinhood Chain.
 */
export const wagmiConfig = createConfig({
  chains: [robinhood],
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: true,
  ssr: true,
  transports: {
    // Some networks intercept the public endpoint, so the backups matter even for reads.
    [robinhood.id]: fallback([
      http(process.env.NEXT_PUBLIC_RPC_ROBINHOOD || ROBINHOOD_NETWORK.rpc),
      ...ROBINHOOD_NETWORK.backupRpcs.map((url) => http(url)),
    ]),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
