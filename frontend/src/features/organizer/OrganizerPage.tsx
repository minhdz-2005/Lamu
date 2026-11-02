"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Banner, Button, ErrorState, Field, Select, Skeleton, Tabs, focusField } from "@/components/ui";
import { request } from "@/lib/apiClient";
import { ApiException, describeError } from "@/lib/errors";
import { isValidSlug, slugify } from "@/lib/format";
import { useSession } from "@/lib/useSession";
import type { OrganizerEvent, Paged } from "@/lib/types";
import { CheckInTab } from "./CheckInTab";
import { EventsTab } from "./EventsTab";
import { SellTab } from "./SellTab";
import { rightsOf, type Right } from "./rights";

/** Lựa chọn tổ chức chỉ sống trong tab này (05 §1). */
const ORG_KEY = "luma.org";
const TABS = ["events", "sell", "checkin"] as const;
type TabValue = (typeof TABS)[number];

export function OrganizerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { state, profile, organizations, reload } = useSession();

  const [orgId, setOrgId] = useState("");
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<{ message: string; requestId?: string } | null>(null);
  const [creatingOrg, setCreatingOrg] = useState(false);

  const requestedTab = searchParams.get("tab");
  const tab: TabValue = (TABS as readonly string[]).includes(requestedTab ?? "")
    ? (requestedTab as TabValue)
    : "events";
  const status = searchParams.get("status") ?? "";
  const eventParam = searchParams.get("event") ?? "";

  const write = (next: Partial<{ tab: TabValue; status: string; event: string }>) => {
    const merged = { tab, status, event: eventParam, ...next };
    const params = new URLSearchParams();
    params.set("tab", merged.tab);
    if (merged.status) params.set("status", merged.status);
    if (merged.event) params.set("event", merged.event);
    router.replace(`/organizer?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (state === "ANONYMOUS") {
      // 00 §8: /organizer cần đăng nhập.
      window.location.assign("/auth?next=/organizer");
      return;
    }
    if (organizations.length === 0) {
      setOrgId("");
      return;
    }
    const stored = window.sessionStorage.getItem(ORG_KEY);
    const fromUrl = searchParams.get("org");
    const pick =
      organizations.find((item) => item.organization_id === fromUrl) ??
      organizations.find((item) => item.organization_id === stored) ??
      organizations[0];
    setOrgId(pick.organization_id);
  }, [state, organizations, searchParams]);

  const loadEvents = useCallback(async () => {
    if (!orgId) return;
    setLoadingEvents(true);
    setEventsError(null);
    try {
      // 05 §3.1: API có nhận ?status= nhưng UI lọc client-side để tab Bán vé/Check-in
      // nhìn thấy cả event DRAFT từ cùng một nguồn dữ liệu.
      const data = await request<Paged<OrganizerEvent>>(`/organizations/${orgId}/events`);
      setEvents(data.items);
    } catch (err) {
      setEventsError(describeError(err));
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  if (state === "UNKNOWN") {
    return (
      <div className="stack">
        <Skeleton height={40} />
        <Skeleton height={260} />
      </div>
    );
  }

  if (state === "ANONYMOUS") return null;

  if (organizations.length === 0) {
    return (
      <div className="stack organizer-page">
      <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>Bàn tổ chức</h1>
            <p className="page-sub">Bạn chưa thuộc tổ chức nào nên chưa có kho vé để bán.</p>
          </div>
        </div>
        <div className="card">
          <Banner kind="warn">Bạn chưa là thành viên tổ chức nào. Tạo tổ chức để bắt đầu.</Banner>
          <CreateOrgForm
            onDone={async (id) => {
              window.sessionStorage.setItem(ORG_KEY, id);
              await reload();
              toast.push("Đã tạo tổ chức.", "success");
            }}
          />
        </div>
      </div>
    );
  }

  const membership = organizations.find((item) => item.organization_id === orgId) ?? organizations[0];
  const rights = rightsOf(membership.roles);
  const canCheckIn = rights.has("ticket.checkin");
  const activeEventId = events.some((event) => event.id === eventParam) ? eventParam : (events[0]?.id ?? "");

  const tabItems = [
    { value: "events", label: "Sự kiện của tôi" },
    { value: "sell", label: "Bán vé", disabled: !rights.has("event.update") },
    ...(canCheckIn ? [{ value: "checkin", label: "Check-in" }] : []),
  ];
  // Deep link ?tab=sell lúc không có quyền vẫn phải quay về tab được phép.
  const activeTab: TabValue =
    (tab === "sell" && !rights.has("event.update")) || (tab === "checkin" && !canCheckIn) ? "events" : tab;

  return (
    <div className="stack organizer-page">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Bàn tổ chức</h1>
          <p className="page-sub">Sự kiện, loại vé và bảng check-in của {membership.name}.</p>
        </div>
        <div className="row">
          <Select
            label="Tổ chức"
            name="org"
            value={membership.organization_id}
            onChange={(event) => {
              window.sessionStorage.setItem(ORG_KEY, event.target.value);
              setOrgId(event.target.value);
              write({ event: "" });
            }}
          >
            {organizations.map((item) => (
              <option key={item.organization_id} value={item.organization_id}>
                {item.name} · {item.roles.join("/")}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => setCreatingOrg(true)}>
            Tạo tổ chức mới
          </Button>
        </div>
      </div>

      {!rights.has("event.update") && (
        <Banner kind="warn">
          Bạn chỉ có quyền xem ở {membership.name} — các nút ghi bị ẩn. Vai trò: {membership.roles.join(", ") || "—"}
        </Banner>
      )}

      <Tabs items={tabItems} value={activeTab} onChange={(next) => write({ tab: next as TabValue })} />

      {activeTab === "events" && (
        <EventsTab
          orgId={membership.organization_id}
          events={events}
          loading={loadingEvents}
          error={eventsError}
          onRetry={() => void loadEvents()}
          rights={rights}
          status={status}
          onStatusChange={(next) => write({ status: next })}
          onCreated={(eventId) => write({ tab: "sell", event: eventId })}
          onOpenSell={(eventId) => write({ tab: "sell", event: eventId })}
          onChanged={() => void loadEvents()}
        />
      )}

      {activeTab === "sell" && (
        <SellTab
          events={events}
          eventId={activeEventId}
          onEventChange={(eventId) => write({ event: eventId })}
          rights={rights}
          onGoToEvents={() => write({ tab: "events" })}
        />
      )}

      {activeTab === "checkin" && canCheckIn && (
        <CheckInTab events={events} eventId={activeEventId} onEventChange={(eventId) => write({ event: eventId })} />
      )}

      {loadingEvents && events.length === 0 && <Skeleton height={200} />}
      {!loadingEvents && events.length === 0 && activeTab !== "events" && eventsError === null && (
        <Banner kind="warn">Tổ chức chưa có event nào. Tạo event ở tab Sự kiện trước.</Banner>
      )}

      {creatingOrg && (
        <Modal title="Tạo tổ chức mới" onClose={() => setCreatingOrg(false)}>
          <CreateOrgForm
            onDone={async (id) => {
              window.sessionStorage.setItem(ORG_KEY, id);
              await reload();
              setCreatingOrg(false);
              toast.push("Đã tạo tổ chức.", "success");
            }}
          />
        </Modal>
      )}

      {profile === null && <p className="muted small">Đang tải hồ sơ…</p>}
    </div>
  );
}

function CreateOrgForm({ onDone }: { onDone: (organizationId: string) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [failure, setFailure] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const found: { name?: string; slug?: string } = {};
    if (!name.trim()) found.name = "Trường này không được để trống.";
    if (!slug.trim()) found.slug = "Trường này không được để trống.";
    else if (!isValidSlug(slug)) found.slug = "Slug chỉ dùng a-z, 0-9, dấu `-`, dài 3–60 ký tự.";
    if (Object.keys(found).length > 0) {
      setErrors(found);
      focusField(Object.keys(found)[0]);
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const created = await request<{ organization_id: string }>("/organizations", {
        method: "POST",
        body: { name: name.trim(), slug },
      });
      onDone(created.organization_id);
    } catch (err) {
      // 05 §7: SLUG_TAKEN báo ngay dưới ô slug rồi focus lại ô đó.
      if (err instanceof ApiException && err.code === "SLUG_TAKEN") {
        setErrors({ slug: err.displayMessage });
        focusField("slug");
      } else {
        setFailure(describeError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {failure && <ErrorState message={failure.message} requestId={failure.requestId} />}
      <Field
        name="name"
        label="Tên tổ chức"
        requiredMark
        maxLength={120}
        value={name}
        onChange={(value) => {
          setName(value);
          setErrors((prev) => ({ ...prev, name: undefined }));
          if (!slugEdited) setSlug(slugify(value));
        }}
        error={errors.name}
      />
      <Field
        name="slug"
        label="Slug"
        requiredMark
        mono
        value={slug}
        onChange={(value) => {
          setSlugEdited(true);
          setSlug(value.toLowerCase());
          setErrors((prev) => ({ ...prev, slug: undefined }));
        }}
        error={errors.slug}
        hint="Dùng trong đường dẫn /events?q=<slug>"
      />
      <Button type="submit" variant="primary" loading={busy}>
        {busy ? "Đang tạo..." : "Tạo tổ chức"}
      </Button>
    </form>
  );
}



