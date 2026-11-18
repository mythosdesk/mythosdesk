import { randomBytes } from "node:crypto";
import { BRAND } from "@elyagents/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { db, schema } from "../db/client";
import { env } from "../env";

const { authNonces, users } = schema;
const secret = new TextEncoder().encode(env.jwtSecret);
const NONCE_TTL_MS = 10 * 60_000;

export type SignPurpose = "login" | "withdraw" | "export-keys";

const PURPOSE_TEXT: Record<SignPurpose, string> = {
  login: "Sign in to your account. This request will not trigger a transaction or cost any gas.",
  withdraw: "Authorise a withdrawal from your agent vault.",
  "export-keys": "Reveal the private keys of your agent vault. Anyone with these keys can move its funds.",
};

/** Builds the exact text the wallet signs; the server stores it and later compares byte for byte. */
export async function issueChallenge(address: string, purpose: SignPurpose, scope: Record<string, unknown> = {}) {
  if (!isAddress(address)) throw new HttpProblem(400, "Invalid wallet address");
  const checksum = getAddress(address);
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const details = Object.entries(scope)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("\n");
  const message = [
    `${BRAND.name} — ${purpose === "login" ? "Sign in" : purpose === "withdraw" ? "Withdraw" : "Export keys"}`,
    "",
    PURPOSE_TEXT[purpose],
    "",
    `Wallet: ${checksum}`,
    details,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt.toISOString()}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  await db.insert(authNonces).values({
    nonce,
    address: checksum.toLowerCase(),
    purpose,
    message,
    scope,
    expiresAt: new Date(issuedAt.getTime() + NONCE_TTL_MS),
  });
  return { nonce, message };
}

/** Verifies a signed challenge once; returns the stored scope. */
export async function consumeChallenge(params: {
  address: string;
  message: string;
  signature: string;
  purpose: SignPurpose;
}): Promise<Record<string, unknown>> {
  const nonce = /Nonce: ([0-9a-f]{32})/.exec(params.message)?.[1];
  if (!nonce) throw new HttpProblem(400, "Malformed message");
  const [row] = await db
    .select()
    .from(authNonces)
    .where(and(eq(authNonces.nonce, nonce), isNull(authNonces.usedAt), gt(authNonces.expiresAt, new Date())));
  if (!row || row.purpose !== params.purpose || row.address !== params.address.toLowerCase() || row.message !== params.message) {
    throw new HttpProblem(401, "Signature request expired or already used. Try again.");
  }
  const valid = await verifyMessage({
    address: getAddress(params.address),
    message: params.message,
    signature: params.signature as Hex,
  }).catch(() => false);
  if (!valid) throw new HttpProblem(401, "Signature does not match the wallet");
  await db.update(authNonces).set({ usedAt: new Date() }).where(eq(authNonces.nonce, nonce));
  return row.scope ?? {};
}

export async function issueSession(address: string) {
  const lower = address.toLowerCase();
  await db
    .insert(users)
    .values({ address: lower })
    .onConflictDoUpdate({ target: users.address, set: { lastSeenAt: new Date() } });
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(lower)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
  const [user] = await db.select().from(users).where(eq(users.address, lower));
  return { token, user };
}

export async function readSession(req: Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), secret, { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export interface AuthedRequest extends Request {
  wallet: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  void readSession(req).then((wallet) => {
    if (!wallet) {
      res.status(401).json({ error: "Connect and sign in with your wallet first." });
      return;
    }
    (req as AuthedRequest).wallet = wallet;
    next();
  });
}

export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
