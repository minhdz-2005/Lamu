"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button, Banner, Field, PasswordField, focusField } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { request } from "@/lib/apiClient";
import { sanitizeNext, setCachedProfile, setSession } from "@/lib/auth";
import { ApiException, describeError } from "@/lib/errors";
import { useSession } from "@/lib/useSession";
import type { AuthTokens, MeProfile } from "@/lib/types";

type Mode = "login" | "register";
type FieldName = "email" | "password" | "display_name";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tài khoản seed của mock gateway — xem frontend/README.md. */
const SEED_ACCOUNTS = [
  { role: "Chủ tọa", email: "demo@luma.dev" },
  { role: "Khách", email: "khach@luma.dev" },
  { role: "Diễn giả", email: "speaker@luma.dev" },
];

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

export function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { state } = useSession();

  const target = useMemo(() => sanitizeNext(searchParams.get("next")), [searchParams]);

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
    <div className="auth-shell" style={{ opacity: redirecting ? 0.55 : 1 }}>
      <div className="card auth-card">
        <div className="row" style={{ gap: 10, marginBottom: 18 }}>
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <div>
            <strong>Lamu</strong>
            <p className="muted small" style={{ margin: 0 }}>
              Đặt vé, quản lý vé và mở bán sự kiện.
            </p>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Đăng nhập hoặc đăng ký">
          {(["login", "register"] as Mode[]).map((value) => (
            <button
              key={value}
              role="tab"
              type="button"
              className="tab"
              aria-selected={mode === value}
              data-active={mode === value}
              disabled={locked}
              onClick={() => setMode(value)}
            >
              {value === "login" ? "Đăng nhập" : "Đăng ký mới"}
            </button>
          ))}
        </div>

        {apiError && (
          <Banner kind="error" requestId={apiError.requestId}>
            {apiError.message}
            {canRetry && (
              <Button size="sm" style={{ marginLeft: 10 }} onClick={() => void submit()}>
                Thử lại
              </Button>
            )}
          </Banner>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          noValidate
        >
          <Field
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            requiredMark
            readOnly={locked}
            value={form.email}
            onChange={setValue("email")}
            onBlur={validateOne("email")}
            error={fieldErrors.email}
          />
          <PasswordField
            name="password"
            label="Mật khẩu"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            requiredMark
            readOnly={locked}
            value={form.password}
            onChange={setValue("password")}
            onBlur={validateOne("password")}
            error={fieldErrors.password}
          />
          {mode === "register" && (
            <Field
              name="display_name"
              label="Tên hiển thị"
              autoComplete="name"
              requiredMark
              maxLength={80}
              readOnly={locked}
              value={form.display_name}
              onChange={setValue("display_name")}
              onBlur={validateOne("display_name")}
              error={fieldErrors.display_name}
            />
          )}

          <Button type="submit" variant="primary" block loading={locked} disabled={locked}>
            {redirecting ? "Đang mở..." : submitting ? "Đang kiểm tra..." : "Tiếp tục"}
          </Button>
          {mode === "login" && (
            <p className="muted small" style={{ textAlign: "center", marginBottom: 0 }}>
              Quên mật khẩu? Demo chưa có luồng đặt lại — hãy liên hệ ban tổ chức.
            </p>
          )}
        </form>

        <hr className="hr" />
        <p className="muted tiny" style={{ margin: "0 0 10px" }}>
          Demo local — không gửi email thật. Bấm một tài khoản seed để điền đủ email + mật khẩu (
          <span className="mono">password123</span>).
        </p>
        <div className="chips">
          {SEED_ACCOUNTS.map((seed) => (
            <button
              key={seed.email}
              type="button"
              className="chip"
              onClick={() => {
                setMode("login");
                setFieldErrors({});
                setForm({ email: seed.email, password: "password123", display_name: "" });
                focusField("password");
              }}
            >
              {seed.role} · <span className="mono">{seed.email}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
