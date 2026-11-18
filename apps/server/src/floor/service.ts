import {
  CHAINS,
  CHARACTERS,
  characterFor,
  isChainKey,
  looksLikeAddress,
  STRATEGIES,
  type ChainKey,
  type FloorMessage,
  type FloorTab,
  type MarketToken,
} from "@elyagents/shared";
import { and, desc, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { aiAvailable, aiText } from "../ai/model";
import { chatSystemPrompt } from "../ai/prompts";
import { db, schema } from "../db/client";
import { HttpProblem } from "../lib/auth";
import { fmtPct, fmtUsd, newId, truncate } from "../lib/util";
import { errorMessage, log } from "../log";
import { market } from "../market/service";
import { emit } from "../realtime";
import { toFloorMessage, type FloorRow } from "../serializers";
import { scoreFor } from "../engine/screen";

const { floorMessages, agents } = schema;

export const MAX_MESSAGE = 600;
const MAX_MENTIONS = 2;

export async function listMessages(tab: FloorTab, before?: string, limit = 60): Promise<FloorMessage[]> {
  const filters = [];
  if (tab === "token") filters.push(isNotNull(floorMessages.tokenAddress));
  if (tab === "agent") filters.push(eq(floorMessages.authorType, "AGENT"));
  if (before) filters.push(lt(floorMessages.createdAt, new Date(before)));
  const rows = await db
    .select()
    .from(floorMessages)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(floorMessages.createdAt))
    .limit(Math.min(limit, 100));
  const replyIds = rows.map((r) => r.replyToId).filter((id): id is string => Boolean(id));
  const replies = replyIds.length
    ? await db.select().from(floorMessages).where(inArray(floorMessages.id, replyIds))
    : [];
  const byId = new Map(replies.map((r) => [r.id, r]));
  return rows.reverse().map((r) => toFloorMessage(r, r.replyToId ? byId.get(r.replyToId) : null));
}

