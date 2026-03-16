import { useEffect, useRef, useState, useCallback } from "react";

export interface UseSSEOptions {
  url: string;
  handlers: Record<string, (data: unknown) => void>;
  maxRetries?: number;
  retryDelay?: number;
}

export function useSSE({
  url,
  handlers,
  maxRetries = 5,
  retryDelay = 2000,
}: UseSSEOptions): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const handlersRef = useRef(handlers);
  const closedRef = useRef(false);

  // Keep handlers ref up to date without triggering reconnection
  handlersRef.current = handlers;

  const connect = useCallback(() => {
    if (closedRef.current) return;

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      retriesRef.current = 0;
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;

      if (closedRef.current) return;

      if (retriesRef.current < maxRetries) {
        retriesRef.current += 1;
        const delay = retryDelay * Math.pow(2, retriesRef.current - 1);
        setTimeout(() => connect(), delay);
      }
    };

    // Register event listeners for all handler keys
    const knownEvents = [
      "connected",
      "railway:started",
      "railway:complete",
      "anthropic:key-validated",
      "anthropic:login-started",
      "anthropic:login-complete",
      "wizard:step-completed",
      "wizard:completed",
      "build:progress",
      "build:complete",
      "build:error",
      "launch:ready",
      "launch:error",
    ];

    for (const event of knownEvents) {
      es.addEventListener(event, (e: MessageEvent) => {
        const data: unknown = JSON.parse(e.data);
        const handler = handlersRef.current[event];
        if (handler) handler(data);

        // On launch:ready, close SSE -- launch flow is complete
        if (event === "launch:ready") {
          closedRef.current = true;
          es.close();
          esRef.current = null;
        }
      });
    }
  }, [url, maxRetries, retryDelay]);

  useEffect(() => {
    closedRef.current = false;
    connect();

    return () => {
      closedRef.current = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  return { connected };
}
