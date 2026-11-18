"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Banner } from "@/components/ui";
import { readSession } from "@/lib/auth";
import { isIdentityUuid } from "@/lib/authMode";
import { ApiException, formatIdentityError } from "@/lib/errors";
import { identityApi, type InvitationCreated, type InvitationRevoked, type RoleAssignment } from "@/lib/identityApi";
import { useIdentityOperation } from "@/lib/identityOperation";
import { applyOrganizationUpdate, newestCover, organizationReads, validCover, type OrganizationProfileUpdate } from "@/lib/organizationProfile";
import type { Membership } from "@/lib/types";
import { isIdentityLogoutPending, updateSessionOrganization, useSession } from "@/lib/useSession";
import { updateCover } from "./coverApi";
import { DetailOperationStatus } from "./DetailOperationStatus";
import { InvitationReceipt, RevokeInvitationDialog } from "./InvitationReceipt";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { MembersTable } from "./MembersTable";
import { OrganizationDetailPage, type DetailTab } from "./OrganizationDetailPage";
import { OrgRoleEditor } from "./OrgRoleEditor";
import type { OrgRoleCode } from "./RoleSelection";
import { SentInvitationsPanel } from "./SentInvitationsPanel";
import {
  canRevokeInvitation, detailCopy as copy, formatInvitationDate, lastPageOffset, resolveDetailPresentation, supportsOrgEditor,
  type DetailState, type InvitationReceiptData, type MembersState, type OrganizationMember,
} from "./detailData";
import { useDetailResource } from "./useDetailResource";

type Dialog = { kind: "invite" } | { kind: "roles"; member: OrganizationMember } | { kind: "revoke"; invitation: InvitationReceiptData };
type Submitted = { kind: "invite"; email: string; roles: RoleAssignment[] } | { kind: "roles"; self: boolean } | { kind: "revoke"; id: string };
type Receipt = InvitationCreated | InvitationRevoked | { status: "OK" };
const pageStart = { offset: 0, limit: 20 };
const none: readonly never[] = [];

function orgState(error: unknown): DetailState {
  if (!error) return "loading";
  if (error instanceof ApiException) {
    if (error.status === 403) return "forbidden";
    if (error.status === 404) return "not_found";
  }
  return "error";
}

function mutationMessage(error: unknown, kind: Dialog["kind"] | undefined) {
  if (kind === "invite" && error instanceof ApiException && error.code === "NOT_FOUND") return "Không tìm thấy tài khoản đang hoạt động với địa chỉ email này.";
  return formatIdentityError(error);
}

export function OrganizationDetailLive({ orgId }: { readonly orgId: string }) {
  const session = useSession();
  if (!isIdentityUuid(orgId)) return <OrganizationDetailPage orgId={orgId} state="not_found" />;
  const id = orgId.toLowerCase();
  if (session.state === "AUTHENTICATED" && session.profile) {
    const roles = session.organizations.find((entry) => entry.organization_id === id)?.roles ?? none;
    return <AuthenticatedDetail key={`${session.generation}:${session.profile.id}:${id}`} orgId={id} actor={session.profile.id} generation={session.generation} profileRoles={roles} reloadProfile={session.reload} />;
  }
  const state = session.state === "ANONYMOUS" ? "anonymous" : session.state === "UNAVAILABLE" ? "unavailable" : session.state === "ERROR" ? "error" : "loading";
  return <OrganizationDetailPage orgId={id} state={state} message={state === "error" ? formatIdentityError(session.error) : undefined} onReload={state === "error" ? () => void session.reload().catch(() => {}) : undefined} />;
}

interface AuthenticatedDetailProps {
  readonly orgId: string;
  readonly actor: string;
  readonly generation: string;
  readonly profileRoles: readonly string[];
  readonly reloadProfile: () => Promise<unknown>;
}

