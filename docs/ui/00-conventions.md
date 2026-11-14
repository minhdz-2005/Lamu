# 00. Quy ước giao diện dùng chung

Áp dụng cho bộ giao diện; cập nhật M4 Gateway/Identity cho01 và06–09. Đây là quy ước thiết kế frontend, **không thay authority HTTP/schema**.02–05 giữ thiết kế luồng nghiệp vụ tương lai/mock, chưa có provider thật trong phạm vi hiện tại. Policy chưa chốt ghi rõ ở§14, không tự trở thành quyết định implementation.

## 1. Nguồn dữ liệu và prefix

| Quy ước | Chốt |
|---|---|
| Base URL | Frontend Next hiện dùng `NEXT_PUBLIC_API_BASE_URL`, mặc định `/api` đang trỏ mock. Thiết kế M4 dùng `/api` qua same-origin proxy tới Gateway hoặc full Gateway URL có `/api` đúng một lần; transport/CORS cần chốt§14 trước implementation. Không chỉ đổi URL rồi giả mọi route business đã có. |
| Đường dẫn | Bằng đường dẫn trong catalog, nối sau `/api`. Ví dụ catalog `POST /events/{id}/reservations` → gọi `POST /api/events/{id}/reservations`. |
| Cấm | Không gọi thẳng cổng service (8081…8085), không gọi endpoint `/internal/...`, không tự suy đoán field chưa có trong catalog. |
| Response envelope | Success: JSON thô như catalog. Error: `{"error": {"code", "message", "request_id"}}`. |
| Field | `snake_case` như API, không đổi tên khi đưa vào UI. |
| Authority Identity | [OpenAPI v1.2.0](../../shared/contracts/http/identity.openapi.json); [Gateway projection](../../shared/contracts/http/gateway.openapi.json), [generated types](../../shared/contracts/http/generated/identity.d.ts) derive cùng nguồn. Mocks/fixtures M4 phải validate cùng artifact, không copy interface handwritten làm authority thứ hai. |
| Correlation | `X-Request-Id` UUID; Gateway giữ một UUID hợp lệ hoặc sinh mới. Không dùng `req-*` làm claim/UUID giả; request ID không là bằng chứng danh tính. |

## 2. Phiên đăng nhập (token)

| Mục | Chốt |
|---|---|
| Lưu | Mock hiện dùng localStorage `luma.access`, `luma.refresh`, `luma.profile`; đây là hiện trạng, không tự chốt storage browser M4. Cần xác nhận local-demo storage hay cookie/BFF/CSRF trước implementation§14. Theme `luma.theme` độc lập session. Không in token/password vào log/report/URL. |
| Gửi | Access Bearer cho route protected, kể cả logout. Register/login/refresh public không gửi context `X-User-Id`/`X-Session-Id` tự khai; Gateway tự cấp từ JWT verified. |
| Hạn phiên | Access900s; refresh7 ngày tuyệt đối kể từ login. Rotation thay cả token pair, giữ sid/hạn; refresh cũ401. Không giả refresh là sliding7 ngày hoặc logout thu hồi access ngay. |
| Hết hạn | Request protected không thuộc `/auth/*`401 → refresh tối đa một lần rồi retry request cũ tối đa một lần. Giữ nguyên mutation body/key. Refresh401 mới kết luận credential không dùng được;403 account unavailable xử lý riêng; network/5xx/timeout là lỗi kết nối/kết quả chưa rõ, không giả401. Route công khai không bị đá khỏi trang đọc chỉ vì session không dùng được. |
| Chồng request | Một coordinator single-flight trong tab; thiếu access/còn refresh bootstrap cũng dùng coordinator đó. Không refresh đệ quy auth endpoint. Refresh đang chạy/logout phải phối hợp, timeout hữu hạn; nhiều tab còn cần policy riêng§14. |
| Trạng thái app | UNKNOWN/CHECKING → AUTHENTICATED sau kiểm chứng hoặc ANONYMOUS khi không credential/credential không dùng được; transport failure có ERROR/retry riêng. Không suy authenticated chỉ từ token tồn tại hoặc coi timeout là anonymous; request có deadline hữu hạn, không spinner vô hạn. |
| Logout | Access + refresh hiện hành cùng phiên; đợi refresh đang chạy hữu hạn, access expired thì refresh tối đa một lần và retry logout tối đa một lần. Clear local khi kết thúc nhưng chỉ200 xác nhận server revoke. Lỗi401/network/5xx/timeout phải nói local cleared/chưa xác nhận server, không retry ngầm với token đã xóa. Chi tiết01 §3.3. |
| Response cũ | Session generation guard cho login/refresh/profile/cache/inflight; logout/đổi tài khoản làm kết quả thế hệ cũ không được ghi lại. Không chuyển user mới sang org hoặc hồ sơ user cũ. |

