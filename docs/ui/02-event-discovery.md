# 02. Danh sách sự kiện

**Route:** `/events` · **Cần đăng nhập:** Không · **Ưu tiên:** 2 · **API:** `GET /api/public/events`

Mục tiêu: user công khai tìm được event đang mở bán và bấm vào trang chi tiết. Đây là trang đầu tiên sau đăng nhập và là trang demo "hot list".

## 1. Layout

```text
+------------------------------------------------+
| Header:  Sự kiện | Vé của tôi | Organizer | ... |
+------------------------------------------------+
|  Tìm sự kiện                                    |
|  [ thanh tìm kiếm ...........................]  |
|  [ Từ ngày: yyyy-mm-dd ] [ Lọc ] [ Xóa lọc ]    |
+------------------------------------------------+
|  Kết quả: 37 sự kiện            (hàng kết quả)  |
|  +--------------+  +--------------+  +--------+ |
|  | EventCard    |  | EventCard    |  | ...    | |
|  | title        |  | title        |  |        | |
|  | 14:30 01/12  |  | 20:00 05/12  |  |        | |
|  | org: lamustd |  | org: itacad  |  |        | |
|  | [Xem chi tiết] |  [Xem chi tiết] |          | |
|  +--------------+  +--------------+  +--------+ |
|  (lưới 3 cột desktop / 2 tablet / 1 mobile)     |
+------------------------------------------------+
|  [< Lùi]   Trang 2 / 2   [Tiếp >]               |
+------------------------------------------------+
```

| Component | Props | Ghi chú |
|---|---|---|
| `EventListPage` | — | sở hữu `query`, `fromDate`, `page`, `pageSize`, `result` |
| `SearchBar` | `value`, `onSubmit`, `onClear` | debounce 300 ms, submit bằng Enter |
| `DateFromFilter` | `value`, `onChange` | `type="date"`, không cho ngày quá 1 năm trước hôm nay |
| `EventCard` | `event: {id, slug, title, starts_at, organization_slug}` | link `/events/{slug}`; toàn card bấm được |
| `Pager` | `total`, `page`, `pageSize`, `onChange` | chỉ hiện khi `total > pageSize` |

## 2. Gọi API

```text
GET /api/public/events?q=<string>&from=<YYYY-MM-DD>T00:00:00Z&limit=20&offset=0
200 -> { items: [{id, slug, title, starts_at, organization_slug}], total: 37 }
```

| Ràng buộc | Chi tiết |
|---|---|
| Mặc định | `limit=20`, `offset=0`, không gửi `q`/`from` khi rỗng (không gửi `q=`) |
| `q` | trim, tối thiểu 2 ký tự mới gửi; giữ khoảng trắng đơn |
| `from` | chuyển ngày thành RFC3339 UTC `T00:00:00Z` theo timezone máy user (`+07:00` → gửi `2026-11-30T17:00:00Z`) |
| Đồng bộ URL | `?q=&from=&page=` phản ánh vào query string để chia sẻ link và bấm Lùi trình duyệt còn giữ lọc |
| Chống race | Mỗi lần gửi request tăng `requestSeq`; chỉ nhận response có `requestSeq` lớn nhất |
| Cache | In-memory 10 giây theo key `(q, from, offset)`. Không cache xuyên route. |

## 3. State màn hình

| State | Điều kiện | Nội dung |
|---|---|---|
| Loading | request đầu tiên | 6 `EventCard` skeleton |
| LoadingMore | đang đổi trang khi đã có dữ liệu | lưới cũ mờ 60%, không hiện skeleton |
| Empty | `total = 0` | "Chưa tìm thấy sự kiện nào khớp bộ lọc." + hành động "Xóa bộ lọc" (reset `q`, `from`, `page=1`) |
| Error | 4xx/5xx/network | ErrorState + nút Thử lại; giữ nguyên bộ lọc đã nhập |
| Success | `total > 0` | lưới card + dòng "Kết quả: {total} sự kiện" |

## 4. Quy tắc hiển thị card

| Nội dung | Nguồn | Format |
|---|---|---|
| Tiêu đề | `title` | 2 dòng, cắt `…`; font to nhất card |
| Ngày giờ | `starts_at` | `14:30 · 01/12/2026` (00 §6). Event đã qua (`starts_at < now`) thêm badge mờ "Đã diễn ra" |
| Ban tổ chức | `organization_slug` | chữ nhỏ `Ban tổ chức: luma` |
| Trạng thái | API list không trả `status` → **suy từ `starts_at`** | `starts_at < now` = "Đã diễn ra". Không hiển thị "còn vé" vì danh sách này không có số liệu tồn kho (đó là việc của 03) |

Không tự bịa field (`price`, `available`, `image`) ở trang này; catalog không trả thì không hiện.

## 5. Phân trang

| Luật | Chi tiết |
|---|---|
| `pageSize` | 20 (mặc định API), chọn 20/50 qua dropdown; `offset = (page-1) * pageSize` |
| Số trang | `ceil(total / pageSize)`; `total` lấy từ response, không đếm `items.length` |
| Biên | trang 1 ẩn "Lùi"; trang cuối ẩn "Tiếp"; không cho bấm ra trang vượt `ceil(...)` |
| Đổi lọc | `q` hoặc `from` đổi → `page = 1` |
| Scroll | sau khi đổi trang, scroll về đầu lưới |

## 6. Edge cases

| Case | Xử lý |
|---|---|
| API trả `items` rỗng nhưng `total > 0` (trang vượt biên) | Tự reset về trang 1 và refetch một lần; nếu vẫn rỗng → Empty + log `request_id` |
| `total` thay đổi giữa hai lần bấm (sự kiện mới publish) | Lấy `total` mới nhất, cho phép trang cuối ít card |
| User paste link `?page=999` | Tính `offset` vượt → đối xử như §6.1 |
| `q` chỉ có khoảng trắng | Không gửi `q`, coi như không lọc |
| Mất mạng khi đang đổi trang | ErrorState, **giữ dữ liệu trang cũ** để user không thấy trang trắng |
| Event bị cancel sau khi user xem list | Trang 03 mới là nơi hiện trạng thật (`GET /public/events/{slug}` trả 404 nếu chưa PUBLISHED, event CANCELLED → see 03 §6) |

## 7. Checklist nghiệm thu

- [ ] Vào `/events` không tham số → thấy list mặc định, đếm khớp `total`.
- [ ] Gõ `q=tech` → sau 300 ms chỉ một request bay đi, URL thành `/events?q=tech`.
- [ ] Bấm Lùi trình duyệt → quay lại bộ lọc và trang cũ.
- [ ] Đổi `pageSize` 50 → `offset` trang 2 thành 50, không nhân đôi card.
- [ ] Lọc ngày mai mà không có event → Empty + nút "Xóa bộ lọc" chạy đúng.
- [ ] Tắt Registration service (nếu Event list không phụ thuộc thì vẫn OK — ghi lại hành vi thật) → ErrorState + Thử lại hoạt động.
- [ ] Gõ nhanh 5 ký tự liên tiếp → chỉ response mới nhất được render, dữ liệu cũ không nhấp nháy.
- [ ] 37 event → hiện "Trang 1 / 2", trang 2 có 17 card.
- [ ] Không card nào linkage tới `/api/public/events/{slug}/details` (trang này chưa cần composition).
- [ ] Ghi kết quả test vào `docs/ui/reports/02-event-discovery.md`.
