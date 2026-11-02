/**
 * UI suy quyền từ `memberships[].roles[]` trả về ở GET /users/me (05 §1).
 * Identity là nguồn sự thật; mọi request vẫn có thể 403 và UI coi đó là nhánh bình thường.
 */
export type Right =
  | "event.read"
  | "event.create"
  | "event.publish"
  | "event.cancel"
  | "event.update"
  | "ticket.checkin";

const ROLE_RIGHTS: Record<string, Right[]> = {
  OWNER: ["event.read", "event.create", "event.publish", "event.cancel", "event.update", "ticket.checkin"],
  ADMIN: ["event.read", "event.create", "event.publish", "event.cancel", "event.update", "ticket.checkin"],
  SPEAKER: ["event.read"],
  ATTENDEE: [],
};

export function rightsOf(roles: string[]): Set<Right> {
  const set = new Set<Right>();
  for (const role of roles) {
    for (const right of ROLE_RIGHTS[role] ?? []) set.add(right);
  }
  return set;
}
