"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { focusField } from "@/components/ui";
import { AuthField, AuthNotice, AuthTabs } from "./AuthControls";
import { authContent as copy } from "./content";
import { sanitizeNext, readSession, clearSession } from "@/lib/auth";
import { ApiException, describeError } from "@/lib/errors";
import { useSession } from "@/lib/useSession";
import { validateAuth, type AuthForm } from "./validation";
import { loginAccount, registerAccount } from "./authApi";
import { RecoveryForm } from "./RecoveryForm";
import Link from "next/link";
import "./auth.css";

type Mode = "login" | "register";
export function AuthPage() {
  const router = useRouter(),
    searchParams = useSearchParams();
  const { state, reload } = useSession();
  const target = useMemo(
    () => sanitizeNext(searchParams.get("next")),
    [searchParams],
  );
  const [recovery, setRecovery] = useState(
    searchParams.get("mode") === "recovery",
  );
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState<AuthForm>({
    email: "",
    password: "",
    display_name: "",
  });
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof AuthForm, string>>
  >({});
  const [apiError, setApiError] = useState<{
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false),
    [created, setCreated] = useState(false),
    [waitingProfile, setWaitingProfile] = useState(false),
    [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(Date.now());
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
  // One redirect owner; recovery remains accessible with an existing session.
  useEffect(() => {
    if (state === "AUTHENTICATED" && !recovery) {
      setForm((p) => ({ ...p, password: "" }));
      router.replace(target);
    }
  }, [state, recovery, router, target]);
  useEffect(() => {
    const email = (searchParams.get("email") ?? "").trim();
    if (email) setForm((p) => ({ ...p, email: p.email || email }));
  }, [searchParams]);
  function changeMode(next: Mode) {
    revision.current++;
    controller.current?.abort();
    setMode(next);
    setCreated(false);
    setWaitingProfile(false);
    setApiError(null);
    setFieldErrors({});
    setForm((p) => ({ ...p, password: "" }));
  }
  const setValue = (name: keyof AuthForm) => (value: string) => {
    setForm((p) => ({ ...p, [name]: value }));
    setFieldErrors((p) => ({ ...p, [name]: undefined }));
  };
  async function submit() {
    if (pending.current || retryAt > Date.now()) return;
    const errors = validateAuth(mode, form);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      focusField(Object.keys(errors)[0]);
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setApiError(null);
    const run = revision.current;
    controller.current = new AbortController();
    const generation = readSession().generation;
    let registering = mode === "register" && !created;
    try {
      const email = form.email.trim().toLowerCase(),
        password = form.password;
      if (registering) {
        await registerAccount(
          { email, password, display_name: form.display_name.trim() },
          controller.current.signal,
        );
        registering = false;
        if (run !== revision.current) return;
        setCreated(true);
      }
      await loginAccount(
        { email, password },
        controller.current.signal,
        generation,
      );
      if (run !== revision.current) return;
      setWaitingProfile(true);
      setForm((p) => ({ ...p, password: "" }));
      // useSession validates /users/me and owns the redirect; do not create another login.
    } catch (e) {
      if (run === revision.current) {
        setApiError(
          e instanceof ApiException && e.code === "UNAUTHENTICATED"
            ? {
                message: "Email hoặc mật khẩu không đúng.",
              }
            : describeError(e),
        );
        if (e instanceof ApiException && e.status === 429)
          setRetryAt(Date.now() + e.retryAfter * 1000);
        if (e instanceof ApiException && e.code === "EMAIL_TAKEN") {
          setMode("login");
          setCreated(false);
        }
        if (
          registering &&
          e instanceof ApiException &&
          (e.status === 0 || e.status >= 500)
        )
          setApiError({
            message:
              "Yêu cầu chưa có kết quả chắc chắn. Tài khoản có thể đã được tạo; hãy đăng nhập hoặc khôi phục trước khi gửi lại đăng ký.",
          });
      }
    } finally {
      pending.current = false;
      if (run === revision.current) setSubmitting(false);
    }
  }
  const locked = submitting;
  const verifyingLogin =
    waitingProfile && state !== "UNAVAILABLE" && state !== "ANONYMOUS";
  return (
    <div
      className="lamu-auth-theme lamu-auth-page"
      data-redirecting={state === "AUTHENTICATED" && !recovery}
    >
      <aside
        className="lamu-auth-intro"
        aria-label="Cùng Lamu gặp gỡ cộng đồng"
      >
        <p className="lamu-auth-eyebrow">
          <span aria-hidden="true" /> CÙNG LAMU, NGOÀI ĐỜI
        </p>
        <p className="lamu-auth-statement">
          Một lời rủ.
          <br />
          Một cuộc gặp.
          <br />
          <em>Một điều đáng nhớ.</em>
        </p>
        <p className="lamu-auth-introText">
          Khám phá sự kiện bạn yêu thích và gặp những người cùng mối quan tâm.
        </p>
        <div className="lamu-auth-ticket" aria-hidden="true">
          <div>
            <span>LAMU / LỜI HẸN TIẾP THEO</span>
            <span>↗</span>
          </div>
          <strong>
            Hẹn gặp bạn
            <br />
            <em>ở ngoài đời.</em>
          </strong>
          <div>
            <span>CỘNG ĐỒNG & SỰ KIỆN</span>
            <span>✳</span>
          </div>
        </div>
      </aside>
      <div className="lamu-auth-formColumn">
        <section className="lamu-auth-card" aria-labelledby="auth-title">
          <div className="lamu-auth-cardHeader">
            <div className="lamu-auth-tagline">
              <span aria-hidden="true" />
              {copy.tagline}
            </div>
            <h1 id="auth-title">
              {recovery ? "Quên mật khẩu" : copy.titles[mode]}
            </h1>
            <p>
              {recovery
                ? "Nhận mã qua email để đặt lại mật khẩu."
                : copy.descriptions[mode]}
            </p>
          </div>
          {recovery ? (
            <RecoveryForm
              email={form.email}
              onClose={() => {
                setRecovery(false);
                changeMode("login");
              }}
            />
          ) : (
            <>
              <AuthTabs mode={mode} locked={locked} onChange={changeMode} />
              <div
                id="auth-panel"
                role="tabpanel"
                aria-labelledby={`auth-tab-${mode}`}
              >
                <div className="lamu-auth-notices">
                  {searchParams.get("reason") === "password-changed" && (
                    <AuthNotice kind="success">
                      {copy.passwordChanged}
                    </AuthNotice>
                  )}
                  {apiError && (
                    <AuthNotice kind="error">{apiError.message}</AuthNotice>
                  )}
                  {created && (
                    <AuthNotice kind="success">
                      Tài khoản đã được tạo. Nếu đăng nhập lỗi, nút tiếp tục chỉ
                      thử đăng nhập.
                    </AuthNotice>
                  )}
                  {(state === "ERROR" || verifyingLogin) && (
                    <AuthNotice kind="info">
                      Đang xác minh phiên với dịch vụ danh tính. Nếu dịch vụ tạm
                      lỗi, hãy tải lại phiên.
                      <button
                        type="button"
                        className="lamu-auth-textButton"
                        disabled={submitting}
                        onClick={() =>
                          void reload().catch((e) =>
                            setApiError(describeError(e)),
                          )
                        }
                      >
                        Tải lại phiên
                      </button>
                    </AuthNotice>
                  )}
                  {retryAt > now && (
                    <AuthNotice kind="warning">
                      Vui lòng chờ {Math.ceil((retryAt - now) / 1000)} giây.
                    </AuthNotice>
                  )}
                </div>
                {state === "UNAVAILABLE" && (
                  <p role="status">Tài khoản hiện không khả dụng.</p>
                )}
                {!verifyingLogin && (
                  <form
                    noValidate
                    aria-busy={locked}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    {mode === "register" && !created && (
                      <AuthField
                        name="display_name"
                        label={copy.name}
                        placeholder={copy.namePlaceholder}
                        autoComplete="name"
                        readOnly={locked}
                        value={form.display_name}
                        onChange={setValue("display_name")}
                        onBlur={() => setFieldErrors(validateAuth(mode, form))}
                        error={fieldErrors.display_name}
                      />
                    )}
                    <AuthField
                      name="email"
                      label={copy.email}
                      type="email"
                      placeholder={copy.emailPlaceholder}
                      autoComplete="email"
                      maxLength={254}
                      readOnly={locked || created}
                      value={form.email}
                      onChange={setValue("email")}
                      onBlur={() => {}}
                      error={fieldErrors.email}
                    />
                    <AuthField
                      name="password"
                      label={copy.password}
                      type="password"
                      placeholder={copy.passwordPlaceholder}
                      autoComplete={
                        mode === "login" || created
                          ? "current-password"
                          : "new-password"
                      }
                      readOnly={locked}
                      value={form.password}
                      onChange={setValue("password")}
                      onBlur={() => {}}
                      error={fieldErrors.password}
                      action={
                        <button
                          type="button"
                          className="lamu-auth-forgot"
                          disabled={locked}
                          onClick={() => {
                            revision.current++;
                            setForm((p) => ({ ...p, password: "" }));
                            setRecovery(true);
                          }}
                        >
                          Quên mật khẩu?
                        </button>
                      }
                    />
                    <button
                      type="submit"
                      className="lamu-auth-submit"
                      disabled={locked || retryAt > now}
                    >
                      {submitting && (
                        <span
                          className="lamu-auth-spinner"
                          aria-hidden="true"
                        />
                      )}
                      <span aria-live="polite">
                        {submitting
                          ? "Đang xử lý…"
                          : mode === "register" && !created
                            ? "Tạo tài khoản"
                            : "Đăng nhập"}
                      </span>
                      {!submitting && <span aria-hidden="true">→</span>}
                    </button>
                  </form>
                )}
                {verifyingLogin && (
                  <button
                    type="button"
                    className="lamu-auth-forgot"
                    onClick={() => {
                      setRecovery(true);
                      setForm((p) => ({ ...p, password: "" }));
                    }}
                  >
                    Quên mật khẩu?
                  </button>
                )}
                {state === "ERROR" && (
                  <button
                    type="button"
                    className="lamu-auth-textButton"
                    onClick={() =>
                      void clearSession().then(() => {
                        setWaitingProfile(false);
                        setForm((p) => ({ ...p, password: "" }));
                      })
                    }
                  >
                    Đăng nhập lại
                  </button>
                )}
              </div>
            </>
          )}
        </section>
        <Link className="lamu-auth-homeLink" href="/">
          ← Trở về trang chủ Lamu
        </Link>
      </div>
    </div>
  );
}