/** Tokens recently shared in the room ("On the table"). */
export async function sharedTokens(limit = 8) {
  const rows = await db
    .select()
    .from(floorMessages)
    .where(isNotNull(floorMessages.tokenAddress))
    .orderBy(desc(floorMessages.createdAt))
    .limit(40);
  const seen = new Set<string>();
  const out: FloorMessage["token"][] = [];
  for (const row of rows) {
    const msg = toFloorMessage(row);
    if (!msg.token) continue;
    const key = `${msg.token.chain}:${msg.token.address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(msg.token);
    if (out.length >= limit) break;
  }
  return out;
}

/** Map "@vespera"/"@Cipher-01" mentions to resident characters. */
function parseMentions(body: string, explicit: string[] = []): string[] {
  const ids = new Set(explicit.filter((id) => CHARACTERS.some((c) => c.id === id)));
  for (const match of body.matchAll(/@([a-z][\w-]{1,20})/gi)) {
    const found = CHARACTERS.find((c) => c.id === match[1].toLowerCase() || c.name.toLowerCase() === match[1].toLowerCase());
    if (found) ids.add(found.id);
  }
  return [...ids].slice(0, MAX_MENTIONS);
}

function detectAddress(body: string): string | null {
  for (const word of body.split(/[\s,()]+/)) {
    if (looksLikeAddress(word)) return word;
  }
  return null;
}

// Simple per-author rate limit: 6 messages per minute.
const recentPosts = new Map<string, number[]>();
function checkRate(key: string) {
  const now = Date.now();
  const list = (recentPosts.get(key) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 6) throw new HttpProblem(429, "Slow down — you can post 6 messages per minute.");
  list.push(now);
  recentPosts.set(key, list);
}

export async function postMessage(input: {
  authorName: string;
  authorAddress: string | null;
  rateKey: string;
  body: string;
  replyToId?: string | null;
  token?: { chain: string; address: string } | null;
  mentions?: string[];
}): Promise<FloorMessage> {
  const body = input.body.trim();
  if (!body) throw new HttpProblem(400, "Message is empty");
  if (body.length > MAX_MESSAGE) throw new HttpProblem(400, `Messages are limited to ${MAX_MESSAGE} characters`);
  const authorName = input.authorName.trim().slice(0, 32) || "anon";
  checkRate(input.rateKey);

  // Token context: explicit share, or an address pasted into the message.
  let tokenChain: ChainKey | null = null;
  let tokenAddress: string | null = null;
  if (input.token && isChainKey(input.token.chain) && looksLikeAddress(input.token.address)) {
    tokenChain = input.token.chain;
    tokenAddress = input.token.address;
  } else {
    const pasted = detectAddress(body);
    if (pasted) {
      tokenAddress = pasted;
      tokenChain = "robinhood";
    }
  }
  let snapshot: MarketToken | null = null;
  if (tokenChain && tokenAddress) {
    snapshot = await market.token(tokenChain, tokenAddress).catch(() => null);
  }

  let replyTo: FloorRow | null = null;
  if (input.replyToId) {
    [replyTo] = await db.select().from(floorMessages).where(eq(floorMessages.id, input.replyToId));
    // Carry the replied message's token context forward.
    if (replyTo && !tokenAddress && replyTo.tokenAddress && isChainKey(replyTo.tokenChain)) {
      tokenChain = replyTo.tokenChain;
      tokenAddress = replyTo.tokenAddress;
      snapshot = replyTo.tokenSnapshot ?? null;
    }
  }

  const mentions = parseMentions(body, input.mentions);
  const row = {
    id: newId(),
    authorType: "USER" as const,
    authorName,
    authorAddress: input.authorAddress,
    characterId: null,
    body,
    replyToId: replyTo?.id ?? null,
    tokenChain,
    tokenAddress,
    tokenSymbol: snapshot?.symbol ?? null,
    tokenName: snapshot?.name ?? null,
    tokenSnapshot: snapshot,
    mentions,
    createdAt: new Date(),
  };
  await db.insert(floorMessages).values(row);
  const message = toFloorMessage(row, replyTo);
  emit("floor:message", message);

  void respond(row, replyTo, snapshot).catch((err) => log.warn(`agentbook reply failed: ${errorMessage(err)}`));
  return message;
}

/** Pick who answers: mentioned agents, the agent being replied to, or the best fit. */
function chooseResponders(row: FloorRow, replyTo: FloorRow | null, snapshot: MarketToken | null): string[] {
  const mentioned = row.mentions ?? [];
  if (mentioned.length) return mentioned;
  if (replyTo?.authorType === "AGENT" && replyTo.characterId) return [replyTo.characterId];
  if (snapshot) {
    const best = [...CHARACTERS].sort(
      (a, b) => scoreFor(b.strategyId, snapshot) - scoreFor(a.strategyId, snapshot),
    )[0];
    return [best.id];
  }
  return [CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id];
}

async function respond(row: FloorRow, replyTo: FloorRow | null, snapshot: MarketToken | null) {
  const responders = chooseResponders(row, replyTo, snapshot);
  const context = await db.select().from(floorMessages).orderBy(desc(floorMessages.createdAt)).limit(12);
  const transcript = context
    .reverse()
    .filter((m) => m.id !== row.id)
    .map((m) => `${m.authorName}${m.authorType === "AGENT" ? " (agent)" : ""}: ${truncate(m.body, 280)}`)
    .join("\n");

  for (const characterId of responders) {
    const character = characterFor(characterId);
    const [agentRow] = await db.select().from(agents).where(eq(agents.id, `platform-${character.id}`));
    const agentName = agentRow?.name ?? character.name;
    const strategyName = agentRow?.strategyName ?? STRATEGIES[character.strategyId].name;

    let text: string | null = null;
    if (aiAvailable("chat")) {
      const tokenBlock = snapshot
        ? `\n\nToken snapshot (${CHAINS[snapshot.chain].name}): ${JSON.stringify({
            symbol: snapshot.symbol,
            name: snapshot.name,
            priceUsd: snapshot.priceUsd,
            liquidityUsd: Math.round(snapshot.liquidityUsd),
            volume24hUsd: Math.round(snapshot.volume24hUsd),
            marketCapUsd: Math.round(snapshot.marketCapUsd),
            change5mPct: snapshot.priceChange5m,
            change1hPct: snapshot.priceChange1h,
            change24hPct: snapshot.priceChange24h,
            txns1h: snapshot.txns1h,
            pairAgeHours: snapshot.pairCreatedAt ? Math.round((Date.now() - snapshot.pairCreatedAt) / 3_600_000) : null,
          })}`
        : row.tokenAddress
          ? `\n\nA token address was shared (${row.tokenAddress} on ${row.tokenChain}) but no market data was found for it.`
          : "";
      text = await aiText({
        system: chatSystemPrompt({ name: agentName, characterId: character.id, strategyName }),
        messages: [
          {
            role: "user",
            content: `Recent room messages:\n${transcript || "(quiet room)"}\n\nNew message from ${row.authorName}: ${row.body}${tokenBlock}\n\nReply as ${agentName}.`,
          },
        ],
      });
    }
    if (!text) text = templateReply(character.id, row.body, snapshot, Boolean(row.tokenAddress));

    const reply = {
      id: newId(),
      authorType: "AGENT" as const,
      authorName: agentName,
      authorAddress: null,
      characterId: character.id,
      body: truncate(text, 600),
      replyToId: row.id,
      tokenChain: row.tokenChain,
      tokenAddress: row.tokenAddress,
      tokenSymbol: row.tokenSymbol,
      tokenName: row.tokenName,
      tokenSnapshot: snapshot,
      mentions: [],
      createdAt: new Date(),
    };
    await db.insert(floorMessages).values(reply);
    emit("floor:message", toFloorMessage(reply, row));
  }
}

/** Offline persona replies used when no AI key is configured. */
function templateReply(characterId: string, body: string, t: MarketToken | null, hadAddress: boolean): string {
  const c = characterFor(characterId);
  if (!t) {
    if (hadAddress) return `${c.name} here. I can't find market data for that address on Robinhood Chain yet. Check the address, or it may be too new for the feeds.`;
    const lines: Record<string, string[]> = {
      charon: ["Slow crossing today. I let the noise drift past.", "Patience is a position too. Paste a contract if you want my read on its depth."],
      hermes: ["Things are moving. Drop a contract and I will tell you if it is scalpable or just twitching.", "In fast, out faster. What are we looking at?"],
      talos: ["Breakouts need proof. Volume. Real transactions. Do you have a token?", "Waiting for a clean breakout with buyers behind it."],
      persephone: ["Everything goes down. Not everything comes back. What are you looking at?", "Controlled pullbacks are my season. Share one and I will check if it is returning."],
      argus: ["All eyes on liquidity, volume, activity and momentum. Share a token and I will tell you which signals agree.", "Loud is not the same as aligned. What should I look at?"],
      cerberus: ["New pools at the gate. One head on liquidity, one on sells, one on activity. Got a fresh pair?", "Safety checks first, tiny size only. What did you find?"],
    };
    const options = lines[c.id] ?? lines.charon;
    void body;
    return options[Math.floor(Math.random() * options.length)];
  }
  const ageH = t.pairCreatedAt ? (Date.now() - t.pairCreatedAt) / 3_600_000 : null;
  const txns = t.txns1h.buys + t.txns1h.sells;
  const share = txns ? Math.round((t.txns1h.buys / txns) * 100) : 0;
  const facts = `${t.symbol}: ${fmtUsd(t.liquidityUsd)} liquidity, ${fmtUsd(t.volume24hUsd)} 24h volume, ${fmtPct(t.priceChange1h)} 1h, ${txns} txns last hour (${share}% buys)${ageH !== null ? `, ${ageH < 48 ? `${Math.round(ageH)}h` : `${Math.round(ageH / 24)}d`} old` : ""}.`;
  const takes: Record<string, string> = {
    charon: t.liquidityUsd > 60_000 && (ageH ?? 0) > 24 ? "Deep water, and it has been here a while. I would cross this one, with a small boat." : "Too shallow or too young for my boat. I want more depth and more history first.",
    hermes: t.priceChange5m > 0.2 && txns > 25 ? "It is moving and people are trading it. Scalpable, tight stop, short clock." : "Not enough fast movement to bother. I am gone until activity picks up.",
    talos: t.priceChange1h > 2 && share > 45 ? "Move confirmed by buyers. Breakout candidate if volume holds." : "No confirmed breakout. Volume and buyers must line up first.",
    persephone: t.priceChange1h < -1 && t.priceChange5m >= 0 ? "It went down and the last candle is turning up. That is the kind of return I buy." : "Nothing here is coming back yet. I will wait.",
    argus: "Signals I see: liquidity, volume and activity are " + (t.liquidityUsd > 25_000 && t.volume24hUsd > 50_000 ? "aligned, momentum is the open question." : "not aligned yet. Plenty of noise, not enough eyes agree."),
    cerberus: (ageH ?? 999) < 6
      ? share > 85
        ? "Fresh pool, but almost nobody is selling. That can mean sells are blocked. Gate stays shut until sells show up."
        : "Fresh pool and sells are going through. Still the riskiest place on the chain. Tiny size only."
      : "Not fresh anymore. My gate is for pools that are minutes or hours old.",
  };
  return `${facts} ${takes[c.id] ?? takes.charon} Market read only, not advice.`;
}

export async function removeOldMessages() {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  await db.delete(floorMessages).where(or(lt(floorMessages.createdAt, cutoff)));
}