## 3. Map mã lỗi → thông báo tiếng Việt

Hiện `message` từ API nếu nó là câu tiếng Việt; nếu API chỉ trả code, dùng bảng cố định sau. Luôn kèm `request_id` trong toast (chữ nhỏ, để demo khi lỗi báo cáo lại được).

| `error.code` | Status | Câu hiển thị | Hành động UI |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | "Thông tin nhập chưa hợp lệ, kiểm tra lại các trường được đánh dấu." | Bật lỗi dưới field |
| `UNAUTHENTICATED` | 401 | "Phiên hết hạn, đăng nhập lại." | Redirect `/auth?next=` |
| `FORBIDDEN` | 403 | "Bạn không có quyền làm việc này trên sự kiện/tổ chức đó." | Ẩn nút, hiện banner |
| `NOT_FOUND` | 404 | "Không tìm thấy dữ liệu." | Hiện trang empty, có nút quay lại |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Lỗi dev: UI thiếu key | Không xảy ra nếu làm đúng §5 |
| `CONFLICT` | 409 | "Trạng thái đã thay đổi, tải lại dữ liệu." | Refetch |
| `SOLD_OUT` | 409 | "Vé này đã hết. Chọn loại vé khác hoặc số lượng ít hơn." | Disable nút, hiện số còn lại |
| `SALES_CLOSED` | 409 | "Sự kiện chưa mở bán hoặc đã đóng bán." | Ẩn widget đặt vé |
| `TIME_LOCKED` | 409 | "Đã có người giữ chỗ nên không đổi được giờ event." | Giữ field giờ disabled |
| `EMAIL_TAKEN` | 409 | "Email này đã có tài khoản." | Báo dưới field email |
| `SLUG_TAKEN` | 409 | "Đường dẫn (slug) này đã tồn tại." | Báo dưới field slug |
| `ALREADY_CHECKED_IN` | 409 | In nguyên văn `message` từ API (đã chứa timestamp RFC3339 lần check-in trước) | Highlight dòng vé đã dùng |
| `TICKET_VOIDED` | 409 | "Vé đã bị hủy vì sự kiện bị hủy." | Banner đỏ trên dòng vé |
| `UPSTREAM_UNAVAILABLE` | 502 | "Một phần dịch vụ đang tạm lỗi, thử lại sau ít phút." | Nút "Thử lại" |
| `UPSTREAM_TIMEOUT` | 504 | “Yêu cầu chưa nhận được phản hồi kịp thời.” | Mutation giữ key/snapshot; không báo chắc chắn chưa ghi |
| `RATE_LIMITED` | 429 | “Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.” | Không refresh/retry loop; theo Retry-After nếu có |
| `LAST_OWNER_REQUIRED` | 409 | “Tổ chức phải còn ít nhất một OWNER đang hoạt động.” | Giữ dialog role, không tự chuyển OWNER |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | “Thao tác đang được xử lý. Vui lòng kiểm tra lại sau.” | Retry có chủ đích cùng key/target/body |
| `ALREADY_MEMBER` | 409 | “Tài khoản này đã có membership trong tổ chức.” | Không reactivate/ghi đè; tải lại dữ liệu |
| `INVITATION_ALREADY_PENDING` | 409 | “Đã có lời mời đang chờ cho tài khoản này.” | Không tạo tiếp/đoán invitation ID |
| `INVITATION_EXPIRED` | 409 | “Lời mời đã hết hạn.” | Refetch inbox/receipt, không fresh accept |
| `INVITATION_NOT_PENDING` | 409 | “Lời mời đã được xử lý hoặc thu hồi.” | Refetch, không suy action nào đã thắng |
| `EVENT_SCOPE_UNVERIFIED` | 409 | “Chức năng theo phạm vi sự kiện chưa được tích hợp.” | Không fallback mock/fixture hoặc sửa scope |
| `INTERNAL_ERROR` / `SERVICE_UNAVAILABLE` | 500 / 503 | “Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại.” | Không raw stack/body; phân biệt health/internal contract và lỗi Gateway thật nhận được |

Quy tắc: không toast chứa `error.code`, JSON raw, stack trace hay text tiếng Anh của framework.

## 4. Trạng thái bắt buộc của mỗi màn hình

Mọi block dữ liệu phải đủ bốn đường, không màn hình nào được thiếu:

