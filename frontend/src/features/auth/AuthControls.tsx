"use client";

import { useState, type InputHTMLAttributes, type ReactNode, type KeyboardEvent } from "react";
import { authContent as copy } from "./content";

interface AuthFieldProps extends Readonly<Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur">> {
  readonly name: string;
  readonly label: string;
  readonly error?: string;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
  readonly action?: ReactNode;
}

export function AuthField({ label, error, onChange, onBlur, action, type, ...input }: AuthFieldProps) {
  const [reveal, setReveal] = useState(false);
  const password = type === "password";
  return (
    <div className="lamu-auth-field">
      <div className="lamu-auth-labelRow">
        <label htmlFor={input.name}>{label}</label>
        {action}
      </div>
      <div className="lamu-auth-inputWrap">
        <input {...input} id={input.name} type={password && reveal ? "text" : type}
          className={password ? "lamu-auth-password" : undefined}
          aria-required="true" aria-invalid={error ? true : undefined} aria-describedby={error ? `${input.name}-error` : undefined}
          onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
        {password && <button type="button" className="lamu-auth-reveal" aria-pressed={reveal}
          aria-label={`${reveal ? copy.hide : copy.show} ${copy.password.toLowerCase()}`}
          onClick={() => setReveal((value) => !value)}>{reveal ? copy.hide : copy.show}</button>}
      </div>
      {error && <p className="lamu-auth-fieldError" id={`${input.name}-error`} role="alert"><span aria-hidden="true">ⓘ</span> {error}</p>}
    </div>
  );
}

interface AuthTabsProps {
  readonly mode: "login" | "register";
  readonly locked: boolean;
  readonly onChange: (mode: "login" | "register") => void;
}

export function AuthTabs({ mode, locked, onChange }: AuthTabsProps) {
  const navigate = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "login" : event.key === "End" ? "register" : mode === "login" ? "register" : "login";
    onChange(next);
    document.getElementById(`auth-tab-${next}`)?.focus();
  };
  return <div className="lamu-auth-tabs" role="tablist" aria-label={`${copy.login} / ${copy.register}`}>
    {(["login", "register"] as const).map((value) => <button key={value} type="button" role="tab"
      id={`auth-tab-${value}`} aria-controls="auth-panel" aria-selected={mode === value}
      tabIndex={mode === value ? 0 : -1} disabled={locked} onKeyDown={navigate}
      onClick={() => onChange(value)}>{copy[value]}</button>)}
  </div>;
}

interface AuthNoticeProps {
  readonly kind: "error" | "info" | "success" | "warning";
  readonly children: ReactNode;
  readonly requestId?: string;
}

export function AuthNotice({ kind, children, requestId }: AuthNoticeProps) {
  return <div className="lamu-auth-notice" data-kind={kind} role={kind === "error" ? "alert" : "status"}>
    <span aria-hidden="true">{kind === "success" ? "✓" : "ⓘ"}</span>
    <div>{children}{requestId && <details className="lamu-auth-details"><summary>{copy.details}</summary><code>{requestId}</code></details>}</div>
  </div>;
}
