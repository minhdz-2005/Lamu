"use client";

import { Banner, Button } from "@/components/ui";
import { detailCopy as copy } from "./detailData";

export interface DetailOperationFeedback {
  readonly busy?: boolean;
  readonly unknown?: boolean;
  readonly error?: string;
  readonly onRetry?: () => void;
}

export function DetailOperationStatus({ unknown, error, onRetry }: DetailOperationFeedback) {
  if (unknown) {
    return <Banner kind="warn">
      {copy.unknown}
      {error && <p style={{ margin: "8px 0 0" }}>{error}</p>}
      <div style={{ marginTop: 8 }}>
        <Button size="sm" onClick={onRetry} disabled={!onRetry}>{copy.check}</Button>
      </div>
    </Banner>;
  }
  return error ? <Banner kind="error">{error}</Banner> : null;
}