| State | Trigger | Hiển thị |
|---|---|---|
| Loading | request đang bay | Skeleton cùng kích thước nội dung thật (không spinner quay giữa trang trắng) |
| Empty | 200 nhưng mảng rỗng | Icon + 1 câu giải thích + 1 hành động (ví dụ "Chưa có vé nào" → nút "Xem sự kiện đang mở bán") |
| Error | 4xx/5xx hoặc network fail | Theo bảng §3, kèm nút "Thử lại" gọi lại đúng request đó |
| Success | Status success đúng operation (Identity200 hoặc201), có dữ liệu | Nội dung chính; không đòi mọi POST200 |

Degraded: response composition có `degraded: true` → hiện banner vàng "Một số thông tin (kho vé / ban tổ chức) chưa tải được" và khu tương ứng hiện empty, các phần khác vẫn dùng được.

## 5. Idempotency-Key

| Quy tắc | Chi tiết |
|---|---|
| Endpoint Identity cần key | POST organizations; PUT member roles; POST create/accept/decline/revoke invitation. Auth register/login/refresh/logout không cần key. Reservation key của03 là thiết kế service khác, chưa nằm trong rollout Identity. |
| Giá trị | UUID sinh một lần cho ý định mới; backend chấp nhận ASCII1–128 ký tự theo canonical. Freeze method/operation/actor/target/body normalized cùng key trong state thao tác. |
| Retry | Cùng thao tác/kết quả chưa rõ dùng cùng key/body/target, kể cả auth refresh rồi retry. Không tạo key khi component rerender hoặc tự đổi key để vượt409. TTL24h và replay kiểm quyền hiện tại; không hứa exactly-once vô hạn. |
| Sửa form | Sau lỗi xác định chưa commit, user đổi request là ý định mới/key mới; nếu outcome chưa rõ, cần giải quyết/đối chiếu thao tác cũ trước khi gửi ý định mới, không sửa body dùng lại key cũ. |
| Reload/logout | Thiết kế hiện giữ pending operation trong memory theo actor/org/page; reload phải refetch để đối chiếu, không hứa resume. Logout clear pending operation, response cũ không cập nhật UI; server có thể đã commit. Không lưu credential/email payload để dựng lịch sử giả. |

## 6. Tiền, thời gian, timezone

| Loại | Xử lý |
|---|---|
| Giá | `price` và `total_amount` là **string decimal** trong JSON (`"150000.00"`), để khớp `NUMERIC(12,2)`. Không `parseFloat` rồi cộng; tổng tiền do API trả, UI chỉ hiển thị. |
| Hiển thị giá | Đơn vị tiền tệ VND: `150.000 ₫`; `price = "0.00"` hiển thị "Miễn phí". |
| Input giá (organizer) | ô số nguyên VND, gửi lên `price: String(value) + ".00"`, `currency: "VND"`. |
| Thời gian API | RFC3339 UTC, ví dụ `2026-12-01T02:30:00Z`. |
| Hiển thị | Định dạng `14:30 · 01/12/2026 (GMT+7)` bằng `Intl.DateTimeFormat('vi-VN')`; nếu event có `timezone` khác thì ghi thêm tên timezone. |
| Input datetime | `<input type="datetime-local">`, gửi `starts_at`/`ends_at` kèm offset `+07:00`, `timezone` cố định `"Asia/Ho_Chi_Minh"` ở MUST. |
| Countdown | Tính từ `expires_at` trừ `Date.now()`, cập nhật 1 giây/lần, tự dừng khi về 0 và refetch reservation một lần. |

## 7. Polling

Chỉ hai chỗ dùng polling, cả hai theo cùng luật:

| Where | Interval | Dừng khi |
|---|---|---|
| Kết quả giữ chỗ (`GET /api/reservations/{id}`) | 2000 ms | `status` là `CONFIRMED` hoặc `RELEASED`, hoặc quá `expires_at` thêm 10 giây, hoặc user rời route. Lỗi 5xx/network: tiếp tục nhưng nhân đôi interval tối đa 10 giây. |
| Số liệu bảng vé organizer | 15000 ms | Khi tab organizer đang mở; refetch ngay sau mỗi check-in thành công. |

Không dùng WebSocket ở MUST. Không poll `GET /users/me/tickets`.

## 8. Điều hướng và guard

