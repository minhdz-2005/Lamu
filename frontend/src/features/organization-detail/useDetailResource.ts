"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

type Result<T> = { key: string; data: T; error?: undefined } | { key: string; data?: undefined; error: unknown };

export function useDetailResource<T>(scope: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [version, refresh] = useReducer((value: number) => value + 1, 0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const key = scope;

  const reload = useCallback((keepData = false) => {
    controller.current?.abort();
    if (!keepData) setResult(null);
    refresh();
  }, []);

  const clear = useCallback(() => {
    controller.current?.abort();
    setResult(null);
  }, []);

  useEffect(() => {
    if (key === null) {
      setResult(null);
      return;
    }
    const request = new AbortController();
    controller.current = request;
    void (async () => {
      try {
        const data = await load(request.signal);
        if (!request.signal.aborted) setResult({ key, data });
      } catch (error) {
        if (!request.signal.aborted) setResult({ key, error });
      }
    })();
    return () => request.abort();
  }, [key, load, version]);

  const update = useCallback((change: (data: T) => T) => {
    setResult((current) => key !== null && current?.key === key && current.data !== undefined
      ? { key, data: change(current.data) }
      : current);
  }, [key]);

  return {
    data: key !== null && result?.key === key ? result.data : undefined,
    error: key !== null && result?.key === key ? result.error : undefined,
    reload,
    clear,
    update,
  };
}
