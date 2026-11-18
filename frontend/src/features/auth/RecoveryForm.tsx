"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { AuthField, AuthNotice } from "./AuthControls";
import { forgotPassword, verifyCode, resetPassword } from "./authApi";
import { initialRecovery, recoveryReducer, validCode } from "./recoveryState";
import { ApiException, describeError } from "../../lib/errors";
import { validPassword } from "./validation";

const cooldown = () => {
  const n = Number(process.env.NEXT_PUBLIC_RECOVERY_COOLDOWN_SECONDS ?? 60);
  return Number.isFinite(n) ? Math.max(1, Math.min(3600, n)) : 60;
};
export function RecoveryForm({
  email: seed,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  const [state, dispatch] = useReducer(recoveryReducer, {
    ...initialRecovery,
    email: seed,
  });
  const [email, setEmail] = useState(seed),
    [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<{
      message: string;
    } | null>(null),
    [now, setNow] = useState(Date.now());
  const [rateUntil, setRateUntil] = useState(0);
  const pending = useRef(false),
    controller = useRef<AbortController | null>(null),
    revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    document
      .getElementById(
        state.step === "EMAIL"
          ? "recovery-email"
          : state.step === "CODE"
            ? "recovery-code"
            : state.step === "NEW_PASSWORD"
              ? "new-password"
              : "recovery-success",
      )
      ?.focus();
  }, [state.step]);
  const resetFields = () => {
    setCode("");
    setPassword("");
    setConfirm("");
  };
  async function perform(kind: "send" | "verify" | "reset") {
    if (pending.current || rateUntil > Date.now()) return;
    if (
      kind === "send" &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        email.trim().length > 254)
    ) {
      setError({ message: "Email không hợp lệ." });
      return;
    }
    if (kind === "verify" && !validCode(code)) {
      setError({ message: "Nhập đúng sáu chữ số trong email." });
      return;
    }
    if (
      kind === "reset" &&
      (!validPassword(password) || password !== confirm)
    ) {
      setError({
        message: "Mật khẩu cần 8–128 ký tự và hai ô phải giống nhau.",
      });
      return;
    }
    if (
      kind === "reset" &&
      (!state.token || !state.expires || state.expires <= Date.now())
    ) {
      dispatch({ type: "BACK" });
      resetFields();
      setError({ message: "Phiên khôi phục hết hạn. Hãy yêu cầu mã mới." });
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    controller.current = new AbortController();
    const run = revision.current;
    try {
      if (kind === "send") {
        // Clear any prior reset proof before resend, including uncertain sends.
        dispatch({ type: "START", email: email.trim().toLowerCase() });
        resetFields();
        await forgotPassword(
          { email: email.trim().toLowerCase() },
          controller.current.signal,
        );
        if (run === revision.current)
          dispatch({ type: "SENT", until: Date.now() + cooldown() * 1000 });
      } else if (kind === "verify") {
        const result = await verifyCode(
          { email: state.email, code },
          controller.current.signal,
        );
        if (run === revision.current) {
          setCode("");
          dispatch({
            type: "VERIFIED",
            token: result.reset_token,
            expires: Date.now() + result.expires_in * 1000,
          });
        }
      } else {
        const token = state.token!;
        // A lost reset response must not leave a replayable token in UI memory.
        dispatch({ type: "BACK" });
        await resetPassword(
          { reset_token: token, new_password: password },
          controller.current.signal,
        );
        if (run === revision.current) {
          resetFields();
          dispatch({ type: "SUCCESS" });
        }
      }
    } catch (e) {
      if (run === revision.current) {
        const described = describeError(e);
        setError({
          message:
            kind === "reset" &&
            e instanceof ApiException &&
            (e.status === 0 || e.status >= 500)
              ? "Kết quả đổi mật khẩu chưa xác định. Hãy thử đăng nhập bằng mật khẩu mới hoặc bắt đầu khôi phục lại."
              : described.message,
        });
        if (e instanceof ApiException && e.status === 429)
          setRateUntil(Date.now() + e.retryAfter * 1000);
        if (e instanceof ApiException && e.code === "INVALID_RECOVERY") {
          resetFields();
          if (kind === "reset") dispatch({ type: "BACK" });
        }
      }
    } finally {
      pending.current = false;
      if (run === revision.current) setBusy(false);
    }
  }
  const wait = Math.max(0, Math.ceil((state.until - now) / 1000));
  return (
    <div className="lamu-auth-notices lamu-auth-recovery">
      <ol
        className="lamu-auth-recoverySteps"
        aria-label="Các bước khôi phục mật khẩu"
      >
        <li aria-current={state.step === "EMAIL" ? "step" : undefined}>
          Email
        </li>
        <li aria-current={state.step === "CODE" ? "step" : undefined}>
          Mã xác nhận
        </li>
        <li aria-current={state.step === "NEW_PASSWORD" ? "step" : undefined}>
          Mật khẩu mới
        </li>
      </ol>
      <AuthNotice kind="info">
        Nếu email phù hợp với tài khoản, bạn sẽ nhận được mã hướng dẫn. Tiếp
        nhận yêu cầu không bảo đảm thư đã đến. Đổi mật khẩu sẽ thu hồi các phiên
        của tài khoản và yêu cầu đăng nhập lại.
      </AuthNotice>
      {error && <AuthNotice kind="error">{error.message}</AuthNotice>}
      {rateUntil > now && (
        <AuthNotice kind="warning">
          Vui lòng chờ {Math.ceil((rateUntil - now) / 1000)} giây.
        </AuthNotice>
      )}
      {state.step === "SUCCESS" ? (
        <AuthNotice kind="success">
          <span tabIndex={-1} id="recovery-success">
            Mật khẩu đã được đổi. Hãy đăng nhập lại.
          </span>
        </AuthNotice>
      ) : (
        <form
          noValidate
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            void perform(
              state.step === "EMAIL"
                ? "send"
                : state.step === "CODE"
                  ? "verify"
                  : "reset",
            );
          }}
        >
          {state.step === "EMAIL" && (
            <AuthField
              name="recovery-email"
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              readOnly={busy}
              onChange={setEmail}
              onBlur={() => {}}
            />
          )}
          {state.step === "CODE" && (
            <>
              <p>
                Mã gửi tới email bạn nhập: {state.email}. Chỉ mã mới nhất có
                hiệu lực. Nếu không nhận được hoặc mã hết hạn, hãy gửi lại.
              </p>
              <AuthField
                name="recovery-code"
                label="Mã xác nhận sáu chữ số"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                readOnly={busy}
                onChange={setCode}
                onBlur={() => {}}
              />
              <button
                type="button"
                className="lamu-auth-textButton"
                disabled={busy || wait > 0}
                onClick={() => void perform("send")}
              >
                Gửi lại mã{wait > 0 ? ` (${wait}s)` : ""}
              </button>
            </>
          )}
          {state.step === "NEW_PASSWORD" && (
            <>
              <AuthField
                name="new-password"
                label="Mật khẩu mới"
                type="password"
                autoComplete="new-password"
                value={password}
                readOnly={busy}
                onChange={setPassword}
                onBlur={() => {}}
              />
              <AuthField
                name="confirm-password"
                label="Nhập lại mật khẩu mới"
                type="password"
                autoComplete="new-password"
                value={confirm}
                readOnly={busy}
                onChange={setConfirm}
                onBlur={() => {}}
              />
              {state.expires && now >= state.expires && (
                <AuthNotice kind="warning">
                  Phiên đã hết hạn. Bắt đầu lại để nhận mã mới.
                </AuthNotice>
              )}
            </>
          )}
          <button
            type="submit"
            className="lamu-auth-submit"
            disabled={
              busy || rateUntil > now || (state.step === "EMAIL" && wait > 0)
            }
          >
            {busy && <span className="lamu-auth-spinner" aria-hidden="true" />}
            <span aria-live="polite">
              {busy
                ? "Đang xử lý…"
                : state.step === "EMAIL"
                  ? "Gửi mã"
                  : state.step === "CODE"
                    ? "Xác nhận mã"
                    : "Đổi mật khẩu"}
            </span>
          </button>
        </form>
      )}
      {state.step !== "EMAIL" && state.step !== "SUCCESS" && (
        <button
          type="button"
          className="lamu-auth-textButton"
          disabled={busy}
          onClick={() => {
            revision.current++;
            controller.current?.abort();
            resetFields();
            dispatch({ type: "BACK" });
            setError(null);
          }}
        >
          Đổi email / bắt đầu lại
        </button>
      )}
      <button
        type="button"
        className="lamu-auth-textButton"
        disabled={busy}
        onClick={onClose}
      >
        Trở lại đăng nhập
      </button>
    </div>
  );
}
