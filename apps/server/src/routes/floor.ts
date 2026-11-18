import type { FloorTab } from "@elyagents/shared";
import { Router } from "express";
import { z } from "zod";
import { readSession } from "../lib/auth";
import { listMessages, MAX_MESSAGE, postMessage, sharedTokens } from "../floor/service";
import { handle, parse, str } from "./helpers";

const TABS: FloorTab[] = ["conversation", "token", "agent"];

const PostSchema = z.object({
  displayName: z.string().trim().min(1).max(32),
  body: z.string().trim().min(1).max(MAX_MESSAGE),
  replyToId: z.string().uuid().nullish(),
  token: z.object({ chain: z.string(), address: z.string().min(20).max(64) }).nullish(),
  mentions: z.array(z.string()).max(2).optional(),
});

export const floorRouter = Router();

floorRouter.get(
  "/floor",
  handle(async (req, res) => {
    const tab = (TABS.includes(str(req.query.tab) as FloorTab) ? str(req.query.tab) : "conversation") as FloorTab;
    res.json({ messages: await listMessages(tab, str(req.query.before)) });
  }),
);

floorRouter.get(
  "/floor/table",
  handle(async (_req, res) => {
    res.json({ tokens: await sharedTokens() });
  }),
);

floorRouter.post(
  "/floor",
  handle(async (req, res) => {
    const input = parse(PostSchema, req.body);
    const wallet = await readSession(req);
    const message = await postMessage({
      authorName: input.displayName,
      authorAddress: wallet,
      rateKey: wallet ?? req.ip ?? "anon",
      body: input.body,
      replyToId: input.replyToId ?? null,
      token: input.token ?? null,
      mentions: input.mentions,
    });
    res.status(201).json({ message });
  }),
);