function AuthenticatedDetail({ orgId, actor, generation, profileRoles, reloadProfile }: AuthenticatedDetailProps) {
  const [selectedTab, setTab] = useState<DetailTab>("overview");
  const [memberPage, setMemberPage] = useState(pageStart);
  const [sentPage, setSentPage] = useState(pageStart);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [receipt, setReceipt] = useState<InvitationReceiptData | null>(null);
  const [success, setSuccess] = useState("");
  const dispatch = useRef<Submitted | null>(null);
  const latestCover = useRef<Membership["cover"]>(undefined);
  const needsCoverReload = useRef(false);
  const operation = useIdentityOperation<Receipt>(generation);
  const busy = operation.status === "submitting";
  const unknown = operation.status === "outcome-unknown";
  const locked = busy || unknown;

  const sameActor = useCallback(() => {
    const current = readSession();
    return current.generation === generation && current.profile?.id === actor;
  }, [actor, generation]);
  const asActor = useCallback(async <T,>(load: () => Promise<T>) => {
    if (!sameActor()) throw new Error("Phiên đã thay đổi.");
    const result = await load();
    if (!sameActor()) throw new Error("Phiên đã thay đổi.");
    return result;
  }, [sameActor]);
  const readOrganization = useCallback(async (signal: AbortSignal) => {
    const started = organizationReads.start();
    const data = await asActor(() => identityApi.organization(orgId, signal));
    const cached = readSession().profile?.memberships.find((row) => row.organization_id === orgId)?.cover;
    const cover = newestCover(latestCover.current, validCover(cached) ? cached : undefined);
    const next = organizationReads.merge(data, generation, orgId, started, cover);
    latestCover.current = next.cover;
    return next;
  }, [asActor, generation, orgId]);
  const overview = useDetailResource(orgId, readOrganization);
  const presentation = resolveDetailPresentation(overview.data?.my_roles ?? none, profileRoles);
  const owner = presentation === "owner";
  const canUpdateProfile = presentation !== "member" && !!overview.data;
  const tab = selectedTab === "sent" && !owner ? "overview" : selectedTab;

  const canWrite = () => canUpdateProfile && sameActor() && !isIdentityLogoutPending(generation);
  async function publishProfile(update: OrganizationProfileUpdate) {
    if (!sameActor() || isIdentityLogoutPending(generation)) return;
    if (update.cover) latestCover.current = newestCover(latestCover.current, update.cover);
    const synced = update.cover ? { ...update, cover: latestCover.current } : update;
    const cached = updateSessionOrganization(generation, actor, orgId, synced);
    overview.update((current) => applyOrganizationUpdate(current, synced));
    if (update.description !== undefined) overview.reload(true);
    await cached;
  }

  async function saveDescription(description: string | null) {
    if (!canWrite()) throw new Error("Phiên hoặc quyền cập nhật đã thay đổi.");
    const result = await identityApi.updateOrganizationDescription(orgId, description, generation);
    try {
      await publishProfile(result);
    } finally {
      if (sameActor()) void reloadProfile().catch(() => {});
    }
  }

  async function saveCover(file: File, onStage: (stage: "upload" | "commit") => void) {
    if (!canWrite() || !overview.data) throw new Error("Phiên hoặc quyền cập nhật đã thay đổi.");
    const reconcile = async () => {
      needsCoverReload.current = true;
      let current;
      try {
        current = await readOrganization(AbortSignal.timeout(10000));
      } catch {
        throw new Error("Không đọc được ảnh bìa hiện tại. Vui lòng thử lại.");
      }
      await publishProfile({ cover: current.cover });
      needsCoverReload.current = false;
      return current.cover;
    };
    const revision = needsCoverReload.current
      ? (await reconcile()).revision
      : (latestCover.current ?? overview.data.cover).revision;
    try {
      const cover = await updateCover({ orgId, generation, file, revision, isCurrent: canWrite, reconcile, onStage });
      if (cover) await publishProfile({ cover });
    } catch (error) {
      if (error instanceof ApiException && error.status === 403 && sameActor()) {
        overview.reload(true);
        void reloadProfile().catch(() => {});
      }
      throw error;
    }
  }

  const readMembers = useCallback((signal: AbortSignal) =>
    asActor(() => identityApi.members(orgId, memberPage.limit, memberPage.offset, signal)), [asActor, orgId, memberPage]);
  const readSent = useCallback((signal: AbortSignal) =>
    asActor(() => identityApi.sentInvitations(orgId, sentPage.limit, sentPage.offset, signal)), [asActor, orgId, sentPage]);

  const members = useDetailResource(presentation !== "member" && tab === "members" ? `${memberPage.limit}:${memberPage.offset}` : null, readMembers);
  const sent = useDetailResource(owner && tab === "sent" ? `${sentPage.limit}:${sentPage.offset}` : null, readSent);

  const { reload: reloadOverview } = overview;
  const { clear: clearMembers, reload: reloadMembers } = members;
  const { clear: clearSent, reload: reloadSent } = sent;
  const clearOwnerData = useCallback(() => {
    setDialog(null);
    setReceipt(null);
    clearSent();
    setTab((previous) => previous === "sent" ? "overview" : previous);
  }, [clearSent]);

  useEffect(() => {
    if (!owner) clearOwnerData();
  }, [owner, clearOwnerData]);

  const denied = [operation.error, sent.error, members.error].find((error) => error instanceof ApiException && error.status === 403);
  useLayoutEffect(() => {
    if (denied) {
      clearOwnerData();
      clearMembers();
      setTab("overview");
      reloadOverview();
    }
  }, [denied, clearOwnerData, clearMembers, reloadOverview]);

  const correctedMembersOffset = members.data && lastPageOffset(memberPage.offset, memberPage.limit, members.data.total);
  const correctedSentOffset = sent.data && lastPageOffset(sentPage.offset, sentPage.limit, sent.data.total);
  useEffect(() => {
    if (correctedMembersOffset !== undefined && correctedMembersOffset !== memberPage.offset) setMemberPage({ ...memberPage, offset: correctedMembersOffset });
  }, [correctedMembersOffset, memberPage]);
  useEffect(() => {
    if (correctedSentOffset !== undefined && correctedSentOffset !== sentPage.offset) setSentPage({ ...sentPage, offset: correctedSentOffset });
  }, [correctedSentOffset, sentPage]);

  function assign(roles: readonly OrgRoleCode[]): RoleAssignment[] {
    return [...roles].sort().map((code) => ({ code, resource_type: "ORG", resource_id: orgId }));
  }

  function open(next: Dialog) {
    if (!owner || locked || !sameActor()) return;
    operation.reset();
    setSuccess("");
    setDialog(next);
  }

  function close() {
    if (busy) return;
    setDialog(null);
    if (!unknown) {
      dispatch.current = null;
      operation.reset();
    }
  }

  function finish(result: Receipt | undefined, action: Submitted) {
    if (!result || !sameActor()) return;
    setDialog(null);
    dispatch.current = null;
    if (result.status === "PENDING" && action.kind === "invite") {
      setReceipt({
        id: result.invitation_id, organization_id: orgId, email: action.email,
        expiresLabel: formatInvitationDate(result.expires_at),
        expiresAt: result.expires_at, status: result.status, roles: action.roles,
      });
      setSuccess(copy.receiptTitle);
      setSentPage((previous) => ({ ...previous, offset: 0 }));
      setTab("sent");
      reloadSent();
    } else if (result.status === "REVOKED") {
      setSuccess(copy.revoked);
      setReceipt((previous) => previous?.id === result.invitation_id ? { ...previous, status: "REVOKED" } : previous);
      reloadSent();
    } else if (result.status === "OK" && action.kind === "roles") {
      setSuccess("Đã lưu vai trò.");
      reloadMembers();
      void reloadProfile().catch(() => {});
      if (action.self) {
        clearOwnerData();
        reloadOverview();
      }
    }
  }

  async function invite(email: string, roles: readonly OrgRoleCode[]) {
    if (!owner || locked || dispatch.current || !sameActor()) return;
    const action: Submitted = { kind: "invite", email, roles: assign(roles) };
    dispatch.current = action;
    const result = await operation.start(identityApi.invite(orgId, email, action.roles));
    finish(result, action);
  }

  async function edit(member: OrganizationMember, roles: readonly OrgRoleCode[]) {
    if (!owner || locked || dispatch.current || !sameActor() || member.status !== "ACTIVE" || !supportsOrgEditor(member, orgId)) return;
    const action: Submitted = { kind: "roles", self: member.user_id === actor };
    dispatch.current = action;
    const result = await operation.start(identityApi.replaceRoles(orgId, member.user_id, assign(roles)));
    finish(result, action);
  }

  async function revoke(invitation: InvitationReceiptData) {
    if (!owner || locked || dispatch.current || !sameActor()) return;
    if (invitation.organization_id !== orgId || !invitation.expiresAt || !canRevokeInvitation(invitation.status, invitation.expiresAt)) {
      reloadSent();
      return;
    }
    const action: Submitted = { kind: "revoke", id: invitation.id };
    dispatch.current = action;
    const result = await operation.start(identityApi.revoke(orgId, invitation.id));
    finish(result, action);
  }

  async function retry() {
    const action = dispatch.current;
    if (action && sameActor()) finish(await operation.retry(), action);
  }

  const error = operation.error;
  useEffect(() => {
    if (operation.status !== "rejected") return;
    const action = dispatch.current;
    dispatch.current = null;
    if (!(error instanceof ApiException)) return;
    if (action?.kind === "roles" && (error.status === 404 || error.status === 409)) reloadMembers();
    if (action?.kind === "revoke" && (error.status === 404 || error.status === 409)) {
      setTab("sent");
      reloadSent();
    }
  }, [operation.status, error, reloadMembers, reloadSent]);

  const operationError = error ? mutationMessage(error, dialog?.kind) : undefined;
  const feedback = { busy, unknown, error: operationError, onRetry: () => void retry(), onClose: close };
  let activeDialog: ReactNode = null;
  if (owner && dialog) {
    if (dialog.kind === "invite") activeDialog = <InviteMemberDialog {...feedback} onSubmit={(email, roles) => void invite(email, roles)} />;
    if (dialog.kind === "roles") {
      const { member } = dialog;
      activeDialog = <OrgRoleEditor {...feedback} member={member} onSubmit={(roles) => void edit(member, roles)} />;
    }
    if (dialog.kind === "revoke") {
      const { invitation } = dialog;
      activeDialog = <RevokeInvitationDialog {...feedback} organizationName={overview.data?.name} receipt={invitation} onSubmit={() => void revoke(invitation)} />;
    }
  }

  const sentItems = sent.data?.items ?? none;
  const currentServerStatus = receipt && sentItems.find((row) => row.id === receipt.id)?.status;
  useEffect(() => {
    if (currentServerStatus && receipt && currentServerStatus !== receipt.status) {
      setReceipt({ ...receipt, status: currentServerStatus });
    }
  }, [currentServerStatus, receipt]);
  const currentReceipt = receipt && currentServerStatus ? { ...receipt, status: currentServerStatus } : receipt;
  const openInvite = () => open({ kind: "invite" });
  const openRevoke = (invitation: InvitationReceiptData) => open({ kind: "revoke", invitation });
  const notice = <>
    {success && (!owner || tab === "overview" || !currentReceipt || currentReceipt.status !== "PENDING") && <Banner kind="ok">{success}</Banner>}
    {!activeDialog && (unknown || operation.status === "rejected") && <DetailOperationStatus {...feedback} />}
    {!activeDialog && busy && <p role="status">{copy.submitting}</p>}
  </>;
  const panel = <>
    {owner && currentReceipt && <InvitationReceipt receipt={currentReceipt} disableRevoke={locked} onDismiss={() => setReceipt(null)} onRevoke={() => openRevoke(currentReceipt)} />}
    {tab === "members" && <MembersTable
      orgId={orgId}
      members={(members.data?.items ?? none).map((member) => ({ ...member, is_current_user: member.user_id === actor }))}
      state={pageState(members.data, correctedMembersOffset === memberPage.offset, members.error)}
      presentation={presentation}
      disableActions={locked}
      onReload={reloadMembers}
      onInvite={openInvite}
      onEdit={(member) => open({ kind: "roles", member })}
      message={members.error ? formatIdentityError(members.error) : undefined}
      {...memberPage}
      total={members.data?.total ?? 0}
      onPage={(offset, limit) => setMemberPage({ offset, limit })}
    />}
    {owner && tab === "sent" && <SentInvitationsPanel
      items={sentItems}
      state={pageState(sent.data, correctedSentOffset === sentPage.offset, sent.error)}
      message={sent.error ? formatIdentityError(sent.error) : undefined}
      disableActions={locked}
      onReload={reloadSent}
      onInvite={openInvite}
      onRevoke={openRevoke}
      {...sentPage}
      total={sent.data?.total ?? 0}
      onPage={(offset, limit) => setSentPage({ offset, limit })}
    />}
  </>;
  return <OrganizationDetailPage
    orgId={orgId}
    state={overview.data ? "success" : orgState(overview.error)}
    organization={overview.data}
    profileActions={canUpdateProfile ? { saveDescription, saveCover } : undefined}
    presentation={presentation}
    tab={tab}
    setTab={(next) => {
      if (next !== "sent" || owner) setTab(next);
    }}
    panel={panel}
    notice={notice}
    dialog={activeDialog}
    membersTotal={members.data?.total}
    message={orgState(overview.error) === "error" ? formatIdentityError(overview.error) : undefined}
    onReload={overview.error ? reloadOverview : undefined}
  />;
}

function pageState(page: { items: readonly unknown[] } | undefined, validOffset: boolean, error: unknown): MembersState {
  if (error) return "error";
  if (!page || !validOffset) return "loading";
  return page.items.length ? "success" : "empty";
}
