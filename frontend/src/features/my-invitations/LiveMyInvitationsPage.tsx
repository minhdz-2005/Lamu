"use client";

import { useEffect, useRef, useState } from "react";
import { identityInitials } from "@/features/account/accountView";
import { readSession } from "@/lib/auth";
import { ApiException, formatIdentityError } from "@/lib/errors";
import {
  identityApi,
  type InvitationAccepted,
  type InvitationDeclined,
  type Invitations,
} from "@/lib/identityApi";
import { useIdentityOperation } from "@/lib/identityOperation";
import { useSession, type Session } from "@/lib/useSession";
import { canRespondToInvitation, lastInboxPage } from "./inboxPolicy";
import {
  inboxCopy as copy,
  type InboxFixture,
  type InboxInvitation,
  type InvitationAction,
  type InvitationActionPhase,
} from "./invitationsData";
import { MyInvitationsPage } from "./MyInvitationsPage";

const loadingView: InboxFixture = { state: "loading", invitations: [] };

export function LiveMyInvitationsPage() {
  const session = useSession();
  if (session.state === "AUTHENTICATED" && session.profile) {
    return (
      <InboxController
        key={session.generation}
        generation={session.generation}
        actor={session.profile.id}
        reloadProfile={session.reload}
      />
    );
  }
  if (session.state === "UNKNOWN")
    return <MyInvitationsPage fixture={loadingView} />;

  const blocked =
    session.state === "UNAVAILABLE" || session.state === "ANONYMOUS";
  const message =
    session.state === "UNAVAILABLE"
      ? "Tài khoản hiện không khả dụng."
      : session.state === "ANONYMOUS"
        ? "Vui lòng đăng nhập để xem lời mời của bạn."
        : formatIdentityError(session.error);
  return (
    <MyInvitationsPage
      fixture={{ state: "error", invitations: [], blocked, message }}
      onReload={
        blocked
          ? undefined
          : () => {
              void session.reload().catch(() => {});
            }
      }
    />
  );
}

interface InboxQuery {
  limit: number;
  page: number;
  revision: number;
}
type InboxResponse = { query: InboxQuery } & (
  | { data: Invitations; error?: never }
  | { error: unknown; data?: never }
);
type InvitationReceipt = InvitationAccepted | InvitationDeclined;
type Selection = { invitation: InboxInvitation; action: InvitationAction };

