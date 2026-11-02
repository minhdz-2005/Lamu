"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Badge, Banner, Button, EventStatusBadge, Field, Select, SkeletonList, cx, focusField } from "@/components/ui";
import { request } from "@/lib/apiClient";
import { copyText } from "@/lib/clipboard";
import { ApiException, describeError } from "@/lib/errors";
import { formatDateTime, isValidSlug, slugify, toInputValue, toRfc3339 } from "@/lib/format";
import type { AvailabilityItem, OrganizerEvent, Paged } from "@/lib/types";
import type { Right } from "./rights";

const TIMEZONE_OPTIONS = ["Asia/Ho_Chi_Minh", "UTC"];

interface Props {
  orgId: string;
  events: OrganizerEvent[];
  loading: boolean;
  error: { message: string; requestId?: string } | null;
  onRetry: () => void;
  rights: Set<Right>;
  status: string;
  onStatusChange: (status: string) => void;
  onCreated: (eventId: string) => void;
  onOpenSell: (eventId: string) => void;
  onChanged: () => void;
}

interface DraftForm {
  title: string;
  slug: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_name: string;
  venue_address: string;
}

function defaultDraft(): DraftForm {
  const start = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  return {
    title: "",
    slug: "",
    description: "",
    starts_at: toInputValue(start.toISOString()),
    ends_at: toInputValue(end.toISOString()),
    timezone: TIMEZONE_OPTIONS[0],
    venue_name: "",
    venue_address: "",
  };
}

