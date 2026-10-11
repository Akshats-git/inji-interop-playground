import { useEffect, useRef, useState } from "react";
import type { EventSummary, Run } from "@playground/core";

type Message = { type: "event"; event: EventSummary } | { type: "run"; run: Run } | { type: "hello" };

/**
 * Subscribe to the playground's live feed. `runId` narrows it to one run; `null` means all traffic.
 * Reconnects with back-off; returns whether the socket is currently open.
 */
export function useLiveFeed(runId: string | null | undefined, onMessage: (m: Message) => void, enabled = true) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || runId === undefined) return;
    let ws: WebSocket | undefined;
    let closed = false;
    let delay = 500;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws${runId ? `?run=${encodeURIComponent(runId)}` : ""}`);
      ws.onopen = () => {
        setConnected(true);
        delay = 500;
      };
      ws.onmessage = (e) => {
        try {
          handler.current(JSON.parse(e.data));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) setTimeout(connect, (delay = Math.min(delay * 2, 8000)));
      };
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [runId, enabled]);

  return connected;
}
