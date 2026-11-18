"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { validPassword } from "@/features/auth/validation";
import { authContent } from "@/features/auth/content";
import { ApiException } from "@/lib/errors";
import type { components } from "../../../../shared/contracts/http/generated/identity";

export type PasswordChange = components["schemas"]["ChangePasswordRequest"];

const fields = [
  {
    name: "current_password",
    label: "Mật khẩu hiện tại",
    autoComplete: "current-password",
  },
  { name: "new_password", label: "Mật khẩu mới", autoComplete: "new-password" },
  {
    name: "confirmation",
    label: "Xác nhận mật khẩu mới",
    autoComplete: "new-password",
  },
] as const;
type Field = (typeof fields)[number]["name"];

export function PasswordChangeForm({
  change,
  reauthenticate,
}: {
  change: (body: PasswordChange, signal: AbortSignal) => Promise<void>;
  reauthenticate?: () => Promise<void>;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState("");
  const [signIn, setSignIn] = useState(false);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (open) form.current?.querySelector("input")?.focus();
  }, [open]);

  function fieldError(name: Field, message: string) {
    setErrors({ [name]: message });
    form.current?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.focus();
  }

  function close() {
    setOpen(false);
    setErrors({});
    setSignIn(false);
    setNotice("");
    trigger.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || signIn) return;
    const values = new FormData(event.currentTarget);
    const current_password = String(values.get("current_password") ?? "");
    const new_password = String(values.get("new_password") ?? "");
    setNotice("");
    if (!validPassword(current_password))
      return fieldError(
        "current_password",
        "Mật khẩu hiện tại cần từ 8 đến 128 ký tự.",
      );
    if (!validPassword(new_password))
      return fieldError("new_password", "Mật khẩu mới cần từ 8 đến 128 ký tự.");
    if (values.get("confirmation") !== new_password)
      return fieldError("confirmation", "Xác nhận mật khẩu mới không khớp.");
    setErrors({});
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      await change({ current_password, new_password }, controller.signal);
      if (controller.signal.aborted) return;
      close();
      setNotice(authContent.passwordChanged);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiException) {
        if (error.code === "CURRENT_PASSWORD_INCORRECT")
          return fieldError(
            "current_password",
            "Mật khẩu hiện tại không đúng.",
          );
        if (error.status === 400)
          return fieldError(
            "new_password",
            "Mật khẩu mới cần từ 8 đến 128 ký tự.",
          );
        if (error.status === 429)
          return setNotice(
            `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${error.retryAfter} giây.`,
          );
        if (error.status === 403) return setNotice(error.displayMessage);
        if (error.status === 401) {
          setSignIn(true);
          return setNotice("Phiên đã hết hạn. Vui lòng đăng nhập lại.");
        }
      }
      setSignIn(true);
      setNotice(
        "Chưa xác định được mật khẩu đã đổi hay chưa. Hãy đăng nhập lại bằng mật khẩu mới để kiểm tra.",
      );
    } finally {
      form.current?.reset();
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="lamu-account-password">
      <button
        ref={trigger}
        type="button"
        className="lamu-account-reload"
        onClick={() => {
          if (!open) {
            setOpen(true);
            setNotice("");
          }
        }}
        aria-expanded={open}
      >
        Đổi mật khẩu
      </button>
      {notice && <p role="status">{notice}</p>}
      {open && (
        <form
          ref={form}
          onSubmit={submit}
          aria-label="Đổi mật khẩu"
          aria-busy={busy}
        >
          {fields.map(({ name, label, autoComplete }) => (
            <div key={name}>
              <label htmlFor={`change-${name}`}>{label}</label>
              <input
                type="password"
                id={`change-${name}`}
                name={name}
                autoComplete={autoComplete}
                readOnly={busy || signIn}
                aria-invalid={Boolean(errors[name])}
                aria-describedby={
                  errors[name] ? `change-${name}-error` : undefined
                }
                onChange={() =>
                  setErrors((previous) => ({ ...previous, [name]: undefined }))
                }
              />
              {errors[name] && (
                <p
                  className="lamu-account-fieldError"
                  id={`change-${name}-error`}
                  role="alert"
                >
                  {errors[name]}
                </p>
              )}
            </div>
          ))}
          <div className="lamu-account-passwordButtons">
            {signIn && reauthenticate ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void reauthenticate().catch(() =>
                    setNotice("Không thể xóa phiên. Vui lòng thử lại."),
                  );
                }}
              >
                Đăng nhập lại
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || signIn}
              >
                {busy ? "Đang lưu…" : "Lưu mật khẩu"}
              </button>
            )}
            <button
              type="button"
              className="lamu-account-reload"
              disabled={busy}
              onClick={close}
            >
              Hủy
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
