# MetaPost Studio v2.0 Pro 🚀 - Trình Đăng Bài Đa Fanpage Facebook

Công cụ Web App chuyên nghiệp, độc lập giúp bạn soạn bài viết và đăng đồng thời lên nhiều Trang Fanpage Facebook chỉ với **1 lần bấm**, hỗ trợ **Token Vĩnh Viễn**, **Hẹn giờ đăng bài**, **Mẫu bài viết**, **Tự động nén ảnh** và **Chống spam thông minh**.

---

## ✨ Tính Năng Nổi Bật v2.0

1. ♾️ **Token Vĩnh Viễn Không Hết Hạn:**
   - Đổi mã tạm thời sang mã vĩnh viễn chuẩn Graph API của Meta.
   - Nhập 1 lần duy nhất, không bao giờ lo token bị hết hạn sau 1–2 giờ.
2. 📅 **Hẹn Giờ Đăng Bài (Schedule Posts):**
   - Chọn ngày và giờ phát sóng, máy chủ Facebook sẽ tự động giữ bài và đăng đúng lịch hẹn.
3. 📝 **Quản Lý Mẫu Bài Viết (Templates):**
   - Lưu lại các bài viết bán hàng thường dùng (mẫu khuyến mãi, giới thiệu sản phẩm, hotline chốt đơn) để gọi lại chỉ với 1 click.
4. ⚡ **Tự Động Nén Ảnh (Auto-Compress):**
   - Tự động nén và tối ưu hóa dung lượng các ảnh nặng (3MB–10MB) xuống còn chuẩn web nhẹ nhàng trước khi tải lên, giúp đăng bài siêu nhanh và không bị nghẽn mạng.
5. 🛡️ **Anti-Spam Thông Minh:**
   - Tự động hoán vị thứ tự hashtag, chèn ký tự ẩn và mã phân biệt ngẫu nhiên giữa các Fanpage để bảo vệ điểm chất lượng (Page Health Score).
6. 🔄 **Thử Lại Bài Lỗi (Retry Failed Posts):**
   - Khi đăng lên 5–10 Page mà có 1 Page bị gián đoạn mạng, bạn có thể bấm "Thử lại" riêng cho Page đó mà không cần đăng lại các Page đã thành công.
7. 🛑 **Nút Dừng Đăng Tức Thì (Cancel Publish):**
   - Dễ dàng bấm dừng tiến trình phát sóng bất cứ lúc nào nếu phát hiện nhầm lẫn.
8. 📱 **Tương Thích Mọi Thiết Bị:**
   - Giao diện Dark/Light mode hiện đại, hoạt động mượt mà trên cả máy tính, máy tính bảng và điện thoại.

---

## 🚀 Hướng Dẫn Sử Dụng (Dưới Máy Tính)

### Cách 1: Mở trực tiếp (Không cần cài đặt)
* Nhấp đúp vào file [`start.bat`](file:///c:/Users/Admin/.codex/fb-multi-post-app/start.bat) hoặc mở file [`index.html`](file:///c:/Users/Admin/.codex/fb-multi-post-app/index.html) bằng trình duyệt (Chrome, Cốc Cốc, Edge).

### Cách 2: Chạy qua Server nội bộ (Node.js)
```bash
node server.js
```
Mở trình duyệt truy cập: `http://localhost:3000`

---

## 🌐 Hướng Dẫn Đưa Lên Mạng (Deploy lên Vercel / Cloudflare Pages)

Vì đây là Web App tĩnh (HTML/CSS/JS thuần), bạn có thể đưa lên mạng hoàn toàn **Miễn Phí** chỉ trong 1 phút:

### Cách Deploy lên Vercel (Dễ nhất - Không cần biết code):
1. Truy cập: [vercel.com/drop](https://vercel.com/drop) (đăng nhập tài khoản Google/GitHub nếu chưa có).
2. Kéo thả nguyên thư mục `fb-multi-post-app` thả vào khung trình duyệt của Vercel.
3. Vercel sẽ tự động cấp cho bạn một đường link online (ví dụ: `https://metapost-studio.vercel.app`).
4. Từ nay bạn có thể mở đường link đó trên điện thoại hay bất kỳ máy tính nào để đăng bài!

### Cách Deploy qua Cloudflare Pages:
1. Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com/) $\rightarrow$ **Workers & Pages** $\rightarrow$ **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Direct Upload**.
2. Upload thư mục `fb-multi-post-app` lên là xong.

---

## ♾️ Hướng Dẫn Kích Hoạt Token Vĩnh Viễn

1. Trên thanh tiêu đề Web App, bấm nút **"Token Vĩnh Viễn"** (icon $\infty$).
2. Nhập:
   - **App ID:** ID ứng dụng của bạn trên Meta Developer (Ví dụ: `990458834013160`).
   - **App Secret:** Khóa bí mật (vào *developers.facebook.com/apps* $\rightarrow$ chọn App $\rightarrow$ *Cài đặt cơ bản* $\rightarrow$ bấm *Hiển thị* bên cạnh Khóa bí mật).
   - **Token ngắn hạn:** Dán mã Token lấy từ Graph API Explorer.
3. Bấm **"Nâng Cấp Sang Token Vĩnh Viễn"**.
4. Tool sẽ tự động đổi sang Token dài hạn và lưu lại toàn bộ Page Access Token vĩnh viễn vào trình duyệt. Từ lần sau bạn không cần lấy token nữa!

---

## 📁 Cấu Trúc Mã Nguồn

- `index.html`: Giao diện chính v2.0 đầy đủ tính năng & chuẩn SEO/a11y.
- `style.css`: Hệ thống thiết kế responsive, light/dark theme, Facebook feed preview mockup.
- `app.js`: Engine xử lý Graph API v19.0, nén ảnh Canvas, đổi Token vĩnh viễn, hẹn giờ đăng.
- `server.js`: Node.js web server bảo mật cao (chống path traversal, MIME types đầy đủ).
- `vercel.json`: Cấu hình header bảo mật và cache tối ưu cho Vercel.
- `start.bat`: File nhấp đúp mở nhanh trên Windows.
