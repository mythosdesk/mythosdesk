import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "../env";
import { errorMessage, log } from "../log";

/**
 * Model access (Anthropic API) for agent decisions and Agentbook replies.
 * - Structured outputs guarantee the decision JSON shape.
 * - Server-side fallbacks ("default") re-run a declined request on the
 *   recommended model instead of returning a refusal.
 */
const client = env.aiEnabled
  ? new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      maxRetries: 1,
      timeout: 60_000,
      ...(env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID } } : {}),
    })
  : null;

if (env.ANTHROPIC_API_KEY && !env.AI_MODEL) {
  log.warn("ANTHROPIC_API_KEY is set but AI_MODEL is empty: the rules engine decides and chat uses templates");
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Per-model request options so AI_MODEL can be switched for cost:
 * - effort is rejected by Haiku 4.5 / Sonnet 4.5,
 * - server-side "default" fallbacks exist for Opus 5.x, Fable 5.x and Sonnet 5.5.
 */
const supportsEffort = !/haiku-4-5|sonnet-4-5/.test(env.AI_MODEL);
const supportsFallback = /(opus-5|fable-5|sonnet-5-5)/.test(env.AI_MODEL);
type FallbackParams = Partial<Pick<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, "betas" | "fallbacks">>;
const fallbackOptions: FallbackParams = supportsFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" } : {};
const effortOption = supportsEffort ? { effort: env.AI_EFFORT } : {};

let callsThisTick = 0;
export function resetTickBudget() {
  callsThisTick = 0;
}

export function aiAvailable(kind: "decision" | "chat"): boolean {
  if (!client) return false;
  if (kind === "chat") return env.AI_CHAT_ENABLED;
  return callsThisTick < env.AI_MAX_CALLS_PER_TICK;
}

export async function aiJson<S extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S> | null> {
  if (!client) return null;
  callsThisTick += 1;
  try {
    const response = await client.beta.messages.parse({
      model: env.AI_MODEL,
      max_tokens: opts.maxTokens ?? 4_000,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      output_config: { ...effortOption, format: zodOutputFormat(opts.schema) },
      ...fallbackOptions,
    });
    if (response.stop_reason === "refusal") {
      log.warn(`ai decision refused (${response.stop_details?.category ?? "unknown"})`);
      return null;
    }
    return (response.parsed_output as z.infer<S> | null) ?? null;
  } catch (err) {
    logApiError("decision", err);
    return null;
  }
}

export async function aiText(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens?: number;
}): Promise<string | null> {
  if (!client) return null;
  try {
    const response = await client.beta.messages.create({
      model: env.AI_MODEL,
      max_tokens: opts.maxTokens ?? 2_000,
      system: opts.system,
      messages: opts.messages,
      ...(supportsEffort ? { output_config: effortOption } : {}),
      ...fallbackOptions,
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    logApiError("chat", err);
    return null;
  }
}

function logApiError(kind: string, err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) {
    log.error(`ai ${kind}: invalid ANTHROPIC_API_KEY`);
  } else if (err instanceof Anthropic.RateLimitError) {
    log.warn(`ai ${kind}: rate limited`);
  } else if (err instanceof Anthropic.BadRequestError) {
    log.warn(`ai ${kind}: bad request — ${err.message}`);
  } else if (err instanceof Anthropic.APIError) {
    log.warn(`ai ${kind}: api error ${err.status} — ${err.message}`);
  } else {
    log.warn(`ai ${kind}: ${errorMessage(err)}`);
  }
}