function InboxController({
  generation,
  actor,
  reloadProfile,
}: {
  generation: string;
  actor: string;
  reloadProfile: Session["reload"];
}) {
  const [query, setQuery] = useState<InboxQuery>({
    limit: 20,
    page: 0,
    revision: 0,
  });
  const [response, setResponse] = useState<InboxResponse>();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pending, setPending] = useState<Selection | null>(null);
  const [receipt, setReceipt] = useState<{
    id: string;
    organizationId: string;
    status: InvitationReceipt["status"];
    profileFailed: boolean;
  }>();
  const [profileLoading, setProfileLoading] = useState(false);
  const operation = useIdentityOperation<InvitationReceipt>(generation);
  const observedExpirations = useRef(new Set<string>());
  const profileRequest = useRef(0);
  const current = response?.query === query ? response : undefined;

  function reloadInbox() {
    setQuery((previous) => ({ ...previous, revision: previous.revision + 1 }));
  }

  useEffect(() => {
    const controller = new AbortController();
    function active() {
      const session = readSession();
      return (
        !controller.signal.aborted &&
        session.generation === generation &&
        session.profile?.id === actor
      );
    }
    void identityApi
      .inbox(query.limit, query.page * query.limit, controller.signal)
      .then((data) => {
        if (!active()) return;
        const lastPage = lastInboxPage(data.total, query.limit);
        if (query.page > lastPage) {
          setQuery((previous) =>
            previous === query ? { ...query, page: lastPage } : previous,
          );
        } else {
          setResponse({ query, data });
        }
      })
      .catch((error: unknown) => {
        if (active()) setResponse({ query, error });
      });
    return () => controller.abort();
  }, [actor, generation, query]);

  useEffect(() => {
    if (!current?.data) return;
    const candidates = current.data.items.flatMap((item) => {
      const key = `${item.id}:${item.expires_at}`;
      if (item.status !== "PENDING" || observedExpirations.current.has(key))
        return [];
      return [{ key, deadline: Date.parse(item.expires_at) }];
    });
    if (!candidates.length) return;
    const first = Math.min(...candidates.map(({ deadline }) => deadline));
    const delay = Math.max(0, first - Date.now());
    if (delay > 2_147_483_647) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      for (const { key, deadline } of candidates)
        if (deadline <= now) observedExpirations.current.add(key);
      reloadInbox();
    }, delay + 50);
    return () => clearTimeout(timer);
  }, [current]);

  function inContext() {
    const session = readSession();
    return session.generation === generation && session.profile?.id === actor;
  }

  async function refreshProfileFor(receiptId: string) {
    if (!inContext()) return;
    const request = ++profileRequest.current;
    const active = () => inContext() && request === profileRequest.current;
    setProfileLoading(true);
    try {
      await reloadProfile();
      if (active())
        setReceipt((previous) =>
          previous?.id === receiptId
            ? { ...previous, profileFailed: false }
            : previous,
        );
    } catch {
      if (active())
        setReceipt((previous) =>
          previous?.id === receiptId
            ? { ...previous, profileFailed: true }
            : previous,
        );
    } finally {
      if (active()) setProfileLoading(false);
    }
  }

  function openAction(invitation: InboxInvitation, action: InvitationAction) {
    if (
      !inContext() ||
      !canRespondToInvitation(invitation, action) ||
      operation.status === "submitting" ||
      operation.status === "outcome-unknown"
    )
      return;
    operation.reset();
    setSelection({ invitation, action });
  }

  function closeAction() {
    if (operation.status === "submitting") return;
    setSelection(null);
    if (operation.status !== "outcome-unknown") {
      operation.reset();
      setPending(null);
    }
  }

  async function submitAction() {
    if (!selection || !inContext()) return;
    const retry = operation.status === "outcome-unknown";
    const target = retry ? pending : selection;
    if (
      !target ||
      operation.status === "submitting" ||
      operation.status === "rejected"
    )
      return;
    if (!retry && !canRespondToInvitation(target.invitation, target.action))
      return;
    setPending(target);
    profileRequest.current++;
    setProfileLoading(false);
    setReceipt(undefined);
    const result = await (retry
      ? operation.retry()
      : operation.start(
          identityApi.invitationAction(target.invitation.id, target.action),
        ));
    if (!inContext()) return;
    // A missing receipt can mean a committed action whose response was lost.
    // Refresh the server state while the coordinator retains the original intent.
    reloadInbox();
    if (!result) return;
    const organizationId = target.invitation.organization_id;
    setReceipt({
      id: result.invitation_id,
      organizationId,
      status: result.status,
      profileFailed: false,
    });
    setSelection(null);
    setPending(null);
    if (result.status === "ACCEPTED")
      void refreshProfileFor(result.invitation_id);
  }

  const error =
    operation.error instanceof ApiException ? operation.error : null;
  const unknown = operation.status === "outcome-unknown";
  const expiredRetry = error?.code === "OPERATION_RETRY_EXPIRED";
  const phase: InvitationActionPhase =
    operation.status === "submitting"
      ? "submitting"
      : unknown
        ? "unknown"
        : error?.code === "INVITATION_EXPIRED"
          ? "expired"
          : error?.code === "INVITATION_NOT_PENDING"
            ? "not_pending"
            : error?.code === "ALREADY_MEMBER"
              ? "already_member"
              : error?.status === 403
                ? "forbidden"
                : "normal";
  const view: InboxFixture = !current
    ? loadingView
    : current.data
      ? {
          state: current.data.items.length ? "success" : "empty",
          invitations: current.data.items.map((item) => ({
            ...item,
            mark: identityInitials(item.organization_name),
          })),
        }
      : {
          state: "error",
          invitations: [],
          message: `${copy.error} ${formatIdentityError(current.error)}`,
        };

  return (
    <MyInvitationsPage
      fixture={view}
      onReload={reloadInbox}
      live={{
        page: query.page,
        limit: query.limit,
        total: current?.data?.total ?? 0,
        onPage: (page) => setQuery((previous) => ({ ...previous, page })),
        onLimit: (limit) =>
          setQuery((previous) => ({ ...previous, limit, page: 0 })),
        onReloadProfile:
          receipt && !profileLoading
            ? () => void refreshProfileFor(receipt.id)
            : undefined,
        selection: selection ? { ...selection, phase } : null,
        onAction: openAction,
        onClose: closeAction,
        onSubmit:
          expiredRetry || operation.status === "rejected"
            ? undefined
            : () => void submitAction(),
        temporarilyLocked: operation.status === "submitting" || unknown,
        pendingInvitation: unknown ? pending?.invitation.id : undefined,
        onCheck:
          unknown && pending && !expiredRetry
            ? () => setSelection(pending)
            : undefined,
        actionFeedback: operation.error
          ? formatIdentityError(operation.error)
          : undefined,
        receipt,
      }}
    />
  );
}
