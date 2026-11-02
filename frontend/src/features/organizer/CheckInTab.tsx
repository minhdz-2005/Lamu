"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Banner, Button, Field, Select, SkeletonList, focusField } from "@/components/ui";
import { request } from "@/lib/apiClient";
import { ApiException, describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import type { CheckInResult, EventTicketRow, OrganizerEvent, Paged } from "@/lib/types";

const POLL_MS = 15_000;
const PAGE = 50;
const DOUBLE_SUBMIT_MS = 800;

type Result =
  | { kind: "ok"; message: string; note?: string }
  | { kind: "warn"; message: string }
  | { kind: "error"; message: string; requestId?: string };

interface Props {
  events: OrganizerEvent[];
  eventId: string;
  onEventChange: (eventId: string) => void;
}

/** Bàn check-in ở cửa: quét/typing mã -> kết quả -> bảng tự cập nhật (05 §5). */
export function CheckInTab({ events, eventId, onEventChange }: Props) {
  const selectable = events.filter((event) => event.status === "PUBLISHED" || event.status === "CANCELLED");
  const activeId = selectable.some((event) => event.id === eventId) ? eventId : (selectable[0]?.id ?? "");

  const [rows, setRows] = useState<EventTicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [beep, setBeep] = useState(true);

  const lastSubmit = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const rowCount = useRef(0);
  const audio = useRef<AudioContext | null>(null);

  const tone = (ok: boolean) => {
    if (!beep) return;
    try {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      audio.current = audio.current ?? new Ctor();
      const ctx = audio.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    } catch {
      // Chrome chặn audio trước tương tác đầu tiên — không chặn luồng check-in.
    }
  };

  const load = useCallback(
    async (append = false) => {
      if (!activeId) return;
      setError(null);
      try {
        const offset = append ? rowCount.current : 0;
        const [list, usedCount] = await Promise.all([
          request<Paged<EventTicketRow>>(`/events/${activeId}/tickets?limit=${PAGE}&offset=${offset}`),
          request<Paged<EventTicketRow>>(`/events/${activeId}/tickets?status=USED&limit=1`),
        ]);
        rowCount.current = append ? rowCount.current + list.items.length : list.items.length;
        setRows((prev) => (append ? [...prev, ...list.items] : list.items));
        setTotal(list.total);
        setUsed(usedCount.total);
      } catch (err) {
        if (err instanceof ApiException && err.code === "FORBIDDEN") setForbidden(true);
        else setError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [activeId],
  );

  useEffect(() => {
    rowCount.current = 0;
    setRows([]);
    setTotal(0);
    setUsed(0);
    setLoading(true);
    setForbidden(false);
    setResult(null);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, load]);

  const submit = async () => {
    const value = code.trim().toUpperCase();
    if (!value) return;
    const now = Date.now();
    // 05 §5.2: chặn gửi trùng mã trong 800 ms, chỉ giữ kết quả của request đầu.
    if (lastSubmit.current.code === value && now - lastSubmit.current.at < DOUBLE_SUBMIT_MS) return;
    lastSubmit.current = { code: value, at: now };

    const knownType = rows.find((row) => row.code.toUpperCase() === value)?.ticket_type_name;
    setBusy(true);
    try {
      const data = await request<CheckInResult>("/tickets/check-in", { method: "POST", body: { code: value } });
      setResult({
        kind: "ok",
        message: `Hợp lệ · ${data.ticket_type_name || knownType || "loại vé không rõ"} · vào lúc ${formatDateTime(
          data.checked_in_at,
        )}`,
        note:
          data.event_id !== activeId
            ? `Lưu ý: mã này thuộc event ${data.event_title}, khác event đang chọn.`
            : undefined,
      });
      tone(true);
      setCode("");
      await load();
      window.setTimeout(
        () => document.getElementById(`row-${data.ticket_id}`)?.scrollIntoView({ block: "nearest" }),
        50,
      );
    } catch (err) {
      const described = describeError(err);
      if (err instanceof ApiException && err.code === "TICKET_VOIDED") {
        setResult({ kind: "warn", message: described.message });
      } else if (err instanceof ApiException && err.code === "NOT_FOUND") {
        setResult({
          kind: "error",
          message: "Mã vé không tồn tại. Kiểm tra lại phím tắt Tiếng Việt.",
          requestId: described.requestId,
        });
      } else if (err instanceof ApiException && err.code === "FORBIDDEN") {
        setForbidden(true);
        setResult({ kind: "error", message: described.message, requestId: described.requestId });
      } else {
        setResult({ kind: "error", message: described.message, requestId: described.requestId });
      }
      tone(false);
    } finally {
      setBusy(false);
      focusField("code");
    }
  };

  if (selectable.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Chưa có event nào ở trạng thái PUBLISHED hoặc CANCELLED để check-in.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      {forbidden ? (
        <Banner kind="error">Bạn không có quyền check-in event này.</Banner>
      ) : (
        <>
          <div className="spread">
            <Select label="Event" name="checkin-event" value={activeId} onChange={(e) => onEventChange(e.target.value)}>
              {selectable.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} · {event.status}
                </option>
              ))}
            </Select>
            <p style={{ margin: 0 }} aria-live="polite">
              Đã vào: <strong>{used}</strong> / {total}
            </p>
          </div>

          <div className="card">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Field
                    name="code"
                    label="Mã vé"
                    mono
                    autoFocus
                    autoComplete="off"
                    placeholder="LUMA-XXXX-XXXX"
                    value={code}
                    onChange={(value) => {
                      setCode(value.toUpperCase());
                      setResult(null);
                    }}
                  />
                </div>
                <Button variant="primary" type="submit" loading={busy} disabled={busy || !code.trim()}>
                  {busy ? "Đang kiểm tra..." : "Check-in"}
                </Button>
              </div>
              <label className="row small muted" style={{ gap: 6, fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={beep}
                  onChange={(event) => setBeep(event.target.checked)}
                  style={{ width: 16 }}
                />
                Phát tiếng khi có kết quả
              </label>
            </form>

            {result && (
              <div
                className={
                  result.kind === "ok"
                    ? "banner banner-ok"
                    : result.kind === "warn"
                      ? "banner banner-warn"
                      : "banner banner-error"
                }
                role="status"
              >
                {result.message}
                {result.kind === "ok" && result.note && <div className="small">{result.note}</div>}
                {result.kind === "error" && result.requestId && <span className="request-id mono">{result.requestId}</span>}
              </div>
            )}
          </div>

          {error && (
            <Banner kind="error" requestId={error.requestId}>
              {error.message}{" "}
              <Button size="sm" onClick={() => void load()}>
                Thử lại
              </Button>
            </Banner>
          )}

          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            {loading ? (
              <div style={{ padding: 16 }}>
                <SkeletonList count={5} height={30} />
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 16 }}>
                <p className="muted" style={{ margin: 0 }}>
                  Event này chưa có vé nào — chưa thêm loại vé hoặc chưa ai giữ chỗ.
                </p>
              </div>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Mã vé</th>
                      <th scope="col">Loại vé</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Giờ vào</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.ticket_id} id={`row-${row.ticket_id}`}>
                        <td className="mono">{row.code}</td>
                        <td>{row.ticket_type_name}</td>
                        <td>
                          {row.status === "USED" ? (
                            <Badge tone="muted">USED · đã vào</Badge>
                          ) : row.status === "VOIDED" ? (
                            <Badge tone="danger">VOIDED · vé hủy</Badge>
                          ) : (
                            <Badge tone="success">ISSUED · chưa vào</Badge>
                          )}
                        </td>
                        <td className="nowrap">{row.checked_in_at ? formatDateTime(row.checked_in_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length < total && (
                  <div style={{ padding: 12 }}>
                    <Button size="sm" onClick={() => void load(true)}>
                      Xem tiếp ({rows.length}/{total})
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
