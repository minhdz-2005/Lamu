"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

type Kind = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  kind: Kind;
  requestId?: string;
}

interface ToastApi {
  push: (message: string, kind?: Kind, requestId?: string) => void;
}

const ToastContext = createContext<ToastApi>({ push: () => {} });

const LIFETIME_MS = 4500;
const MAX_STACK = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  const push = useCallback((message: string, kind: Kind = "info", requestId?: string) => {
    seq.current += 1;
    const id = seq.current;
    setItems((prev) => [...prev, { id, message, kind, requestId }].slice(-MAX_STACK));
    const timer = window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, LIFETIME_MS);
    timers.current.push(timer);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack no-print" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="toast" data-kind={item.kind}>
            {item.message}
            {item.requestId && <span className="request-id mono">{item.requestId}</span>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
