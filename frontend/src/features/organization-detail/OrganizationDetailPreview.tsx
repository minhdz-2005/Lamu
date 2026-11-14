"use client";

import { useSearchParams } from "next/navigation";
import { OrganizationDetailPage, type DetailDialogPreview } from "./OrganizationDetailPage";
import { createDetailFixture, defaultDetailScenario, detailScenarioNames, dialogPreviewNames } from "./detailData";

interface OrganizationDetailPreviewProps { readonly orgId: string; }

export function OrganizationDetailPreview({ orgId }: OrganizationDetailPreviewProps) {
  const params = useSearchParams();
  const raw = params.get("detailPreview") ?? defaultDetailScenario(orgId);
  const dialogKey = params.get("detailDialog") ?? "";
  const scenario = process.env.NODE_ENV === "development" && detailScenarioNames.some((key) => key === raw) ? raw : defaultDetailScenario(orgId);
  const dialogAllowed = process.env.NODE_ENV === "development" && dialogPreviewNames.some((key) => key === dialogKey);
  const kind = dialogKey.startsWith("invite") ? "invite" : dialogKey.startsWith("revoke") ? "revoke" : "roles";
  const phase = dialogKey.includes("submitting") ? "submitting" : dialogKey === "last_owner" ? "last_owner" : dialogKey.includes("unknown") ? "unknown" : dialogKey === "invite_already_member" ? "recipient_error" : dialogKey.includes("error") ? "inline_error" : "normal";
  const dialog: DetailDialogPreview | undefined = dialogAllowed ? { kind, phase } : undefined;
  const fixture = createDetailFixture(orgId, dialog?.kind === "revoke" && scenario === "owner" ? "receipt_pending" : scenario);
  return <OrganizationDetailPage key={`${orgId}:${scenario}:${dialogKey}`} orgId={orgId} fixture={fixture} dialogPreview={dialog} />;
}
