"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { focusField } from "@/components/ui";
import { AuthField, AuthNotice, AuthTabs } from "./AuthControls";
import { authContent as copy } from "./content";
import { useToast } from "@/components/Toast";
import { request } from "@/lib/apiClient";
import { sanitizeNext, setCachedProfile, setSession } from "@/lib/auth";
import { ApiException, describeError } from "@/lib/errors";
import { useSession } from "@/lib/useSession";
import type { AuthTokens, MeProfile } from "@/lib/types";

type Mode = "login" | "register";
type FieldName = "email" | "password" | "display_name";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate phía UI trước khi gọi API — 01 §2. */
function validate(mode: Mode, form: Record<FieldName, string>): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  const email = form.email.trim();
  if (!email) errors.email = "Trường này không được để trống.";
  else if (!EMAIL_RE.test(email.toLowerCase())) errors.email = "Email không hợp lệ.";

  if (!form.password) errors.password = "Trường này không được để trống.";
  else if (form.password.length < 8) errors.password = "Mật khẩu tối thiểu 8 ký tự.";

  if (mode === "register") {
    const name = form.display_name.trim();
    if (!name) errors.display_name = "Trường này không được để trống.";
    else if (name.length > 80) errors.display_name = "Tên hiển thị tối đa 80 ký tự.";
  }
  return errors;
}

interface AuthPageProps {
  readonly children?: never;
}

