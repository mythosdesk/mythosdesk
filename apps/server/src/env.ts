import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CHAIN_KEYS, CHAINS, PONS, type ChainKey } from "@elyagents/shared";

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const num = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().finite());

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: num(4000),
  /** Bind address. Use 127.0.0.1 behind a reverse proxy. */
  HOST: z.string().default("0.0.0.0"),
  /** Proxy hops in front of the API (Cloudflare + Caddy = 2) so req.ip is the real client. */
  TRUST_PROXY: num(1),
  /** Comma separated list of allowed browser origins. */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /** Public URL of this server, used for uploaded logo URLs. */
  PUBLIC_SERVER_URL: z.string().default("http://localhost:4000"),
  DATA_DIR: z.string().default(".data"),
  /** Postgres connection string. Empty = embedded PGlite in DATA_DIR. */
  DATABASE_URL: z.string().optional().default(""),

  JWT_SECRET: z.string().optional().default(""),
  /** 32-byte hex key used to encrypt custodial agent wallets. BACK THIS UP. */
  WALLET_ENCRYPTION_KEY: z.string().optional().default(""),

  ANTHROPIC_API_KEY: z.string().optional().default(""),
  /** Needed only for API keys that are not scoped to a workspace (wrkspc_…). */
  ANTHROPIC_WORKSPACE_ID: z.string().optional().default(""),
  /** Anthropic model id. Model decisions and chat stay off until both the key and the model are set. */
  AI_MODEL: z.string().optional().default(""),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  AI_MAX_CALLS_PER_TICK: num(8),
  AI_CHAT_ENABLED: bool(true),

  ENGINE_ENABLED: bool(true),
  ENGINE_TICK_SECONDS: num(60),
  MARKET_REFRESH_SECONDS: num(90),

  LIVE_TRADING_ENABLED: bool(false),
  /** Robinhood Chain swaps via the KyberSwap aggregator (no key needed). */
  ROBINHOOD_LIVE_ENABLED: bool(true),
  KYBERSWAP_API_URL: z.string().default("https://aggregator-api.kyberswap.com"),
  KYBERSWAP_CLIENT_ID: z.string().default("elyagents"),
  /** Only needed for the keyed gateway (KYBERSWAP_API_URL=https://api.kyberswap.com/swap). */
  KYBERSWAP_API_KEY: z.string().optional().default(""),
  LIVE_SLIPPAGE_BPS: num(1500),

  /** Use a provider endpoint in production: the public RPC is shared by every user. */
  RPC_ROBINHOOD: z.string().optional().default(""),

  PINATA_JWT: z.string().optional().default(""),
  PINATA_GATEWAY: z.string().default("https://gateway.pinata.cloud/ipfs/"),

  /** Official token contract shown on the home page and burn page. */
  OFFICIAL_TOKEN_CHAIN: z.string().default("robinhood"),
  OFFICIAL_TOKEN_ADDRESS: z.string().optional().default(""),

  /** Token launches go through pons v2. Override only when pons ships a new stack. */
  PONS_FACTORY_ADDRESS: z.string().optional().default(PONS.factory),
  PONS_LAUNCH_AND_BUY_ADDRESS: z.string().optional().default(PONS.launchAndBuy),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", z.treeifyError(parsed.error));
  process.exit(1);
}

const raw = parsed.data;
const dataDir = path.resolve(process.cwd(), raw.DATA_DIR);
mkdirSync(dataDir, { recursive: true });

/**
 * Development convenience: generate and persist secrets so tokens and wallets
 * survive restarts. Production must set them explicitly.
 */
function persistedSecret(name: "JWT_SECRET" | "WALLET_ENCRYPTION_KEY", value: string): string {
  if (value) return value;
  if (raw.NODE_ENV === "production") {
    console.error(`${name} must be set in production.`);
    process.exit(1);
  }
  const file = path.join(dataDir, "dev-secrets.json");
  const store: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  if (!store[name]) {
    store[name] = randomBytes(32).toString("hex");
    writeFileSync(file, JSON.stringify(store, null, 2), { mode: 0o600 });
    console.warn(`[env] Generated a development ${name} in ${file}. Set it explicitly in production.`);
  }
  return store[name];
}

/** /api/launches/config sends these values to browsers, so only ever accept a contract address. */
function contractAddress(name: string, value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return trimmed;
  console.error(`[env] ${name} must be a contract address (0x + 40 hex chars); using the default. Never put a private key here.`);
  return fallback;
}

const rpcOverrides: Record<ChainKey, string> = {
  robinhood: raw.RPC_ROBINHOOD,
};

export const env = {
  ...raw,
  dataDir,
  isProd: raw.NODE_ENV === "production",
  webOrigins: raw.WEB_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
  jwtSecret: persistedSecret("JWT_SECRET", raw.JWT_SECRET),
  walletKey: persistedSecret("WALLET_ENCRYPTION_KEY", raw.WALLET_ENCRYPTION_KEY),
  PONS_FACTORY_ADDRESS: contractAddress("PONS_FACTORY_ADDRESS", raw.PONS_FACTORY_ADDRESS, PONS.factory),
  PONS_LAUNCH_AND_BUY_ADDRESS: contractAddress("PONS_LAUNCH_AND_BUY_ADDRESS", raw.PONS_LAUNCH_AND_BUY_ADDRESS, PONS.launchAndBuy),
  aiEnabled: Boolean(raw.ANTHROPIC_API_KEY && raw.AI_MODEL),
  /** Explicit RPC per chain, or "" to use the public endpoint with its fallbacks. */
  rpcOverride: rpcOverrides,
  rpc: Object.fromEntries(
    CHAIN_KEYS.map((key) => [key, rpcOverrides[key] || CHAINS[key].defaultRpc]),
  ) as Record<ChainKey, string>,
};

/** Whether the worker may send real swaps from vaults on a chain. */
export function liveExecutionEnabled(chain: ChainKey): boolean {
  if (!env.LIVE_TRADING_ENABLED) return false;
  return CHAINS[chain].liveRoute === "kyberswap" && env.ROBINHOOD_LIVE_ENABLED;
}
