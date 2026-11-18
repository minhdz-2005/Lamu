import type { InboxInvitation, InvitationAction } from "./invitationsData";

export function canRespondToInvitation(
  invitation: Pick<InboxInvitation, "status" | "roles" | "organization_id">,
  action: InvitationAction,
): boolean {
  return (
    invitation.status === "PENDING" &&
    (action === "decline" ||
      invitation.roles.every(
        (role) =>
          role.resource_type === "ORG" &&
          role.resource_id === invitation.organization_id &&
          (role.code === "OWNER" || role.code === "ADMIN"),
      ))
  );
}

export function lastInboxPage(total: number, limit: number): number {
  return Math.max(0, Math.ceil(total / limit) - 1);
}
