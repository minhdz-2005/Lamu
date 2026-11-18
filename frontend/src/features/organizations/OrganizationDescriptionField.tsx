"use client";

import { descriptionLimit } from "@/lib/organizationProfile";

export function OrganizationDescriptionField({
  id,
  value,
  onChange,
  error,
  readOnly,
  disabled,
  autoFocus,
  optional,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  readOnly?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <label htmlFor={id}>
        Mô tả tổ chức{optional ? " (không bắt buộc)" : ""}
      </label>
      <textarea
        id={id}
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-count ${id}-error` : `${id}-count`}
        style={{ width: "100%" }}
      />
      <small id={`${id}-count`} className="muted">
        {Array.from(value.trim()).length} /{" "}
        {descriptionLimit.toLocaleString("vi")}
      </small>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          style={{ color: "var(--danger)", margin: 0 }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
