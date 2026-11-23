import type { Membership, MeProfile } from "./types";
import { validMediaDisplay } from "./avatar";

export const emptyCover = { url: null, revision: "0" };
export const descriptionLimit = 1000;
const configuredCoverLimit = Number(
  process.env.NEXT_PUBLIC_ORG_COVER_MAX_BYTES,
);
const defaultCoverLimit = 10 * 1024 * 1024;
export const maxCoverBytes =
  Number.isInteger(configuredCoverLimit) &&
  configuredCoverLimit > 0 &&
  configuredCoverLimit <= defaultCoverLimit
    ? configuredCoverLimit
    : defaultCoverLimit;
export const descriptionError =
  "Mô tả tối đa 1.000 ký tự và không chứa ký tự null.";
export const validOrganizationDescription = (
  value: unknown,
): value is string | null =>
  value === null ||
  (typeof value === "string" && /^[^\u0000]{0,1000}$/u.test(value));

export const validCover = (
  value: unknown,
): value is NonNullable<Membership["cover"]> =>
  validMediaDisplay(value, "/api/mock-cover/");

export function newestCover(
  current: Membership["cover"],
  previous?: Membership["cover"],
) {
  return previous &&
    (!validCover(current) ||
      BigInt(previous.revision) > BigInt(current.revision))
    ? previous
    : current;
}

export type OrganizationProfileUpdate = Pick<
  Membership,
  "description" | "cover"
>;

export function applyOrganizationUpdate<T extends OrganizationProfileUpdate>(
  row: T,
  update: OrganizationProfileUpdate,
): T {
  return {
    ...row,
    ...(update.description !== undefined
      ? { description: update.description }
      : {}),
    ...(update.cover ? { cover: newestCover(row.cover, update.cover) } : {}),
  };
}

// Description has no server revision. Reads capture the local version before
// fetching so a confirmed save can fence off earlier responses for that org.
function createOrganizationReadGuard() {
  let generation: string | undefined;
  let version = 0;
  const entries = new Map<
    string,
    { version: number; description: string | null }
  >();
  return {
    start: () => version,
    record(session: string, orgId: string, description: string | null) {
      if (generation !== session) {
        generation = session;
        entries.clear();
      }
      entries.set(orgId, { version: ++version, description });
    },
    merge<T extends OrganizationProfileUpdate>(
      row: T,
      session: string,
      orgId: string,
      started: number,
      cover?: Membership["cover"],
    ): T {
      const saved = generation === session ? entries.get(orgId) : undefined;
      return applyOrganizationUpdate(row, {
        description:
          saved && saved.version > started ? saved.description : undefined,
        cover,
      });
    },
  };
}

export const organizationReads = createOrganizationReadGuard();

export function mergeOrganizationMemberships(
  profile: MeProfile,
  previous: MeProfile | null | undefined,
  generation: string,
  started: number,
): MeProfile {
  const covers = new Map(
    previous?.id === profile.id
      ? previous.memberships.map(
          (row) =>
            [
              row.organization_id,
              validCover(row.cover) ? row.cover : undefined,
            ] as const,
        )
      : [],
  );
  return {
    ...profile,
    memberships: profile.memberships.map((row) =>
      organizationReads.merge(
        row,
        generation,
        row.organization_id,
        started,
        covers.get(row.organization_id),
      ),
    ),
  };
}
