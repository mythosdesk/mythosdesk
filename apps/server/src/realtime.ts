import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ServerEvents } from "@elyagents/shared";
import { env } from "./env";

let io: Server | null = null;

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.webOrigins, credentials: true },
    path: "/socket.io",
  });
  io.on("connection", (socket) => {
    socket.on("subscribe", (room: unknown) => {
      if (typeof room === "string" && /^(agent|token):[\w:-]{1,120}$/.test(room)) void socket.join(room);
    });
    socket.on("unsubscribe", (room: unknown) => {
      if (typeof room === "string") void socket.leave(room);
    });
  });
  return io;
}

export function emit<K extends keyof ServerEvents>(event: K, payload: ServerEvents[K], room?: string) {
  if (!io) return;
  if (room) io.to(room).emit(event, payload);
  else io.emit(event, payload);
}

export function onlineCount(): number {
  return io?.engine.clientsCount ?? 0;
}