export function AuthPage({}: AuthPageProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { state } = useSession();

  const target = useMemo(() => sanitizeNext(searchParams.get("next")), [searchParams]);

  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState<Record<FieldName, string>>({ email: "", password: "", display_name: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [apiError, setApiError] = useState<{ message: string; requestId?: string } | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // 01 §5: vào /auth khi đã có token thì không hiện form.
  useEffect(() => {
    if (state === "AUTHENTICATED") router.replace(target);
  }, [state, target, router]);

  // Liên kết "đăng nhập nhanh" ở trang giới thiệu gửi kèm email: điền sẵn, bắt đầu từ ô mật khẩu.
  useEffect(() => {
    const seeded = (searchParams.get("email") ?? "").trim();
    if (!seeded) return;
    setForm((prev) => (prev.email ? prev : { ...prev, email: seeded }));
    document.getElementById("password")?.focus();
  }, [searchParams]);

  const setValue = (name: FieldName) => (value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const validateOne = (name: FieldName) => () => {
    const next = validate(mode, form);
    setFieldErrors((prev) => ({ ...prev, [name]: next[name] }));
  };

  const finishLogin = useCallback(
    async (tokens: AuthTokens, greeting: string) => {
      setSession(tokens.access_token, tokens.refresh_token);
      let displayName = "";
      try {
        const me = await request<MeProfile>("/users/me");
        setCachedProfile(me);
        displayName = me.display_name;
      } catch {
        // Header sẽ tự gọi lại; không chặn nước đi tiếp (01 §3.1 bước 2 là best effort).
      }
      toast.push(`${greeting}, ${displayName || "bạn"}.`, "success");
      setRedirecting(true);
      window.setTimeout(() => router.replace(target), 400);
    },
    [router, target, toast],
  );

  const login = useCallback(
    async (email: string, password: string, greeting: string) => {
      const tokens = await request<AuthTokens>("/auth/login", {
        method: "POST",
        body: { email, password },
        anonymous: true,
      });
      await finishLogin(tokens, greeting);
    },
    [finishLogin],
  );

  const submit = async () => {
    const errors = validate(mode, form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusField((Object.keys(errors) as FieldName[])[0]);
      return;
    }
    if (submitting) return;

    const email = form.email.trim().toLowerCase();
    const password = form.password;
    setSubmitting(true);
    setApiError(null);
    setCanRetry(false);

    try {
      if (mode === "register") {
        try {
          await request("/auth/register", {
            method: "POST",
            body: { email, password, display_name: form.display_name.trim() },
            anonymous: true,
          });
        } catch (err) {
          if (err instanceof ApiException && err.code === "EMAIL_TAKEN") {
            // 01 §3.2: đường user hay gặp nhất — giữ email, chuyển sang tab Đăng nhập.
            setFieldErrors({ email: err.displayMessage });
            setMode("login");
            return;
          }
          throw err;
        }
      }
      await login(email, password, mode === "register" ? "Tạo tài khoản xong" : "Chào mừng lại");
    } catch (err) {
      if (err instanceof ApiException && err.code === "UNAUTHENTICATED" && mode === "login") {
        // 01 §3.1: một câu chung, không tiết lộ email nào tồn tại.
        setApiError({ message: "Email hoặc mật khẩu không đúng.", requestId: err.requestId });
        focusField("password");
      } else {
        const described = describeError(err);
        setApiError(described);
        setCanRetry(!(err instanceof ApiException && err.status >= 400 && err.status < 500));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const locked = submitting || redirecting;

  return (
    <div className="lamu-auth-theme lamu-auth-page" data-redirecting={redirecting}>
      <section className="lamu-auth-card" aria-labelledby="auth-title">
        <div className="lamu-auth-cardHeader">
          <div className="lamu-auth-tagline"><span aria-hidden="true" />{copy.tagline}</div>
          <h1 id="auth-title">{copy.titles[mode]}</h1>
          <p>{copy.descriptions[mode]}</p>
        </div>
        <AuthTabs mode={mode} locked={locked} onChange={setMode} />
        <div id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${mode}`}>
          <div className="lamu-auth-notices">
            {apiError && <AuthNotice kind="error" requestId={apiError.requestId}>
              {apiError.message}
              {canRetry && <button type="button" className="lamu-auth-textButton" onClick={() => void submit()}>{copy.retry}</button>}
            </AuthNotice>}
            {recoveryNotice && <AuthNotice kind="info">{copy.recovery}</AuthNotice>}
            {redirecting && <AuthNotice kind="success">{copy.success}</AuthNotice>}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate aria-busy={locked}>
            {mode === "register" && <AuthField name="display_name" label={copy.name} placeholder={copy.namePlaceholder}
              autoComplete="name" maxLength={80} readOnly={locked} value={form.display_name}
              onChange={setValue("display_name")} onBlur={validateOne("display_name")} error={fieldErrors.display_name} />}
            <AuthField name="email" label={copy.email} type="email" placeholder={copy.emailPlaceholder}
              autoComplete="email" readOnly={locked} value={form.email}
              onChange={setValue("email")} onBlur={validateOne("email")} error={fieldErrors.email} />
            <AuthField name="password" label={copy.password} type="password" placeholder={copy.passwordPlaceholder}
              autoComplete={mode === "login" ? "current-password" : "new-password"} readOnly={locked} value={form.password}
              onChange={setValue("password")} onBlur={validateOne("password")} error={fieldErrors.password}
              action={mode === "login" && <button type="button" className="lamu-auth-forgot" disabled={locked}
                onClick={() => setRecoveryNotice((value) => !value)} aria-expanded={recoveryNotice}>{copy.forgot}</button>} />
            <button type="submit" className="lamu-auth-submit" disabled={locked}>
              {submitting && <span className="lamu-auth-spinner" aria-hidden="true" />}
              {redirecting ? copy.opening : submitting ? copy.checking : copy.continue}
            </button>
          </form>
        </div>
      </section>
      <style>{`
        .lamu-auth-theme {
          --font-main: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          
          /* Light theme tokens */
          --bg: #FFFFFF;
          --bg-subtle: #FAF9F6;
          --surface-subtle: #F7F6F2;
          --card-bg: #FFFFFF;
          --border: #E9E7E0;
          --border-input: #D4D1C7;
          --text-main: #20201D;
          --text-sub: #4F4F49;
          --text-muted: #77766F;
          --btn-primary-bg: #22221F;
          --btn-primary-text: #FFFFFF;
          --btn-primary-hover: #33332D;
          --sage: #49735E;
          --sage-soft: #E9F0E9;
          --accent: #E9A45B;
          --accent-soft: #FDF4E9;
          --error-border: #D9534F;
          --error-bg: #FDF2F2;
          --error-text: #9E2B2B;
          --card-shadow: 0 4px 20px -2px rgba(32, 32, 29, 0.05), 0 2px 6px -1px rgba(32, 32, 29, 0.03);
          --card-radius: 22px;
          --input-radius: 12px;
          --tab-radius: 10px;
        }
        [data-theme="dark"] .lamu-auth-theme {
          --bg: #171815;
          --bg-subtle: #1C1D19;
          --surface-subtle: #272823;
          --card-bg: #20211D;
          --border: #373831;
          --border-input: #46483E;
          --text-main: #F4F2EB;
          --text-sub: #AAA99F;
          --text-muted: #8E8D84;
          --btn-primary-bg: #F3F1E9;
          --btn-primary-text: #171815;
          --btn-primary-hover: #E2DFD5;
          --sage: #A3C4AA;
          --sage-soft: #233127;
          --accent: #EFB876;
          --accent-soft: #382C1D;
          --error-border: #E57373;
          --error-bg: #2E1A1A;
          --error-text: #FCA5A5;
          --card-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
        }
        .lamu-auth-page {
          min-height: calc(100svh - 108px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 18px 100px;
          background: var(--bg);
          color: var(--text-main);
          font: 15px/1.65 var(--font-main);
        }
        .lamu-auth-page[data-redirecting="true"] .lamu-auth-card { opacity: .65; }
        .lamu-auth-card {
          width: 100%;
          max-width: 460px;
          padding: 30px;
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: var(--card-radius);
          box-shadow: var(--card-shadow);
        }
        .lamu-auth-cardHeader { text-align: center; margin-bottom: 24px; }
        .lamu-auth-tagline { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 12px; color: var(--text-muted); font-size: 14px; font-weight: 600; }
        .lamu-auth-tagline > span { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
        .lamu-auth-cardHeader h1 { margin: 0 0 6px; font: 700 28px/1.25 var(--font-main); letter-spacing: -.03em; color: var(--text-main); }
        .lamu-auth-cardHeader p { margin: 0; font-size: 14.5px; color: var(--text-sub); }
        .lamu-auth-tabs { display: flex; padding: 4px; margin-bottom: 20px; border: 1px solid var(--border); border-radius: var(--tab-radius); background: var(--surface-subtle); }
        .lamu-auth-theme button { font-family: var(--font-main); cursor: pointer; }
        .lamu-auth-tabs button { flex: 1; min-width: 0; min-height: 42px; padding: 10px 12px; border: 0; border-radius: 7px; background: transparent; color: var(--text-muted); font-size: 14px; font-weight: 600; line-height: 1.5; box-shadow: none; }
        .lamu-auth-tabs button[aria-selected="true"] { background: var(--card-bg); color: var(--text-main); box-shadow: 0 2px 6px rgb(0 0 0 / 4%); }
        .lamu-auth-notices { display: grid; gap: 10px; margin-bottom: 16px; }
        .lamu-auth-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
        .lamu-auth-labelRow { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13.5px; font-weight: 600; }
        .lamu-auth-labelRow label { margin: 0; color: var(--text-main); font: inherit; }
        .lamu-auth-inputWrap { position: relative; display: flex; align-items: center; }
        .lamu-auth-inputWrap input { width: 100%; min-width: 0; height: 48px; min-height: 48px; padding: 0 14px; border: 1px solid var(--border-input); border-radius: var(--input-radius); background: var(--bg); color: var(--text-main); font: 15px var(--font-main); outline: none; box-shadow: none; }
        .lamu-auth-inputWrap input::placeholder { color: var(--text-muted); opacity: 1; }
        .lamu-auth-inputWrap input:focus { border-color: var(--text-main); box-shadow: 0 0 0 3px rgb(34 34 31 / 8%); }
        [data-theme="dark"] .lamu-auth-inputWrap input:focus { box-shadow: 0 0 0 3px rgb(243 241 233 / 12%); }
        .lamu-auth-inputWrap input[aria-invalid="true"] { border-color: var(--error-border); background: var(--error-bg); }
        .lamu-auth-inputWrap .lamu-auth-password { padding-right: 72px; }
        .lamu-auth-theme .lamu-auth-reveal { position: absolute; right: 6px; min-width: 44px; min-height: 40px; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); font-size: 12.5px; font-weight: 600; box-shadow: none; }
        .lamu-auth-theme .lamu-auth-reveal:hover { color: var(--text-main); background: var(--surface-subtle); }
        .lamu-auth-theme .lamu-auth-forgot { background: transparent; border: 0; padding: 0; min-height: 24px; color: var(--text-muted); font-size: 12.5px; font-weight: 500; text-decoration: underline; box-shadow: none; }
        .lamu-auth-theme .lamu-auth-forgot:hover { color: var(--text-main); }
        .lamu-auth-fieldError { margin: 2px 0 0; font-size: 12.5px; color: var(--error-text); }
        .lamu-auth-theme .lamu-auth-submit { width: 100%; height: 48px; margin-top: 8px; padding: 0 16px; border: 0; border-radius: var(--input-radius); background: var(--btn-primary-bg); color: var(--btn-primary-text); display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 600; box-shadow: none; }
        .lamu-auth-theme .lamu-auth-submit:hover:not(:disabled) { background: var(--btn-primary-hover); }
        .lamu-auth-theme button:disabled { opacity: .65; cursor: not-allowed; }
        .lamu-auth-theme button:focus-visible, .lamu-auth-theme a:focus-visible, .lamu-auth-theme summary:focus-visible { outline: 2px solid var(--sage); outline-offset: 3px; }
        .lamu-auth-notice { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-subtle); color: var(--text-sub); font-size: 13.5px; line-height: 1.5; overflow-wrap: anywhere; }
        .lamu-auth-notice > div { min-width: 0; }
        .lamu-auth-notice[data-kind="error"] { border-color: var(--error-border); background: var(--error-bg); color: var(--error-text); }
        .lamu-auth-notice[data-kind="success"] { border-color: var(--sage); background: var(--sage-soft); color: var(--text-main); }
        .lamu-auth-notice[data-kind="warning"] { border-color: var(--accent); background: var(--accent-soft); color: var(--text-main); }
        .lamu-auth-theme .lamu-auth-textButton { padding: 0 4px; border: 0; background: transparent; color: inherit; font-size: 13px; text-decoration: underline; box-shadow: none; }
        .lamu-auth-details { margin-top: 6px; font-size: 11.5px; }
        .lamu-auth-details summary { cursor: pointer; }
        .lamu-auth-spinner { width: 18px; height: 18px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: lamu-auth-spin .8s linear infinite; }
        @keyframes lamu-auth-spin { to { transform: rotate(360deg); } }
        body:has(.lamu-auth-page) { background: var(--bg); }
        @media (max-width: 640px) {
          .lamu-auth-page { min-height: calc(100svh - 130px); padding: 24px 18px 48px; }
        }
        @media (max-width: 480px) {
          .lamu-auth-card { padding: 22px 18px; border-radius: 18px; }
          .lamu-auth-inputWrap input { font-size: 16px; }
        }
        @media (max-width: 360px) {
          .lamu-auth-cardHeader h1 { font-size: 26px; }
          .lamu-auth-tagline { font-size: 12.5px; }
          .lamu-auth-tabs button { padding-inline: 8px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lamu-auth-spinner { animation: none; }
        }
      `}</style>
    </div>
  );
}
