"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/Toast";
import { Badge, Banner, Button, Field, Select, Skeleton, focusField } from "@/components/ui";
import { request } from "@/lib/apiClient";
import { ApiException, describeError } from "@/lib/errors";
import { formatDateTime, formatMoney, toDecimal, toInputValue, toRfc3339 } from "@/lib/format";
import type { AvailabilityItem, OrganizerEvent, Paged } from "@/lib/types";
import type { Right } from "./rights";

interface Props {
  events: OrganizerEvent[];
  eventId: string;
  onEventChange: (eventId: string) => void;
  rights: Set<Right>;
  onGoToEvents: () => void;
}

interface TicketTypeForm {
  name: string;
  price: string;
  capacity: string;
  sales_start: string;
  sales_end: string;
}

export function SellTab({ events, eventId, onEventChange, rights, onGoToEvents }: Props) {
  const toast = useToast();
  const event = events.find((item) => item.id === eventId) ?? null;

  const [rows, setRows] = useState<AvailabilityItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [notPublished, setNotPublished] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const [form, setForm] = useState<TicketTypeForm>({ name: "", price: "", capacity: "50", sales_start: "", sales_end: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof TicketTypeForm, string>>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seededFor = useRef("");

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    setNotPublished(false);
    try {
      const data = await request<Paged<AvailabilityItem>>(`/events/${eventId}/availability`);
      setRows(data.items);
    } catch (err) {
      setRows(null);
      if (err instanceof ApiException && err.code === "CONFLICT") setNotPublished(true);
      else setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 05 §4.2: mặc định mở bán từ bây giờ tới lúc event bắt đầu.
  useEffect(() => {
    if (!event || seededFor.current === event.id) return;
    seededFor.current = event.id;
    setForm((prev) => ({
      ...prev,
      sales_start: toInputValue(new Date().toISOString()),
      sales_end: event.starts_at ? toInputValue(event.starts_at) : prev.sales_end,
    }));
  }, [event]);

  const set = (key: keyof TicketTypeForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const validate = (): Partial<Record<keyof TicketTypeForm, string>> => {
    const found: Partial<Record<keyof TicketTypeForm, string>> = {};
    if (!form.name.trim()) found.name = "Trường này không được để trống.";
    else if (form.name.length > 60) found.name = "Tên loại vé tối đa 60 ký tự.";
    const capacity = Number(form.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) found.capacity = "Capacity là số nguyên 1–100000.";
    if (form.price && !/^\d+$/.test(form.price)) found.price = "Giá là số nguyên VND, để trống nếu miễn phí.";
    if (!form.sales_start) found.sales_start = "Trường này không được để trống.";
    if (!form.sales_end) found.sales_end = "Trường này không được để trống.";
    else if (form.sales_start && new Date(form.sales_end) <= new Date(form.sales_start))
      found.sales_end = "sales_end phải sau sales_start.";
    return found;
  };

  const submit = async () => {
    if (!event) return;
    const found = validate();
    if (Object.keys(found).length > 0) {
      setFieldErrors(found);
      focusField(`tt-${Object.keys(found)[0]}`);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await request(`/events/${event.id}/ticket-types`, {
        method: "POST",
        body: {
          name: form.name.trim(),
          price: toDecimal(form.price || "0"),
          currency: "VND",
          capacity: Number(form.capacity),
          sales_start: toRfc3339(form.sales_start),
          sales_end: toRfc3339(form.sales_end),
        },
      });
      toast.push("Đã thêm loại vé.", "success");
      setForm((prev) => ({ ...prev, name: "", price: "" }));
      await load();
      focusField("tt-name");
    } catch (err) {
      setFormError(describeError(err));
      if (err instanceof ApiException && err.code === "CONFLICT") await load();
    } finally {
      setBusy(false);
    }
  };

  if (events.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Tổ chức chưa có event nào. Tạo event ở tab Sự kiện trước.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="spread">
        <Select label="Event" name="sell-event" value={eventId} onChange={(e) => onEventChange(e.target.value)}>
          {events.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {item.status}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={() => void load()}>
          Tải lại
        </Button>
      </div>

      {error && (
        <Banner kind="error" requestId={error.requestId}>
          {error.message}{" "}
          <Button size="sm" onClick={() => void load()}>
            Thử lại
          </Button>
        </Banner>
      )}

      {notPublished && (
        <div className="card stack">
          <Banner kind="warn">Publish event trước khi mở bán.</Banner>
          <div>
            <Button onClick={onGoToEvents}>Về tab Sự kiện</Button>
          </div>
        </div>
      )}

      {!notPublished && !error && (loading || rows === null) && <Skeleton height={160} />}

      {!notPublished && !error && rows && rows.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Chưa có loại vé. Thêm loại vé đầu tiên bên dưới — khách sẽ thấy Hết vé cho tới khi có loại vé.
          </p>
        </div>
      )}

      {!notPublished && !error && rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Loại vé</th>
                <th scope="col">Giá</th>
                <th scope="col">Capacity</th>
                <th scope="col">Đã bán / đang giữ</th>
                <th scope="col">Còn lại</th>
                <th scope="col">Cửa bán</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ticket_type_id}>
                  <td>{row.name}</td>
                  <td>
                    {formatMoney(row.price, row.currency)}
                    {Number(row.price) === 0 && (
                      <Badge tone="success" title="Miễn phí: khách nhận vé ngay khi giữ chỗ, không qua thanh toán">
                        {" "}
                        không qua thanh toán
                      </Badge>
                    )}
                  </td>
                  <td>{row.capacity}</td>
                  <td>
                    {row.sold} / {row.reserved}
                  </td>
                  <td style={{ color: row.available <= 10 ? "var(--danger)" : undefined, fontWeight: 600 }}>
                    {row.available}
                  </td>
                  <td className="small muted">{formatDateTime(row.sales_start)} → {formatDateTime(row.sales_end)}</td>
                  <td>
                    {row.sales_open ? <Badge tone="success">Đang mở</Badge> : <Badge tone="warn">Chưa mở/đã đóng</Badge>}{" "}
                    <Badge tone="muted">{row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Thêm loại vé</h2>
        {!rights.has("event.update") && (
          <Banner kind="warn">Bạn không có quyền thêm loại vé cho event này.</Banner>
        )}
        {formError && (
          <Banner kind="error" requestId={formError.requestId}>
            {formError.message}
          </Banner>
        )}
        <div className="row">
          <Field
            name="tt-name"
            label="Tên loại vé"
            requiredMark
            maxLength={60}
            value={form.name}
            onChange={set("name")}
            error={fieldErrors.name}
            disabled={!rights.has("event.update")}
          />
          <Field
            name="tt-price"
            label="Giá (VND)"
            inputMode="numeric"
            value={form.price}
            onChange={set("price")}
            error={fieldErrors.price}
            hint="Để trống hoặc 0 = miễn phí"
            disabled={!rights.has("event.update")}
          />
          <Field
            name="tt-capacity"
            label="Capacity"
            requiredMark
            inputMode="numeric"
            value={form.capacity}
            onChange={set("capacity")}
            error={fieldErrors.capacity}
            disabled={!rights.has("event.update")}
          />
        </div>
        <div className="row">
          <Field
            name="tt-sales_start"
            label="Mở bán từ"
            type="datetime-local"
            requiredMark
            value={form.sales_start}
            onChange={set("sales_start")}
            error={fieldErrors.sales_start}
            disabled={!rights.has("event.update")}
          />
          <Field
            name="tt-sales_end"
            label="Đóng bán"
            type="datetime-local"
            requiredMark
            value={form.sales_end}
            onChange={set("sales_end")}
            error={fieldErrors.sales_end}
            disabled={!rights.has("event.update")}
          />
        </div>
        <Button
          variant="primary"
          loading={busy}
          disabled={!rights.has("event.update") || !event || event.status !== "PUBLISHED"}
          onClick={() => void submit()}
        >
          {busy ? "Đang lưu..." : "+ Thêm loại vé"}
        </Button>
        {event && event.status !== "PUBLISHED" && (
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            Nút mở khóa sau khi event ở trạng thái PUBLISHED.
          </p>
        )}
      </div>
    </div>
  );
}
