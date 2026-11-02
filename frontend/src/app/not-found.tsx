import Link from "next/link";

/** 00 §8: route không khớp hiện trang "Không tìm thấy" + nút về /events. */
export default function NotFound() {
  return (
    <div className="stack" style={{ textAlign: "center", padding: "56px 0" }}>
      <div className="empty-mark" aria-hidden="true">
        404
      </div>
      <h1 style={{ marginBottom: 4 }}>Không tìm thấy trang</h1>
      <p className="muted" style={{ maxWidth: "46ch", margin: "0 auto" }}>
        Đường dẫn này không tồn tại trong demo Lamu. Có thể sự kiện chưa publish hoặc bạn gõ nhầm slug.
      </p>
      <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
        <Link href="/events" className="btn btn-accent btn-pill">
          Xem danh sách sự kiện
        </Link>
        <Link href="/" className="btn btn-ghost">
          Về trang giới thiệu
        </Link>
      </div>
    </div>
  );
}