export function EventsTab({
  orgId,
  events,
  loading,
  error,
  onRetry,
  rights,
  status,
  onStatusChange,
  onCreated,
  onOpenSell,
  onChanged,
}: Props) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<OrganizerEvent | null>(null);
  const [canceling, setCanceling] = useState<OrganizerEvent | null>(null);

  const rows = [...events]
    .filter((event) => !status || event.status === status)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return (
    <div className="stack">
      <div className="spread">
        <Select
          label="Trạng thái"
          name="status"
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <option value="">Tất cả</option>
          <option value="DRAFT">DRAFT</option>
          <option value="PUBLISHED">PUBLISHED</option>
          <option value="CANCELLED">CANCELLED</option>
        </Select>
        <div style={{ marginLeft: "auto" }}>
          <Button
            variant="primary"
            disabled={!rights.has("event.create")}
            title={rights.has("event.create") ? undefined : "Bạn cần quyền tạo event."}
            onClick={() => setCreating(true)}
          >
            + Tạo event
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error.message} requestId={error.requestId} onRetry={onRetry} />}

      {loading ? (
        <div className="stack">
          <SkeletonList count={4} height={44} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="stack" style={{ textAlign: "center" }}>
            <p className="muted" style={{ margin: 0 }}>
              {events.length === 0 ? "Chưa có event." : "Không có event nào khớp bộ lọc trạng thái."}
            </p>
            {events.length === 0 && rights.has("event.create") && (
              <div>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Tạo event đầu tiên
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Slug</th>
                <th scope="col">Status</th>
                <th scope="col">Bắt đầu</th>
                <th scope="col">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={event.id}>
                  <td>
                    {event.status === "PUBLISHED" ? (
                      <a href={`/events/${event.slug}`}>{event.title}</a>
                    ) : (
                      <span>{event.title}</span>
                    )}
                  </td>
                  <td className="mono small muted">{event.slug}</td>
                  <td>
                    <EventStatusBadge status={event.status} />
                  </td>
                  <td className="nowrap">{formatDateTime(event.starts_at)}</td>
                  <td>
                    <div className="row nowrap" style={{ gap: 6 }}>
                      {event.status === "DRAFT" && rights.has("event.publish") && (
                        <Button size="sm" onClick={() => setPublishing(event)}>
                          Publish
                        </Button>
                      )}
                      {event.status === "PUBLISHED" && rights.has("event.update") && (
                        <Button size="sm" onClick={() => onOpenSell(event.id)}>
                          Bán vé
                        </Button>
                      )}
                      {event.status !== "CANCELLED" && rights.has("event.cancel") && (
                        <Button size="sm" variant="danger" onClick={() => setCanceling(event)}>
                          Hủy
                        </Button>
                      )}
                      {event.status === "CANCELLED" && <span className="muted">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateEventModal
          orgId={orgId}
          onClose={() => setCreating(false)}
          onCreated={(eventId) => {
            setCreating(false);
            onChanged();
            onCreated(eventId);
          }}
        />
      )}
      {publishing && (
        <PublishDialog
          event={publishing}
          onClose={() => setPublishing(null)}
          onRefresh={onChanged}
          onDone={() => {
            setPublishing(null);
            onChanged();
          }}
          toast={toast}
        />
      )}
      {canceling && (
        <CancelDialog
          event={canceling}
          onClose={() => setCanceling(null)}
          onDone={() => {
            setCanceling(null);
            onChanged();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

function ErrorBanner({ message, requestId, onRetry }: { message: string; requestId?: string; onRetry: () => void }) {
  return (
    <Banner kind="error" requestId={requestId}>
      {message}{" "}
      <Button size="sm" onClick={onRetry}>
        Thử lại
      </Button>
    </Banner>
  );
}

function CreateEventModal({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: string;
  onClose: () => void;
  onCreated: (eventId: string) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<DraftForm>(defaultDraft);
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof DraftForm, string>>>({});
  const [failure, setFailure] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof DraftForm) => (value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "title" && !slugEdited) next.slug = slugify(value);
      return next;
    });
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const validate = (): Partial<Record<keyof DraftForm, string>> => {
    const found: Partial<Record<keyof DraftForm, string>> = {};
    if (!form.title.trim()) found.title = "Trường này không được để trống.";
    else if (form.title.length > 120) found.title = "Tiêu đề tối đa 120 ký tự.";
    if (!form.slug) found.slug = "Trường này không được để trống.";
    else if (!isValidSlug(form.slug)) found.slug = "Slug chỉ dùng a-z, 0-9, dấu `-`, dài 3–60 ký tự.";
    if (!form.description.trim()) found.description = "Trường này không được để trống.";
    else if (form.description.length > 2000) found.description = "Mô tả tối đa 2000 ký tự.";
    if (!form.starts_at) found.starts_at = "Trường này không được để trống.";
    else if (new Date(form.starts_at).getTime() > Date.now() + 730 * 24 * 3600 * 1000)
      found.starts_at = "Không đặt event quá 2 năm sau.";
    if (!form.ends_at) found.ends_at = "Trường này không được để trống.";
    else if (form.starts_at && new Date(form.ends_at).getTime() <= new Date(form.starts_at).getTime())
      found.ends_at = "ends_at phải sau starts_at.";
    return found;
  };

  const submit = async () => {
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      focusField(Object.keys(found)[0]);
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const created = await request<{ event_id: string; version: number }>("/events", {
        method: "POST",
        body: {
          organization_id: orgId,
          title: form.title.trim(),
          slug: form.slug,
          description: form.description.trim(),
          starts_at: toRfc3339(form.starts_at),
          ends_at: toRfc3339(form.ends_at),
          timezone: form.timezone,
          venue:
            form.venue_name.trim() || form.venue_address.trim()
              ? { name: form.venue_name.trim(), address: form.venue_address.trim() }
              : {},
        },
      });
      toast.push("Đã tạo bản nháp.", "success");
      onCreated(created.event_id);
    } catch (err) {
      setFailure(describeError(err));
      if (err instanceof ApiException && err.code === "SLUG_TAKEN") focusField("slug");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Tạo event"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {busy ? "Đang lưu..." : "Tạo bản nháp"}
          </Button>
        </>
      }
    >
      {failure && <ErrorBanner message={failure.message} requestId={failure.requestId} onRetry={() => void submit()} />}
      <Field
        name="title"
        label="Tiêu đề"
        requiredMark
        maxLength={120}
        value={form.title}
        onChange={set("title")}
        error={errors.title}
      />
      <Field
        name="slug"
        label="Slug"
        requiredMark
        mono
        value={form.slug}
        onChange={(value) => {
          setSlugEdited(true);
          set("slug")(value.toLowerCase());
        }}
        error={errors.slug}
        hint="Đường dẫn công khai: /events/<slug>"
      />
      <div className="field">
        <label htmlFor="description">Mô tả *</label>
        <textarea
          id="description"
          value={form.description}
          maxLength={2000}
          onChange={(event) => set("description")(event.target.value)}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? "description-error" : undefined}
          className={cx(errors.description && "input-invalid")}
        />
        <div className="spread">
          {errors.description ? (
            <p className="field-error" id="description-error">
              {errors.description}
            </p>
          ) : (
            <span />
          )}
          <span className="muted small">{form.description.length}/2000</span>
        </div>
      </div>
      <div className="row">
        <Field
          name="starts_at"
          label="Bắt đầu"
          type="datetime-local"
          requiredMark
          value={form.starts_at}
          onChange={set("starts_at")}
          error={errors.starts_at}
        />
        <Field
          name="ends_at"
          label="Kết thúc"
          type="datetime-local"
          requiredMark
          value={form.ends_at}
          onChange={set("ends_at")}
          error={errors.ends_at}
        />
      </div>
      <Select label="Múi giờ" name="timezone" value={form.timezone} onChange={(event) => set("timezone")(event.target.value)}>
        {TIMEZONE_OPTIONS.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </Select>
      <div className="row">
        <Field name="venue_name" label="Địa điểm (tên)" value={form.venue_name} onChange={set("venue_name")} />
        <Field name="venue_address" label="Địa chỉ" value={form.venue_address} onChange={set("venue_address")} />
      </div>
    </Modal>
  );
}

function PublishDialog({
  event,
  onClose,
  onDone,
  onRefresh,
  toast,
}: {
  event: OrganizerEvent;
  onClose: () => void;
  onDone: () => void;
  onRefresh: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [noTicketType, setNoTicketType] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; requestId?: string } | null>(null);
  const [published, setPublished] = useState(false);

  // 05 §3.3 bước 2: kiểm tra kho vé trước, chỉ cảnh báo, API không chặn publish.
  useEffect(() => {
    request<Paged<AvailabilityItem>>(`/events/${event.id}/availability`)
      .then((data) => setNoTicketType(data.items.length === 0))
      .catch(() => setNoTicketType(true));
  }, [event.id]);

  const submit = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await request(`/events/${event.id}/publish`, { method: "POST" });
      setPublished(true);
      onRefresh();
      toast.push("Đã publish sự kiện.", "success");
    } catch (err) {
      setFailure(describeError(err));
      if (err instanceof ApiException && err.code === "CONFLICT") onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Publish ${event.title}`}
      onClose={onClose}
      footer={
        published ? (
          <>
            <Button
              onClick={() => {
                void copyText(`${window.location.origin}/events/${event.slug}`).then((ok) =>
                  toast.push(ok ? "Đã chép link công khai." : "Không chép được link.", ok ? "success" : "error"),
                );
              }}
            >
              Copy link công khai
            </Button>
            <Button variant="primary" onClick={onDone}>
              Xong
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Không</Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              {busy ? "Đang publish..." : "Publish"}
            </Button>
          </>
        )
      }
    >
      {published ? (
        <div className="stack">
          <Banner kind="ok">
            Sự kiện đã công khai tại <span className="mono">/events/{event.slug}</span>.
          </Banner>
          <p className="muted small" style={{ margin: 0 }}>
            Trang công khai có thể chậm vài giây vì <span className="mono">event_snapshot</span> phía Registration
            còn đợi message.
          </p>
        </div>
      ) : (
        <div className="stack">
          <p>Public event sẽ hiển thị cho mọi người và bắt đầu nhận giữ chỗ.</p>
          {noTicketType && (
            <Banner kind="warn">
              Chưa có loại vé. Khách vào sẽ thấy Hết vé cho tới khi bạn thêm vé.
            </Banner>
          )}
          {failure && <ErrorBanner message={failure.message} requestId={failure.requestId} onRetry={() => void submit()} />}
        </div>
      )}
    </Modal>
  );
}

function CancelDialog({
  event,
  onClose,
  onDone,
  toast,
}: {
  event: OrganizerEvent;
  onClose: () => void;
  onDone: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) {
      setError("Trường này không được để trống.");
      focusField("reason");
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const result = await request<{ status: string; released?: number; voided?: number; refunded?: number }>(
        `/events/${event.id}/cancel`,
        { method: "POST", body: { reason: reason.trim() } },
      );
      toast.push(`Đã hủy event (${result.status}).`, "success");
      onDone();
    } catch (err) {
      setFailure(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Hủy ${event.title}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Quay lại</Button>
          <Button variant="danger" loading={busy} onClick={() => void submit()}>
            {busy ? "Đang hủy..." : "Hủy event"}
          </Button>
        </>
      }
    >
      <ol className="list-plain" style={{ marginBottom: 14 }}>
        <li>Khách đã giữ chỗ sẽ mất chỗ, vé đã bán thành VOIDED.</li>
        <li>Payment sẽ tự hoàn 100% các giao dịch SUCCESS.</li>
        <li>Notification gửi email &quot;BookingCancelled&quot; tới từng người có vé.</li>
      </ol>
      <div className="field">
        <label htmlFor="reason">Lý do hủy *</label>
        <textarea
          id="reason"
          value={reason}
          maxLength={300}
          onChange={(event) => {
            setReason(event.target.value);
            setError(undefined);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "reason-error" : undefined}
          className={cx(error && "input-invalid")}
        />
        <div className="spread">
          {error ? (
            <p className="field-error" id="reason-error">
              {error}
            </p>
          ) : (
            <span />
          )}
          <span className="muted small">{reason.length}/300</span>
        </div>
      </div>
      {failure && <ErrorBanner message={failure.message} requestId={failure.requestId} onRetry={() => void submit()} />}
      <Badge tone="warn">Hành động này không hoàn tác được</Badge>
    </Modal>
  );
}
