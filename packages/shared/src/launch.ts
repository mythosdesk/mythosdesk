/**
 * Token launches go through pons v2 (ponsfamily.com) on Robinhood Chain. The creator's own
 * wallet calls the pons factory: the token trades on a bonding curve, and when the curve sells
 * out it graduates into a Uniswap v4 pool whose liquidity is locked permanently.
 * mythos desk deploys no launch contract of its own and never holds launch funds.
 *
 * Reference: https://docs.ponsfamily.com/v2
 */
export const PONS = {
  name: "pons",
  site: "https://ponsfamily.com",
  docs: "https://docs.ponsfamily.com/v2",
  /** pons v2 launch factory. A new pons stack ships a new factory, so the server lets env override it. */
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  /** Optional router that creates a launch and buys into it in one transaction. */
  launchAndBuy: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
} as const;

/** The zero address selects native ETH as a launch's quote asset. */
export const PONS_NATIVE_PAIR = "0x0000000000000000000000000000000000000000";

const PONS_STRUCTS = [
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
] as const;

export const PONS_FACTORY_ABI = [
  ...PONS_STRUCTS,
  "struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }",
  "function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)",
  "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
  "function launchFee() view returns (uint256)",
  "function canLaunch(address account) view returns (bool)",
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (LaunchConfig)",
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  "function getLaunchedToken(address token) view returns (LaunchedToken)",
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
] as const;

/** `phase` in the pons launch record. pons says to route by it rather than infer it. */
export const PONS_PHASES = ["On the pons curve", "Curve closed, pool pending", "Trading on Uniswap v4", "Rescued by pons"] as const;

/**
 * Tokens a first buy gets on a fresh pons curve: constant product on the phantom reserve, after the
 * curve fee. It matched pons' own launch-and-buy output exactly in a simulation on 2026-11-18. The
 * launch-and-buy recipient pays no opening snipe tax, so nothing else comes off.
 */
export function estimateFirstBuy(quoteInWei: bigint, phantomQuoteWei: bigint, supplyTokens: number, curveFeeBps: number): { tokens: number; shareOfSupply: number } {
  if (quoteInWei <= 0n || phantomQuoteWei <= 0n || supplyTokens <= 0) return { tokens: 0, shareOfSupply: 0 };
  const net = Number(quoteInWei) * (1 - curveFeeBps / 10_000);
  const tokens = (supplyTokens * net) / (Number(phantomQuoteWei) + net);
  return { tokens, shareOfSupply: tokens / supplyTokens };
}

export const PONS_LAUNCH_AND_BUY_ABI = [
  ...PONS_STRUCTS,
  "function launchAndBuy(TokenParams params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)",
] as const;

export interface LaunchConfig {
  chainId: number;
  chainName: string;
  explorer: string;
  /** pons factory and launch-and-buy router the browser should call. */
  factory: string;
  launchAndBuy: string;
  /** True once the factory answered and an open launch config exists. */
  deployed: boolean;
  /** False while pons only lets whitelisted wallets launch. Check canLaunch(wallet) before signing. */
  publicLaunchOpen: boolean;
  launchFeeWei: string | null;
  launchConfigId: string | null;
  /** Whole tokens, from the launch config. */
  totalSupply: number | null;
  /** ETH the curve must raise before it graduates, in wei. */
  graduationThresholdWei: string | null;
  /** Virtual ETH reserve that sets the opening price, in wei. */
  phantomQuoteWei: string | null;
  curveFeeBps: number | null;
  error: string | null;
}
