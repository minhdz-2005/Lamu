import type { MeProfile } from "../../lib/types";
import { validAvatar } from "../../lib/avatar";
import { emptyCover, validCover, validOrganizationDescription } from "../../lib/organizationProfile";
import type { AccountProfile } from "./accountData";

export function identityInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return "•";
  const edges =
    words.length === 1 ? words : [words[0], words[words.length - 1]];
  return edges
    .map((word) => Array.from(word)[0])
    .join("")
    .toLocaleUpperCase("vi");
}

export function toAccountProfile(profile: MeProfile): AccountProfile {
  return {
    displayName: profile.display_name,
    email: profile.email,
    initials: identityInitials(profile.display_name),
    ...(validAvatar(profile.avatar) ? { avatar: profile.avatar } : {}),
    memberships: profile.memberships.map(
      ({ organization_id, name, slug, roles, description, cover }) => ({
        organizationId: organization_id,
        name,
        slug,
        roles,
        description: validOrganizationDescription(description) ? description : null,
        cover: validCover(cover) ? cover : emptyCover,
      }),
    ),
  };
}
