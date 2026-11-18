"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { readSession, subscribeAuth } from "./auth";
import { ApiException } from "./errors";

export interface IdentityMutation<T> {
  method: "POST" | "PUT";
  path: string;
  body?: unknown;
  send: (record: OperationRequest, signal: AbortSignal) => Promise<T>;
}

export interface OperationRequest {
  readonly method: "POST" | "PUT";
  readonly path: string;
  readonly body?: string;
  readonly key: string;
  readonly createdAt: number;
  readonly generation: string;
  readonly actor?: string;
}

type Status =
  | "idle"
  | "submitting"
  | "confirmed"
  | "rejected"
  | "outcome-unknown";
interface OperationState {
  status: Status;
  error: unknown;
}
const idle: OperationState = { status: "idle", error: null };
const retryWindowMs = 24 * 60 * 60 * 1000;

function uncertain(error: unknown) {
  return (
    !(error instanceof ApiException) ||
    error.status === 0 ||
    error.status >= 500 ||
    error.code === "IDEMPOTENCY_IN_PROGRESS"
  );
}

export function createIdentityOperation<T>(generation?: string) {
  let state = idle;
  let operation:
    | { record: OperationRequest; send: IdentityMutation<T>["send"] }
    | undefined;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();

  function update(next: OperationState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function matches(record: OperationRequest) {
    const current = readSession();
    return (
      current.generation === record.generation &&
      (record.actor === undefined || current.profile?.id === record.actor)
    );
  }

  function dispose() {
    controller?.abort();
    operation = undefined;
    controller = undefined;
    update(idle);
  }

  async function submit() {
    const pending = operation;
    if (!pending || !matches(pending.record)) {
      dispose();
      return;
    }
    const retrying = state.status === "outcome-unknown";
    const attempt = new AbortController();
    controller = attempt;
    update({ status: "submitting", error: null });
    try {
      const receipt = await pending.send(pending.record, attempt.signal);
      if (attempt.signal.aborted || !matches(pending.record)) return;
      operation = undefined;
      update({ status: "confirmed", error: null });
      return receipt;
    } catch (error) {
      if (attempt.signal.aborted || !matches(pending.record)) return;
      const unknown = uncertain(error) || retrying;
      if (!unknown) operation = undefined;
      update({ status: unknown ? "outcome-unknown" : "rejected", error });
    } finally {
      if (controller === attempt) {
        controller = undefined;
        if (!matches(pending.record)) dispose();
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect() {
      const disconnect = subscribeAuth(() => {
        if (operation && !matches(operation.record)) dispose();
      });
      return () => {
        disconnect();
        dispose();
      };
    },
    async start(mutation: IdentityMutation<T>) {
      if (state.status === "submitting" || state.status === "outcome-unknown")
        return;
      const current = readSession();
      if (
        (generation !== undefined && current.generation !== generation) ||
        !(current.access || current.refresh)
      )
        return;
      operation = {
        send: mutation.send,
        record: Object.freeze({
          generation: current.generation,
          actor: current.profile?.id,
          method: mutation.method,
          path: mutation.path,
          body:
            mutation.body === undefined
              ? undefined
              : JSON.stringify(mutation.body),
          key: crypto.randomUUID(),
          createdAt: Date.now(),
        }),
      };
      return submit();
    },
    async retry() {
      if (state.status !== "outcome-unknown" || !operation) return;
      if (Date.now() - operation.record.createdAt >= retryWindowMs) {
        update({
          status: "outcome-unknown",
          error: new ApiException("OPERATION_RETRY_EXPIRED", "", 409, ""),
        });
        return;
      }
      return submit();
    },
    reset() {
      if (state.status === "confirmed" || state.status === "rejected")
        dispose();
    },
  };
}

export function useIdentityOperation<T>(generation?: string) {
  const operation = useMemo(
    () => createIdentityOperation<T>(generation),
    [generation],
  );
  const state = useSyncExternalStore(
    operation.subscribe,
    operation.getSnapshot,
    () => idle,
  );
  useEffect(() => operation.connect(), [operation]);
  return {
    ...state,
    start: operation.start,
    retry: operation.retry,
    reset: operation.reset,
  };
}
