import type { components } from "../../../../shared/contracts/http/generated/identity";
import { rawRequest, request } from "../../lib/apiClient";
import { readSession, withSessionLock, writeSession } from "../../lib/auth";
import type { AuthTokens, MeProfile } from "../../lib/types";
type Schema = components["schemas"];
export const registerAccount = (
  body: Schema["RegisterRequest"],
  signal?: AbortSignal,
) =>
  request<Schema["Registered"]>("/auth/register", {
    method: "POST",
    body,
    anonymous: true,
    signal,
  });
export async function loginAccount(
  body: Schema["LoginRequest"],
  signal?: AbortSignal,
  expected = readSession().generation,
) {
  await withSessionLock(async () => {
    if (readSession().generation !== expected)
      throw new Error("Phiên đã thay đổi. Vui lòng thử lại.");
    const tokens = await rawRequest<AuthTokens>("/auth/login", {
      method: "POST",
      body,
      anonymous: true,
      signal,
    });
    const record = {
      version: 2 as const,
      generation: crypto.randomUUID(),
      access: tokens.access_token,
      refresh: tokens.refresh_token,
    };
    // Persist the pair even if profile transport fails; retry profile instead of creating another login.
    writeSession(record);
  });
}
export const forgotPassword = (
  body: Schema["ForgotPasswordRequest"],
  signal?: AbortSignal,
) =>
  request<Schema["RecoveryAccepted"]>("/auth/forgot-password", {
    method: "POST",
    body,
    anonymous: true,
    signal,
  });
export const verifyCode = (
  body: Schema["VerifyResetCodeRequest"],
  signal?: AbortSignal,
) =>
  request<Schema["ResetVerified"]>("/auth/verify-reset-code", {
    method: "POST",
    body,
    anonymous: true,
    signal,
  });
export async function resetPassword(
  body: Schema["ResetPasswordRequest"],
  signal?: AbortSignal,
) {
  await withSessionLock(async () => {
    await rawRequest<Schema["RecoveryAccepted"]>("/auth/reset-password", {
      method: "POST",
      body,
      anonymous: true,
      signal,
    });
    // Conservative policy: reset clears this browser's current auth session, regardless of email.
    writeSession({
      version: 2,
      generation: crypto.randomUUID(),
      access: null,
      refresh: null,
    });
  });
}
export const profileRequest = (signal?: AbortSignal) =>
  request<MeProfile>("/users/me", { signal });
