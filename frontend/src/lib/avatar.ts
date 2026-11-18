import type { Avatar, MeProfile } from "./types";
import { authMode } from "./authMode";

export function validAvatar(value: unknown): value is Avatar {
  return validMediaDisplay(value, "/api/mock-avatar/");
}

export function validMediaDisplay(value: unknown, mockPath: string): value is Avatar {
  const avatar = value as Avatar | null;
  if (
    !avatar ||
    typeof avatar.revision !== "string" ||
    !/^\d{1,19}$/.test(avatar.revision)
  )
    return false;
  if (avatar.url === null) return true;
  if (typeof avatar.url !== "string") return false;
  try {
    const url = new URL(avatar.url);
    return (
      url.protocol === "https:" ||
      (authMode === "mock" &&
        typeof window !== "undefined" &&
        url.origin === window.location.origin &&
        url.pathname.startsWith(mockPath) &&
        /^[a-f0-9-]+$/i.test(url.pathname.slice(mockPath.length)))
    );
  } catch {
    return false;
  }
}

export function keepNewestAvatar(
  profile: MeProfile,
  previous?: MeProfile | null,
): MeProfile {
  if (previous?.id !== profile.id || !validAvatar(previous.avatar))
    return profile;
  if (
    !validAvatar(profile.avatar) ||
    BigInt(previous.avatar.revision) > BigInt(profile.avatar.revision)
  )
    return { ...profile, avatar: previous.avatar };
  return profile;
}

export const avatarFormats = ["image/jpeg", "image/png", "image/webp"];
export const maxAvatarBytes = 5 * 1024 * 1024;
