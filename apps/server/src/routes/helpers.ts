import type { NextFunction, Request, Response } from "express";
import { ZodError, type z } from "zod";
import { HttpProblem } from "../lib/auth";
import { errorMessage, log } from "../log";

/** Wrap async handlers so thrown errors reach the error middleware. */
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new HttpProblem(400, first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input");
  }
  return result.data;
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpProblem) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid input", details: err.issues });
    return;
  }
  log.error(errorMessage(err));
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

export const str = (v: unknown) => (typeof v === "string" ? v : undefined);
