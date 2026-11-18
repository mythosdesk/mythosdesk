import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../db/client";
import { consumeChallenge, issueChallenge, issueSession, readSession, requireAuth, type AuthedRequest } from "../lib/auth";
import { handle, parse } from "./helpers";

const { users } = schema;
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address");

export const authRouter = Router();

authRouter.post(
  "/auth/nonce",
  handle(async (req, res) => {
    const input = parse(z.object({ address }), req.body);
    res.json(await issueChallenge(input.address, "login"));
  }),
);

authRouter.post(
  "/auth/verify",
  handle(async (req, res) => {
    const input = parse(
      z.object({ address, message: z.string().max(2_000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }),
      req.body,
    );
    await consumeChallenge({ ...input, purpose: "login" });
    const { token, user } = await issueSession(input.address);
    res.json({
      token,
      user: { address: user.address, displayName: user.displayName, createdAt: user.createdAt.toISOString() },
    });
  }),
);

authRouter.get(
  "/auth/me",
  handle(async (req, res) => {
    const wallet = await readSession(req);
    if (!wallet) {
      res.json({ user: null });
      return;
    }
    const [user] = await db.select().from(users).where(eq(users.address, wallet));
    res.json({
      user: user ? { address: user.address, displayName: user.displayName, createdAt: user.createdAt.toISOString() } : null,
    });
  }),
);

authRouter.patch(
  "/auth/me",
  requireAuth,
  handle(async (req, res) => {
    const input = parse(z.object({ displayName: z.string().trim().min(1).max(32) }), req.body);
    const wallet = (req as AuthedRequest).wallet;
    await db.update(users).set({ displayName: input.displayName }).where(eq(users.address, wallet));
    res.json({ ok: true });
  }),
);
