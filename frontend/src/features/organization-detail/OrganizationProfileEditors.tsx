"use client";

import { useEffect, useRef, useState } from "react";
import { Button, focusField } from "@/components/ui";
import { OrganizationCoverImage } from "@/features/organizations/OrganizationCoverImage";
import { OrganizationDescriptionField } from "@/features/organizations/OrganizationDescriptionField";
import { avatarFormats as imageFormats } from "@/lib/avatar";
import { ApiException, formatIdentityError } from "@/lib/errors";
import {
  descriptionError,
  maxCoverBytes,
  validOrganizationDescription,
} from "@/lib/organizationProfile";

const controls = { gap: 8, flexWrap: "wrap" } as const;

export function EditOrganizationDescription({
  description,
  save,
}: {
  description: string | null;
  save: (description: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState("");
  function close() {
    setDraft(undefined);
    setError(undefined);
    requestAnimationFrame(() =>
      focusField("edit-organization-description-trigger"),
    );
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      {draft === undefined ? (
        <div>
          <Button
            id="edit-organization-description-trigger"
            onClick={() => {
              setMessage("");
              setDraft(description ?? "");
            }}
          >
            Sửa mô tả
          </Button>
        </div>
      ) : (
        <form
          className="stack"
          style={{ gap: 12 }}
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const normalized = draft.trim() || null;
            if (!validOrganizationDescription(normalized)) {
              setError(descriptionError);
              focusField("edit-organization-description");
              return;
            }
            setBusy(true);
            setError(undefined);
            try {
              await save(normalized);
              close();
              setMessage("Đã lưu mô tả.");
            } catch (failure) {
              setError(formatIdentityError(failure));
            } finally {
              setBusy(false);
            }
          }}
        >
          <OrganizationDescriptionField
            id="edit-organization-description"
            autoFocus
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setError(undefined);
            }}
            error={error}
            readOnly={busy}
          />
          <div className="row" style={controls}>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu mô tả"}
            </Button>
            <Button onClick={close} disabled={busy}>
              Hủy
            </Button>
          </div>
        </form>
      )}
      {message && (
        <p role="status" style={{ margin: 0 }}>
          {message}
        </p>
      )}
    </div>
  );
}

export function EditOrganizationCover({
  save,
}: {
  save: (
    file: File,
    onStage: (stage: "upload" | "commit") => void,
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<{ file: File; url: string }>();
  const [stage, setStage] = useState<"upload" | "commit">();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) picker.current?.focus();
  }, [open]);
  useEffect(() => {
    const url = selection?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [selection]);

  function close() {
    setOpen(false);
    setSelection(undefined);
    setError("");
    requestAnimationFrame(() => focusField("edit-organization-cover-trigger"));
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {!open ? (
        <div>
          <Button
            id="edit-organization-cover-trigger"
            onClick={() => {
              setMessage("");
              setOpen(true);
            }}
          >
            Cập nhật ảnh bìa
          </Button>
        </div>
      ) : (
        <form
          className="stack"
          style={{ gap: 12 }}
          aria-busy={Boolean(stage)}
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selection || stage) return;
            setError("");
            setStage("upload");
            let saving = false;
            try {
              await save(selection.file, (next) => {
                saving = next === "commit";
                setStage(next);
              });
              close();
              setMessage("Đã cập nhật ảnh bìa.");
            } catch (failure) {
              if (
                failure instanceof ApiException &&
                failure.code === "REVISION_CONFLICT"
              )
                setError(
                  "Ảnh bìa đã thay đổi. Kiểm tra ảnh hiện tại rồi thử lại.",
                );
              else if (
                failure instanceof ApiException &&
                failure.code === "INTENT_CONFLICT"
              )
                setError(
                  "Lượt tải ảnh đã hết hạn hoặc thiếu tệp. Bấm lưu để bắt đầu lượt tải mới.",
                );
              else
                setError(
                  failure instanceof ApiException
                    ? `${saving ? "Không lưu được ảnh bìa" : "Không xin được lượt tải ảnh"} · ${formatIdentityError(failure)}`
                    : failure instanceof Error
                      ? failure.message
                      : "Không cập nhật được ảnh bìa.",
                );
            } finally {
              setStage(undefined);
            }
          }}
        >
          <label htmlFor="organization-cover-file">Chọn tệp ảnh bìa</label>
          <input
            id="organization-cover-file"
            ref={picker}
            type="file"
            accept={imageFormats.join(",")}
            disabled={Boolean(stage)}
            aria-describedby="organization-cover-hint"
            style={{ width: "100%", minWidth: 0 }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setError("");
              setSelection(undefined);
              if (!file) return;
              if (
                !imageFormats.includes(file.type) ||
                file.size === 0 ||
                file.size > maxCoverBytes
              ) {
                setError(
                  "Tệp ảnh không hợp lệ. Hãy chọn JPG, PNG hoặc WebP trong giới hạn dung lượng.",
                );
                event.target.value = "";
                return;
              }
              setSelection({ file, url: URL.createObjectURL(file) });
            }}
          />
          <small id="organization-cover-hint" className="muted">
            JPG, PNG hoặc WebP · Tối đa{" "}
            {(maxCoverBytes / 1048576).toLocaleString("vi", {
              maximumSignificantDigits: 4,
            })}{" "}
            MiB
          </small>
          {selection && <OrganizationCoverImage url={selection.url} preview />}
          <div className="row" style={controls}>
            <Button
              type="submit"
              variant="primary"
              disabled={!selection || Boolean(stage)}
            >
              Lưu ảnh bìa
            </Button>
            <Button onClick={close} disabled={Boolean(stage)}>
              Hủy
            </Button>
          </div>
        </form>
      )}
      {stage && (
        <p role="status" style={{ margin: 0 }}>
          {stage === "upload" ? "Đang tải ảnh bìa…" : "Đang lưu ảnh bìa…"}
        </p>
      )}
      {message && (
        <p role="status" style={{ margin: 0 }}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
