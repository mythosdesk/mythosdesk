/**
 * mythos desk runs on one chain: Robinhood Chain (chain id 4663), Robinhood's
 * Ethereum L2 built on Arbitrum. Gas is paid in ETH. Tokens launch on pons
 * (ponsfamily.com) and trade on its bonding curves and Uniswap pools.
 */
export const CHAIN_KEYS = ["robinhood"] as const;

export type ChainKey = (typeof CHAIN_KEYS)[number];
export type ChainKind = "evm";

export interface ChainMeta {
  key: ChainKey;
  name: string;
  short: string;
  kind: ChainKind;
  chainId: number;
  nativeSymbol: string;
  nativeDecimals: number;
  /** Wrapped native token. Its contract holds every wrapped ETH, so it doubles as a funded sender for simulations. */
  wrappedNative: string;
  /** Quote assets the agents never trade as a target: native ETH as Uniswap v4 lists it, the wrapped coin and the chain's dollar. */
  baseAssets: readonly string[];
  /** DexScreener chain slug. */
  dexscreener: string;
  /** GeckoTerminal network id. */
  gecko: string;
  explorer: string;
  explorerTx: (hash: string) => string;
  explorerAddress: (address: string) => string;
  /** Public fallback RPC. Override with env in production. */
  defaultRpc: string;
  color: string;
  /** Live swap route used for personal vaults. */
  liveRoute: "kyberswap";
}

const evmExplorer = (base: string) => ({
  explorer: base,
  explorerTx: (hash: string) => `${base}/tx/${hash}`,
  explorerAddress: (address: string) => `${base}/address/${address}`,
});

export const CHAINS: Record<ChainKey, ChainMeta> = {
  robinhood: {
    key: "robinhood",
    name: "Robinhood Chain",
    short: "RH",
    kind: "evm",
    chainId: 4663,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    wrappedNative: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    baseAssets: [
      "0x0000000000000000000000000000000000000000",
      "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      // USDG
      "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    ],
    dexscreener: "robinhood",
    gecko: "robinhood",
    ...evmExplorer("https://robinhoodchain.blockscout.com"),
    defaultRpc: "https://rpc.mainnet.chain.robinhood.com",
    color: "#2F9E5B",
    liveRoute: "kyberswap",
  },
};

/** Network parameters for wallets, viem and wagmi. */
export const ROBINHOOD_NETWORK = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  /**
   * Tried in order when the main endpoint fails or rate-limits. Some ISPs intercept the
   * main endpoint, so a reachable fallback matters even in development.
   */
  backupRpcs: ["https://robinhood-rpc.publicnode.com", "https://rpc.ordofi.network"],
  explorer: "https://robinhoodchain.blockscout.com",
  explorerName: "Blockscout",
} as const;

export function isChainKey(value: unknown): value is ChainKey {
  return typeof value === "string" && (CHAIN_KEYS as readonly string[]).includes(value);
}

/** True for a chain's quote assets (ETH, WETH, USDG): buying one with ETH is not a trade. */
export function isBaseAsset(chain: ChainKey, address: string): boolean {
  const target = address.toLowerCase();
  return CHAINS[chain]?.baseAssets.some((a) => a.toLowerCase() === target) ?? false;
}

export function chainByDexscreenerId(id: string): ChainMeta | undefined {
  return Object.values(CHAINS).find((c) => c.dexscreener === id);
}

export const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function looksLikeAddress(value: string): "evm" | null {
  return EVM_ADDRESS_RE.test(value) ? "evm" : null;
}
