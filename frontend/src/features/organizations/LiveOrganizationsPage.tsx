"use client";

import { useRef, useState } from "react";
import { readSession } from "@/lib/auth";
import { ApiException, formatIdentityError } from "@/lib/errors";
import { identityApi, type OrganizationCreated } from "@/lib/identityApi";
import { useIdentityOperation } from "@/lib/identityOperation";
import { useSession, type Session } from "@/lib/useSession";
import { toAccountProfile } from "@/features/account/accountView";
import { OrganizationsPage } from "./OrganizationsPage";
import {
  organizationsCopy as copy,
  type CreateDialogFixture,
  type OrganizationsFixture,
} from "./organizationsData";

export function LiveOrganizationsPage() {
  const session = useSession();
  return <OrganizationsController key={session.generation} session={session} />;
}

function OrganizationsController({ session }: { session: Session }) {
  const { state, profile, error, reload, generation } = session;
  const operation = useIdentityOperation<OrganizationCreated>(generation);
  const [name, setName] = useState("");
  const [createdId, setCreatedId] = useState<string>();
  const [reloadFailed, setReloadFailed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const profileRequest = useRef(0);

  async function reloadProfile() {
    if (readSession().generation !== generation) return;
    const request = ++profileRequest.current;
    const active = () =>
      request === profileRequest.current &&
      readSession().generation === generation;
    setReloading(true);
    try {
      await reload();
      if (active()) setReloadFailed(false);
    } catch {
      if (active()) setReloadFailed(true);
    } finally {
      if (active()) setReloading(false);
    }
  }

  async function applyResult(result: Promise<OrganizationCreated | undefined>) {
    const receipt = await result;
    if (!receipt || readSession().generation !== generation) return;
    setCreatedId(receipt.organization_id);
    void reloadProfile();
  }

  function create(nextName: string, description: string | null) {
    if (
      state !== "AUTHENTICATED" ||
      error ||
      readSession().generation !== generation
    )
      return;
    setName(nextName);
    void applyResult(operation.start(identityApi.createOrganization(nextName, description)));
  }

  function closeDialog() {
    if (operation.status === "outcome-unknown") return;
    operation.reset();
    profileRequest.current++;
    setReloading(false);
    setCreatedId(undefined);
    setReloadFailed(false);
    setName("");
  }

  const memberships = profile ? toAccountProfile(profile).memberships : [];
  const rateLimited = error instanceof ApiException && error.status === 429;
  let view: OrganizationsFixture;
  if (state === "UNKNOWN") view = { state: "loading", memberships: [] };
  else if (state === "UNAVAILABLE")
    view = {
      state: "unavailable",
      memberships: [],
      notice: { kind: "error", text: "Tài khoản hiện không khả dụng." },
    };
  else if (state === "ANONYMOUS")
    view = {
      state: "anonymous",
      memberships: [],
      notice: {
        kind: "warn",
        text: "Vui lòng đăng nhập để xem tổ chức của bạn.",
      },
    };
  else if (state === "ERROR" || error)
    view = {
      state: rateLimited ? "ratelimit" : "error",
      memberships,
      notice: {
        kind: rateLimited ? "warn" : "error",
        text: formatIdentityError(error),
      },
    };
  else view = { state: memberships.length ? "success" : "empty", memberships };

  const operationError =
    operation.error instanceof ApiException ? operation.error : null;
  let dialog: CreateDialogFixture = { state: "initial", name };
  if (createdId) {
    dialog = {
      state: reloadFailed ? "reload_error" : "success",
      name,
      organizationId: createdId,
      notice: reloadFailed
        ? {
            kind: "warn",
            text: "Đã tạo tổ chức. Danh sách chưa được cập nhật.",
          }
        : { kind: "ok", text: "Đã tạo tổ chức thành công." },
    };
  } else if (operation.status === "submitting") {
    dialog = { state: "creating", name };
  } else if (operation.status === "outcome-unknown") {
    const expired = operationError?.code === "OPERATION_RETRY_EXPIRED";
    dialog = {
      state: "unknown_result",
      name,
      notice: {
        kind: "warn",
        text: expired
          ? "Đã hết thời hạn kiểm tra thao tác. Hãy tải lại danh sách để đối chiếu kết quả."
          : `Chưa xác định được kết quả tạo tổ chức. ${formatIdentityError(operation.error)}`,
      },
    };
  } else if (operation.status === "rejected") {
    const invalidName = operationError?.code === "VALIDATION_FAILED";
    dialog = {
      state: invalidName ? "validation_error" : "conflict",
      name,
      nameError: invalidName ? copy.validation : undefined,
      notice: { kind: "error", text: formatIdentityError(operation.error) },
    };
  }

  return (
    <OrganizationsPage
      fixture={view}
      createDisabled={state !== "AUTHENTICATED" || Boolean(error)}
      dialogFixture={dialog}
      onSubmit={create}
      onCheck={
        operationError?.code === "OPERATION_RETRY_EXPIRED" ||
        state !== "AUTHENTICATED"
          ? undefined
          : () => void applyResult(operation.retry())
      }
      onCloseDialog={closeDialog}
      onReload={() => void reloadProfile()}
      reloading={reloading}
    />
  );
}
