"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Banner, Button, Field, focusField } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { dialogFixtures, organizationsCopy as copy, type CreateDialogFixture } from "./organizationsData";
import { normalizeOrganizationName } from "./createOrganization";
import { descriptionError, validOrganizationDescription } from "@/lib/organizationProfile";
import { OrganizationDescriptionField } from "./OrganizationDescriptionField";

interface CreateOrganizationDialogProps {
  readonly fixture?: CreateDialogFixture;
  readonly onClose: () => void;
  readonly onSubmit?: (name: string, description: string | null) => void;
  readonly onCheck?: () => void;
  readonly onReload?: () => void;
}

const dialogStyle: CSSProperties = { width: "calc(100% - 32px)", maxWidth: 520, maxHeight: "calc(100dvh - 32px)", margin: "auto", padding: 0, border: "1px solid var(--border)", borderRadius: 22, background: "var(--bg)", color: "var(--text)", boxShadow: "var(--sh-3)", overflow: "hidden" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, padding: "28px 28px 16px", flexShrink: 0 };
const bodyStyle: CSSProperties = { padding: "8px 28px 20px", display: "flex", flexDirection: "column", gap: 20, minHeight: 0, overflowY: "auto" };
const footerStyle: CSSProperties = { padding: "20px 28px 24px", background: "var(--bg-tint)", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexShrink: 0, flexWrap: "wrap" };
const buttonStyle: CSSProperties = { borderRadius: 9999, height: 44, minHeight: 44, fontSize: 14, padding: "10px 18px" };
const ownerStyle: CSSProperties = { padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-soft)", display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, lineHeight: 1.45 };

export function CreateOrganizationDialog({ fixture = dialogFixtures.initial, onClose, onSubmit, onCheck, onReload }: CreateOrganizationDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(fixture.name);
  const [description, setDescription] = useState(fixture.description ?? "");
  const [invalidDescription, setInvalidDescription] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const pending = fixture.state === "creating" || fixture.state === "processing";
  const created = fixture.state === "success" || fixture.state === "reload_error";
  const frozen = pending || created || fixture.state === "unknown_result";

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    const input = element.querySelector<HTMLInputElement>("input:not(:disabled)");
    (input ?? element).focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return <dialog ref={dialog} className="organizations-dialog" style={dialogStyle} aria-labelledby="organizations-dialog-title" aria-describedby="organizations-dialog-description" tabIndex={-1}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex]"))
        .filter((element) => element.tabIndex >= 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
    }}
    onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      if (frozen || !onSubmit) return;
      const normalized = normalizeOrganizationName(name);
      if (!normalized) {
        setNameError(copy.validation);
        focusField("organization-name");
        return;
      }
      const preparedDescription = description.trim() || null;
      if (!validOrganizationDescription(preparedDescription)) {
        setInvalidDescription(true);
        focusField("new-organization-description");
        return;
      }
      setName(normalized);
      onSubmit(normalized, preparedDescription);
    }} style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }} aria-busy={pending}>
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <h2 id="organizations-dialog-title" style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, lineHeight: 1.65, letterSpacing: "-.02em" }}>{copy.create}</h2>
          <p id="organizations-dialog-description" className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{copy.dialogDescription}</p>
        </div>
        <Button onClick={onClose} disabled={pending} aria-label={copy.close} style={{ width: 32, minWidth: 32, height: 32, minHeight: 32, padding: 0, borderRadius: "50%", border: 0, background: "transparent", color: "var(--muted)", fontSize: 24, boxShadow: "none" }}>×</Button>
      </div>
      <div className="organizations-dialog-body" style={bodyStyle}>
        {fixture.notice && <Banner kind={fixture.notice.kind}>
          <strong>{fixture.notice.text}</strong>
          {created && fixture.organizationId && <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Link className="btn btn-sm" style={{ borderRadius: 9999 }} href={`/organizations/${encodeURIComponent(fixture.organizationId)}`} prefetch={false}>{fixture.state === "success" ? copy.openCreated : copy.open}<AccountIcon name="external" size={14} /></Link>
            {fixture.state === "reload_error" && <Button size="sm" onClick={onReload} disabled={!onReload} style={{ borderRadius: 9999 }}>{copy.reloadList}</Button>}
          </div>}
          {fixture.state === "unknown_result" && <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Button size="sm" onClick={onCheck} disabled={!onCheck} style={{ borderRadius: 9999 }}>{copy.check}</Button>
            <Button size="sm" onClick={onReload} disabled={!onReload} style={{ borderRadius: 9999 }}>{copy.reloadList}</Button>
          </div>}
        </Banner>}
        <Field name="organization-name" label={copy.name} requiredMark required autoComplete="off" placeholder={copy.namePlaceholder}
          value={name} onChange={(value) => { setName(value); setNameError(undefined); }} readOnly={frozen} disabled={pending} error={nameError ?? (name === fixture.name ? fixture.nameError : undefined)} />
        <OrganizationDescriptionField id="new-organization-description" optional value={description}
          onChange={(value) => { setDescription(value); setInvalidDescription(false); }}
          readOnly={frozen} disabled={pending} error={invalidDescription ? descriptionError : undefined} />
        <div style={ownerStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z" /></svg>
          <span>{copy.ownerPrefix}<strong>{copy.owner}</strong>{copy.ownerSuffix}</span>
        </div>
      </div>
      <div style={footerStyle}>
        <Button onClick={onClose} disabled={pending} style={{ ...buttonStyle, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", fontWeight: 500 }}>{copy.cancel}</Button>
        <Button type="submit" variant="primary" disabled={frozen || !onSubmit} style={{ ...buttonStyle, paddingInline: 24 }}>
          {fixture.state === "creating" && <span className="organizations-spinner" aria-hidden="true" />}
          {pending ? copy.creating : copy.create}
        </Button>
      </div>
    </form>
    <style jsx>{`
      .organizations-dialog[open] { display: flex; flex-direction: column; }
      .organizations-dialog::backdrop { background: var(--overlay); backdrop-filter: blur(4px); }
      .organizations-dialog :global(button:focus-visible), .organizations-dialog :global(a:focus-visible) { outline: 2px solid var(--secondary); outline-offset: 3px; }
      .organizations-dialog-body :global(.field) { margin: 0; }
      .organizations-dialog-body :global(.field label) { font-size: 13.5px; font-weight: 600; margin-bottom: 6px; }
      .organizations-dialog-body :global(.field label span) { color: var(--danger); }
      .organizations-dialog-body :global(.field input) { height: 48px; min-height: 48px; padding: 0 16px; font-size: 15px; border-radius: 12px; }
      .organizations-dialog-body :global(.banner) { margin: 0; border-radius: 8px; padding: 12px 14px; font-size: 13px; line-height: 1.45; }
      .organizations-spinner { width: 16px; height: 16px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: organizations-spin .8s linear infinite; }
      @keyframes organizations-spin { to { transform: rotate(360deg); } }
      @media (max-width: 480px) {
        .organizations-dialog-body :global(.field input) { font-size: 16px; }
      }
      @media (prefers-reduced-motion: reduce) { .organizations-spinner { animation: none; } }
    `}</style>
  </dialog>;
}