| Route | Guard |
|---|---|
| `/auth` | Trong mode Identity: session xác minh hợp lệ → next allowlisted hoặc `/me`; route business chưa tích hợp không là default. |
| `/me`, `/organizations`, `/organizations/[orgId]`, `/me/invitations` | Protected; bootstrap session trước; anonymous→auth có next hợp lệ. Inbox không cần membership; detail/controls chịu quyền backend. |
| `/events`, `/events/[slug]` | Công khai. Widget giữ chỗ mới cần đăng nhập: bấm "Giữ chỗ" khi ANONYMOUS → sang `/auth?next=/events/<slug>`, sau khi login quay lại và mở sẵn panel giữ chỗ. |
| `/me/tickets` | ANONYMOUS → `/auth?next=/me/tickets`. |
| `/organizer` | ANONYMOUS → auth. Đã login nhưng `memberships` rỗng → hiện form tạo tổ chức (xem 05). |
| 404 router | Trang "Không tìm thấy" + nút về `/events`. |

Header mode Identity: logo, Tài khoản, Tổ chức, Lời mời, display_name và Đăng xuất; có thể tạo avatar chữ từ tên, không giả API avatar. Không gọi API để đếm unread invitation vì chưa có field/count unread; muốn hiện tổng thì chỉ dùng total đã load và ghi đúng nghĩa. Menu Vé/Organizer/Event thuộc02–05 sau tích hợp service tương ứng. Không dùng membership rỗng để chặn inbox/tạo tổ chức.

## 9. Cấu trúc thư mục frontend

Một feature = một thư mục, khớp tên với số thứ tự tài liệu:

```text
frontend/src/
  app/                 # router, layout, guard
  components/          # Button, Input, Select, Skeleton, EmptyState, ErrorState,
                       # Toast, Modal, TicketCard, EventCard, Countdown, StatusBadge
  features/
    auth/              # 01
    event-discovery/   # 02
    event-detail/      # 03
    my-tickets/        # 04
    organizer/         # 05
    account/           # 06, thiết kế M4 Identity
    organizations/     # 07–08, thiết kế M4 Identity
    invitations/       # 09, thiết kế M4 Identity
  lib/                 # apiClient (interceptor + error map §3), auth store,
                       # formatters (tiền, thời gian, countdown), idKey()
```

Quy tắc: component chỉ nằm trong `features/<tên>` nếu chỉ một feature dùng; dùng từ 2 feature trở lên mới đẩy lên `components/`. Gọi API chỉ qua `lib/apiClient`, không `fetch` rải rác trong component.

## 10. Chuẩn input dùng chung

| Loại field | Luật |
|---|---|
| Bắt buộc | hiện `*`; submit khi thiếu → báo "Trường này không được để trống" ngay dưới field, focus field đầu tiên lỗi. |
| Email | validate regex + lowercase trước khi gửi. |
| Password Identity | 8–128 ký tự, giữ nguyên không trim, không tự thêm độ phức tạp ngoài canonical. |
| Slug | Organization theo CreateOrganization canonical: trim/lowercase,3–63 ký tự; event theo contract service Event khi tích hợp. Không dùng regex/giới hạn mock chung thay authority. Gợi ý slug chỉ đến khi user tự sửa. |
| Số lượng vé | integer 1..10, clamp khi gõ ngoài khoảng, hiển thị số còn lại của loại vé. |
| Mô tả event | tối đa 2000 ký tự, đếm ký tự hiện ra. |
| Thời gian | `ends_at > starts_at`, sai → báo lỗi field, không gửi request. |
| Trạng thái submit | nút đổi thành "Đang..." + `disabled`, không overlay chặn cả trang. |

## 11. Accessibility tối thiểu (check khi review)

Form có `<label for>` thật, lỗi gắn `aria-describedby`, focus không mất sau submit, mọi nút bấm được bằng Enter, bảng vé có `<th scope="col">`, badge trạng thái không chỉ dựa vào màu (có chữ đi kèm).

## 12. Definition of done cho mỗi file UI

1. Đủ state§4 và các nhánh lỗi tương ứng contract feature đã được kiểm; thiết kế chưa chạy phải ghi NOT RUN, không tự tick checklist.
2. Không request nào ngoài bảng "Route → API" của feature.
3. Browser gọi Gateway thật với Identity/DB sẵn sàng; ghi base/proxy/CORS mode, versions, synthetic test data và provider thật/fixture. Worker/broker không bắt buộc để thử API Identity; runbook tại [Identity README](../../services/identity-service/README.md). Không tự chạy fault/reset trên demo/shared.
4. Test theo checklist cuối feature, ghi lượt mới vào `docs/ui/reports/<feature>.md`, tách mock/backend/browser/manual. Giữ lịch sử cũ, không copy PASS P8 backend thành PASS UI. Không commit hoặc gửi thông tin tự động từ quy ước này.

## 13. Design system (token, theme, khoảng cách)

Toàn bộ giao diện đọc màu/chữ/khoảng cách từ token trong `frontend/src/app/globals.css`; component không hardcode hex và không tự đặt `padding` lẻ ngoài thang dưới.

