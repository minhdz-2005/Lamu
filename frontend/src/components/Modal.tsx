"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "./ui";

export function Modal({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const first = panel.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), textarea, select, button",
    );
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop no-print"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={panel}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 id="modal-title" style={{ margin: 0 }}>
            {title}
          </h2>
          <Button size="sm" onClick={onClose} aria-label="Đóng">
            ✕
          </Button>
        </div>
        {children}
        {footer && (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
