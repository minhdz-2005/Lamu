import Link from "next/link";

const DISCOVER = [
  { label: "Công nghệ", query: "công nghệ", mark: "01", style: "topic-tech" },
  { label: "Workshop", query: "workshop", mark: "02", style: "topic-workshop" },
  { label: "Gặp gỡ cộng đồng", query: "cộng đồng", mark: "03", style: "topic-community" },
  { label: "Âm nhạc & nghệ thuật", query: "âm nhạc", mark: "04", style: "topic-art" },
];

export function LandingPage() {
  return (
    <div className="landing home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-kicker"><span aria-hidden="true" /> Có gì hay đang diễn ra?</p>
          <h1 id="home-title">Gặp nhau ở những điều <em>đáng nhớ.</em></h1>
          <p className="home-intro">
            Tìm sự kiện bạn yêu thích, gặp những người cùng mối quan tâm và giữ chỗ cho trải nghiệm tiếp theo của mình.
          </p>
          <form className="home-search" action="/events" role="search">
            <label className="sr-only" htmlFor="home-query">Bạn muốn tham gia sự kiện nào?</label>
            <span className="home-search-icon" aria-hidden="true">⌕</span>
            <input id="home-query" name="q" type="search" placeholder="Thử “workshop”, “công nghệ”…" />
            <button type="submit" className="btn btn-primary btn-pill">Tìm sự kiện <span aria-hidden="true">→</span></button>
          </form>
          <div className="home-hero-links">
            <Link href="/events">Khám phá tất cả sự kiện <span aria-hidden="true">↗</span></Link>
            <span aria-hidden="true">·</span>
            <Link href="/auth?next=/organizer">Bạn là người tổ chức?</Link>
          </div>
        </div>

        <div className="home-visual" aria-hidden="true">
          <div className="home-visual-orbit orbit-one" />
          <div className="home-visual-orbit orbit-two" />
          <div className="home-visual-sun" />
          <div className="home-visual-note note-top"><span>THỨ BẠN YÊU THÍCH</span><strong>Gặp ngoài đời.</strong></div>
          <div className="home-visual-ticket">
            <div className="visual-ticket-top"><span className="visual-ticket-mark">L</span><span>YOUR NEXT PLAN</span><span>↗</span></div>
            <div className="visual-ticket-art"><span>MAKE<br />IT<br /><i>happen.</i></span><b>✳</b></div>
            <div className="visual-ticket-bottom"><span>Chọn một ngày<br /><strong>để nhớ lâu.</strong></span><span className="visual-arrow">↗</span></div>
          </div>
          <div className="home-visual-note note-bottom"><span>ĐIỀU TUYỆT NHẤT</span><strong>Thường bắt đầu<br />từ một lời rủ.</strong></div>
          <span className="home-visual-spark spark-one">✳</span>
          <span className="home-visual-spark spark-two">✳</span>
        </div>
      </section>

      <section className="home-discover" aria-labelledby="discover-title">
        <div className="home-section-heading">
          <div>
            <p className="home-kicker"><span aria-hidden="true" /> Mở ra một điều mới</p>
            <h2 id="discover-title">Bạn đang muốn làm gì?</h2>
          </div>
          <Link className="text-link" href="/events">Xem tất cả sự kiện <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="topic-grid">
          {DISCOVER.map((topic) => (
            <Link key={topic.label} href={`/events?q=${encodeURIComponent(topic.query)}`} className={`topic-card ${topic.style}`}>
              <span className="topic-mark">{topic.mark}</span>
              <span className="topic-decoration" aria-hidden="true">✳</span>
              <strong>{topic.label}</strong>
              <span className="topic-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-host">
        <div className="host-art" aria-hidden="true">
          <div className="host-art-card"><span>GATHER<br />YOUR<br /><i>people.</i></span><b>✳</b></div>
          <span className="host-sticker">MAKE<br />SOMETHING<br />HAPPEN</span>
        </div>
        <div className="host-copy">
          <p className="home-kicker"><span aria-hidden="true" /> Dành cho người tạo nên cuộc vui</p>
          <h2>Một ý tưởng hay xứng đáng có một nơi để gặp nhau.</h2>
          <p>Tạo trang sự kiện, mở đăng ký và đón mọi người tại cửa. Lamu giúp bạn tập trung vào buổi gặp gỡ — phần tổ chức đã có chúng mình lo.</p>
          <Link href="/auth?next=/organizer" className="btn btn-primary btn-pill">Tạo sự kiện đầu tiên <span aria-hidden="true">→</span></Link>
          <div className="host-points"><span>Trang sự kiện riêng</span><span>Đăng ký và vé điện tử</span><span>Check-in gọn nhẹ</span></div>
        </div>
      </section>

      <footer className="landing-footer home-footer">
        <div>
          <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">L</span>Lamu</Link>
          <p className="muted small" style={{ marginTop: 12, maxWidth: "42ch" }}>Một nơi để tìm thấy những cuộc gặp gỡ đáng nhớ.</p>
        </div>
        <nav aria-label="Liên kết trang">
          <Link href="/events">Khám phá</Link>
          <Link href="/auth">Đăng nhập</Link>
          <Link href="/organizer">Dành cho người tổ chức</Link>
          <Link href="/me/tickets">Vé của tôi</Link>
        </nav>
        <span className="home-copyright">© 2026 Lamu · Made for good gatherings</span>
      </footer>
    </div>
  );
}