| Nhóm | Chốt |
|---|---|
| Thương hiệu | Tên hiển thị là **Lamu**. Font: `Be Vietnam Pro` (body) + `Space Grotesk` (title), tải bằng `<link>` trong `layout.tsx` để build không cần mạng. |
| Bảng màu 60-30-10 | 60% trung tính (`--bg`, `--surface`, `--border`, `--text`), 30% primary indigo (`--primary`), 10% accent coral (`--accent`). Secondary teal (`--secondary`) dùng cho chip/eyebrow, không thay primary. |
| Accent | Mỗi màn hình chỉ **một** nút accent cho thao tác quan trọng nhất (hero "Khám phá sự kiện", "Giữ chỗ"). Các nút phụ dùng `btn-primary`/`btn`. |
| Theme | `data-theme="light\|dark"` trên `<html>`, key `luma.theme` trong `localStorage`, mặc định theo hệ điều hành. Script nạp trước paint (`THEME_BOOTSTRAP` trong `lib/theme.ts`) để không nhấp nháy. Nút chuyển theme nằm ở header. |
| Spacing | Thang 4pt: `--s-1..--s-11` = 4/8/12/16/24/32/40/56/72/96/128 px. Block cách nhau bội số 8, phần tử trong block bội số 4. |
| Chữ | `--fs-display` (hero) → `--fs-h1` (title trang) → `--fs-h2` (mục) → `--fs-h3` (thẻ) → `--fs-body` 15px → `--fs-sm`/`--fs-xs`. `h1` chỉ có một per trang. |
| Chuyển động | Hover lift 2px, press scale, underline tab chạy `scaleX`, toast slide-in, modal scale-in. Mọi animation tắt khi `prefers-reduced-motion: reduce`. |
| In vé | `@media print` ép token về nền sáng, chỉ `.print-area` nhìn thấy; nền tối không được làm vé in ra đen. |

## 14. Phạm vi M4 Gateway/Identity và quyết định còn mở

01 +06–09 mô tả thiết kế có thể làm với backend Identity1.2.0; không tự đổi phạm vi MUST/STRETCH của dự án toàn hệ thống. Thứ tự triển khai: client/session/logout →01 →06 →07 →08 →09. Đây là **tài liệu thiết kế**, frontend code vẫn chưa thay, các checklist browser/backend thật NOT RUN.

| Dependency/decision | Đề xuất hoặc giới hạn | Trước khi làm phần phụ thuộc |
|---|---|---|
| Transport | Ưu tiên same-origin proxy cho đường Identity có allowlist; full Gateway URL cần CORS origin cụ thể. Không fallback silent sang mock nếu Gateway lỗi. | Chốt routing/ownership Next `/api` vs Gateway để không gặp lại catch-all mock; không expose internal |
| Storage/session | Hiện localStorage; cần chốt chấp nhận cho local demo hoặc thiết kế cookie/BFF/CSRF riêng; không coi backend JSON token đã giải quyết browser storage | Chốt policy trước code coordinator/session và nghiệm thu browser; không tự đổi backend contract |
| Nhiều tab | Đề xuất cùng-origin đồng bộ logout/generation qua BroadcastChannel/storage và serialize refresh liên tab; chưa quyết định cơ chế khóa/timeout/khôi phục | Chốt logout tác động các tab chia sẻ phiên thế nào, test tab đóng/race/mất message; không tương đương server logout-all |
| Deadline coordinator | Cần timeout hữu hạn cho bootstrap/chờ refresh/logout; Gateway hiện upstream3000ms, không đồng nghĩa browser phải tự suy timeout là logout thành công | Chốt deadline/retry budget ở bước session implementation, ghi test; chưa tự gán mọi lỗi timeout thành401 |
| EVENT role | Đọc snapshot có thể hiển thị; mutation EVENT phụ thuộc D09 HTTP/provider/adapter còn DRAFT | Không fake event picker/fallback fixture; đợt này chỉ mutation ORG, như08–09 |
| Outgoing invitations | Có create/revoke theo ID, chưa có GET list theo org |08 chỉ receipt vừa tạo; tab quản lý lịch sử/thu hồi đầy đủ cần đề xuất API riêng, không tự implement |

Ngoài phạm vi UI hiện tại: edit profile/password/org, khóa/xóa/reactivate member, user directory/email search, session/device list/logout-all, quản trị permission động, Event/ticket/payment/Notification, UI outbox/queue vận hành và public org page riêng. Public org API đã có nhưng chưa cần route UI riêng để hoàn thành năm màn Identity. Không gọi internal authorization/check từ browser.

