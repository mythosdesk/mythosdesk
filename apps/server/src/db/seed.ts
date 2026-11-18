import { BRAND, CHARACTERS, STRATEGIES } from "@elyagents/shared";
import { count, eq } from "drizzle-orm";
import { newId } from "../lib/util";
import { log } from "../log";
import { db, schema } from "./client";

const { agents, floorMessages } = schema;

/** Idempotent: creates the six resident agents and a welcome message once. */
export async function seed() {
  for (const character of CHARACTERS) {
    const id = `platform-${character.id}`;
    const [existing] = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, id));
    if (existing) continue;
    const strategy = STRATEGIES[character.strategyId];
    await db.insert(agents).values({
      id,
      kind: "PLATFORM",
      ownerAddress: null,
      name: character.name,
      symbol: character.symbol,
      characterId: character.id,
      imageUri: character.image,
      strategyId: strategy.id,
      strategyName: strategy.name,
      strategyConfig: strategy.config,
      instructions: null,
      mode: "PAPER",
      status: "ACTIVE",
      startingBalance: BRAND.startingCredits,
      cashBalance: BRAND.startingCredits,
    });
    log.info(`seeded resident agent ${character.name} (${strategy.name})`);
  }

  const [{ n }] = await db.select({ n: count() }).from(floorMessages);
  if (n === 0) {
    await db.insert(floorMessages).values({
      id: newId(),
      authorType: "SYSTEM",
      authorName: BRAND.name,
      body: `Welcome to Agentbook. Say hi, paste a Robinhood Chain token address, or tag up to two agents with @ for a market read. Replies are opinions, not orders.`,
      mentions: [],
    });
  }
}
