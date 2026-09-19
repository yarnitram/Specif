"use client";

import { useEffect, useRef, useState } from "react";
import type { TickerData } from "@/lib/db";

const WS_URL = "wss://contract.mexc.com/ws";

type UseMexcWebsocketOptions = {
  symbols: string[];
  enabled?: boolean;
};

type Return = {
  ticks: Record<string, TickerData>;
  connected: boolean;
  reconnecting: boolean;
  lastMessageAt: number | null;
  error: string | null;
};

/** Extract mapped field names from MEXC Futures ticker pushes. */
function parseTicker(raw: Record<string, unknown>): TickerData | null {
  const count = raw as Record<string, any>;
  const keys = ["lastPrice", "riseFallRate", "fairPrice", "indexPrice", "amount24", "holdVol", "fundingRate", "high24Price", "lower24Price"] as const;
  if (!keys.every((k) => k in count)) return null;

  return {
    lastPrice: Number(count.lastPrice),
    riseFallRate: Number(count.riseFallRate),
    fairPrice: Number(count.fairPrice),
    indexPrice: Number(count.indexPrice),
    amount24: Number(count.amount24),
    holdVol: Number(count.holdVol),
    fundingRate: Number(count.fundingRate),
    high24Price: Number(count.high24Price),
    lower24Price: Number(count.lower24Price),
  };
}

export function useMexcWebsocket({ symbols, enabled = true }: UseMexcWebsocketOptions): Return {
  const [ticks, setTicks] = useState<Record<string, TickerData>>({});
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolsRef = useRef(symbols);
  const enabledRef = useRef(enabled);

  symbolsRef.current = symbols;
  enabledRef.current = enabled;

  const connect = useRef((backoff: boolean) => {
    // Cleanup prior socket / state
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }

    if (!enabledRef.current) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setError("Failed to create WebSocket connection");
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempt.current = 0;
      setConnected(true);
      setReconnecting(false);
      setError(null);
      // (Re)subscribe all current symbols.
      pushSubscriptions(ws, symbolsRef.current);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string);
        if (payload?.symbol) {
          const tick = parseTicker(payload);
          if (tick) {
            const sym = String(payload.symbol);
            setTicks((prev) => ({ ...prev, [sym]: tick }));
            setLastMessageAt(Date.now());
          }
        }
      } catch {
        /* non-JSON heartbeat frames are ignored */
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
    };

    function scheduleReconnect() {
      if (reconnectTimer.current) return;
      setReconnecting(true);
      const attempt = reconnectAttempt.current;
      const delay = Math.min(1000 * 2 ** attempt, 30000) + Math.random() * 500;
      reconnectAttempt.current = attempt + 1;
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        connect.current(false);
      }, delay);
    }
  });

  function pushSubscriptions(ws: WebSocket, list: string[]) {
    list.forEach((symbol) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ method: "sub.ticker", param: { symbol } }));
      }
    });
  }

  // Establish connection on mount / when enabled toggles.
  useEffect(() => {
    connect.current(false);
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [enabled]);

  // Resubscribe when symbols list changes.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    pushSubscriptions(ws, symbolsRef.current);
  }, [symbols]);

  return { ticks, connected, reconnecting, lastMessageAt, error };
}