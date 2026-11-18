"use client";

import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { Button } from "@/components/ui";
import { detailCopy as copy } from "./detailData";

interface DetailDialogProps {
  readonly title: string;
  readonly description: string;
  readonly pending?: boolean;
  readonly submitLabel: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly onSubmit?: () => void;
  readonly disableSubmit?: boolean;
}

const panelStyle: CSSProperties = { width: "calc(100% - 32px)", maxWidth: 512, maxHeight: "calc(100dvh - 32px)", margin: "auto", padding: 0, border: "1px solid var(--border)", borderRadius: 22, background: "var(--surface)", color: "var(--text)", boxShadow: "var(--sh-3)", overflow: "hidden" };

export function DetailDialog({ title, description, pending = false, submitLabel, cancelLabel = copy.cancel, danger = false, children, onClose, onSubmit, disableSubmit = false }: DetailDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    (element.querySelector<HTMLElement>('input:not(:disabled), [data-initial-focus]') ?? element).focus();
    const scope = element.parentElement;
    return () => {
      element.close();
      document.body.style.overflow = previous;
      if (opener?.isConnected && !opener.matches(":disabled")) opener.focus();
      else scope?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    };
  }, []);
  return <dialog className="org-detail-dialog" ref={ref} style={panelStyle} tabIndex={-1} aria-labelledby="org-detail-dialog-title" aria-describedby="org-detail-dialog-description"
    onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, input, a[href], [tabindex]"))
        .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
    }}>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      if (!pending && !disableSubmit) onSubmit?.();
    }} style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }} aria-busy={pending}>
      <header className="org-detail-dialog-header">
        <div style={{ minWidth: 0 }}><h2 id="org-detail-dialog-title" style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-.015em" }}>{title}</h2><p id="org-detail-dialog-description" style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--text-soft)", overflowWrap: "anywhere" }}>{description}</p></div>
        <Button aria-label={copy.close} onClick={onClose} disabled={pending} style={{ width: 36, minWidth: 36, height: 36, minHeight: 36, border: 0, padding: 0, background: "transparent", color: "var(--muted)", boxShadow: "none", borderRadius: 8, fontSize: 24 }}>×</Button>
      </header>
      <div className="org-detail-dialog-body stack" style={{ gap: 16, minHeight: 0, overflowY: "auto" }}>{children}</div>
      <footer className="org-detail-dialog-footer row" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
        <Button onClick={onClose} disabled={pending} data-initial-focus={danger && !pending ? "" : undefined} style={{ border: 0, background: "transparent", borderRadius: 9999, boxShadow: "none", minHeight: 44, fontSize: 14 }}>{cancelLabel}</Button>
        <Button type="submit" variant={danger ? "danger" : "primary"} disabled={pending || disableSubmit || !onSubmit} style={{ borderRadius: 9999, minHeight: 44, fontSize: 14 }}>{pending ? copy.submitting : submitLabel}</Button>
      </footer>
    </form>
    <style jsx>{`
      .org-detail-dialog[open] { display: flex; flex-direction: column; }
      .org-detail-dialog::backdrop { background: var(--overlay); backdrop-filter: blur(4px); }
      .org-detail-dialog-header { padding: 36px 36px 16px; display: flex; justify-content: space-between; gap: 12px; flex-shrink: 0; }
      .org-detail-dialog-body { padding: 0 36px 8px; }
      .org-detail-dialog-footer { padding: 12px 36px 36px; }
      .org-detail-dialog :global(button:focus-visible), .org-detail-dialog :global(input:focus-visible), .org-detail-dialog :global(a:focus-visible) { outline: 2px solid var(--secondary); outline-offset: 3px; }
      .org-detail-dialog-body :global(.field) { margin: 0; }
      .org-detail-dialog-body :global(.banner) { margin: 0; padding: 14px; font-size: 13px; line-height: 1.5; border-radius: 12px; }
      @media (max-width: 480px) {
        .org-detail-dialog-header { padding: 24px 20px 16px; }
        .org-detail-dialog-body { padding-inline: 20px; }
        .org-detail-dialog-footer { padding: 12px 20px 24px; }
        .org-detail-dialog-body :global(input[type=email]) { font-size: 16px; }
      }
    `}</style>
  </dialog>;
}
