"use client";

import type { ServerEvents } from "@elyagents/shared";
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { path: "/socket.io", transports: ["websocket", "polling"], withCredentials: true });
  }
  return socket;
}

/** Subscribe to a server event for the lifetime of the component. */
export function useSocketEvent<K extends keyof ServerEvents>(
  event: K,
  handler: (payload: ServerEvents[K]) => void,
  room?: string,
) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const s = getSocket();
    const listener = (payload: ServerEvents[K]) => ref.current(payload);
    s.on(event as string, listener);
    if (room) s.emit("subscribe", room);
    return () => {
      s.off(event as string, listener);
      if (room) s.emit("unsubscribe", room);
    };
  }, [event, room]);
}
