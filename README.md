# TAStore68 Pro (v3.6.1) 🚀 — Hệ Thống Đăng Bài & CRM Fanpage Facebook Đa Kênh

**TAStore68 Pro** là hệ sinh thái Web App chuyên nghiệp kết hợp giữa **Quản Lý Hội Thoại CRM Inbox Đa Page** và **Studio Đăng Bài Đa Phương Tiện (Ảnh/Album/Video)** đồng thời lên hàng loạt Fanpage Facebook.

---

## 🌟 Điểm Nổi Bật & Tính Năng Chính

### 💬 1. CRM Inbox — Quản Lý Hội Thoại & Khách Hàng Đa Page
- **Quản lý đa Fanpage tập trung:** Chuyển đổi linh hoạt giữa 14+ Fanpage hoặc xem chế độ "Tất cả Page".
- **Giao diện Chat Messenger hiện đại:** Hỗ trợ tin nhắn văn bản, ảnh, âm thanh, sticker và tệp đính kèm.
- **Phân biệt Page trùng tên thông minh:** Tự động hiển thị lượt Like thực tế (`1.062 Like`, `1.478 Follower`) hoặc đặt Nickname riêng cho từng trang.
- **Mẫu trả lời nhanh (Quick Replies):** Phím tắt thông minh `/size`, `/stk`, `/ship`, `/in`, `/camon`.
- **Tạo mã VietQR tự động:** Điền số tiền & nội dung, tạo mã QR ngân hàng tức thì để gửi khách quét trả tiền.
- **Tạo đơn hàng & Ghi chú CRM:** Lưu thông tin khách hàng, số điện thoại, ghi chú nội bộ và lịch sử đơn hàng trực tiếp trên thiết bị (Offline-first / LocalStorage).
- **Tối ưu Mobile WebKit / Safari:** Hỗ trợ giao diện tràn viền `100dvh`, vuốt chạm cảm ứng mượt mà, chống tự động phóng to (Auto-zoom) trên iPhone.

### 📢 2. PostStudio Pro — Đăng Bài Đa Phương Tiện Đa Page
- **Đa dạng hình thức đăng:**
  - 🖼️ **Đăng 1 ảnh:** Gửi trực tiếp lên Graph API `/{pageId}/photos`.
  - 📸 **Đăng Album nhiều ảnh (Multi-photo):** Tải lên các ảnh unreleased và gom thành 1 bài Feed album hoàn chỉnh.
  - 🎥 **Đăng Video:** Hỗ trợ video MP4, MOV với timeout lên đến 120 giây.
  - 📝 **Đăng Văn bản / Link:** Tự động tạo link preview.
- **Nén ảnh tự động (Smart Canvas Auto-Compress):** Nén ảnh dung lượng 5MB–10MB xuống còn ~400KB trong 0.05s trước khi upload.
- **Modal tiến trình phát sóng:** Hiển thị phần trăm thực tế (0% → 100%), trạng thái từng Page và link trực tiếp đến bài viết Facebook sau khi đăng xong.
- **Xử lý sự cố linh hoạt:** Nút **"Dừng tiến trình"** và nút **"Thử lại các Page lỗi"**.
- **Smart Anti-Spam:** Tự động chèn ký tự ẩn (Zero-Width Space `\u200B`) và mã ngẫu nhiên để tránh bị Facebook quét trùng lặp nội dung.
- **Lên lịch đăng bài (Schedule):** Hẹn giờ đăng chuẩn Graph API.

### 🔒 3. Bảo Mật & Kiến Trúc Hiện Đại
- **Kiến trúc Vercel Serverless `/api/*`:** Đổi token dài hạn trên server; `App Secret` không đi vào trình duyệt.
- **Đồng bộ Mobile 1-Scan:** Mã QR được tạo ngay trên thiết bị, không gửi token tới dịch vụ tạo QR bên thứ ba.
- **Webhook có xác thực:** Chỉ nhận payload có chữ ký `X-Hub-Signature-256` hợp lệ và không log nội dung khách hàng.
- **Công nghệ cốt lõi:** React 19, Vite, Tailwind CSS, Lucide Icons, Canvas Confetti.

---

## 🛠️ Hướng Dẫn Cài Đặt & Phát Triển Cục Bộ

### 1. Cài đặt Dependencies:
```bash
npm install
```

### 2. Cấu hình Biến môi trường:
Tạo file `.env.local` dựa trên mẫu `.env.example`:
```env
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_GRAPH_VERSION=v26.0
VITE_META_GRAPH_VERSION=v26.0
FB_WEBHOOK_VERIFY_TOKEN=your_long_random_verify_token
```

### 3. Khởi chạy máy chủ phát triển (Vite Dev Server):
```bash
npm run dev
```
Truy cập: `http://localhost:3000`

### 4. Build bản Production:
```bash
npm run build
```

---

## 🚀 Triển Khai Lên Vercel

Dự án đã được cấu hình tối ưu sẵn cho Vercel:
1. Đẩy code lên GitHub Repository.
2. Import project vào [Vercel Dashboard](https://vercel.com).
3. Thêm biến môi trường trong **Project Settings $\rightarrow$ Environment Variables**:
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_GRAPH_VERSION=v26.0`
   - `VITE_META_GRAPH_VERSION=v26.0`
   - `FB_WEBHOOK_VERIFY_TOKEN` nếu bật webhook Messenger
4. Deploy tự động và sử dụng đường dẫn production `https://metapost-studio.vercel.app`!

---

## 📁 Cấu Trúc Dự Án

```
├── api/
│   └── meta/
│       └── exchange-token.js   # Serverless Token Exchange endpoint
├── src/
│   ├── components/
│   │   ├── common/             # TokenModal, ThemeToggle...
│   │   ├── inbox/              # CRMInbox, ChatThread, ConversationSidebar...
│   │   └── post/               # PostStudio (Multi-media publishing engine)
│   ├── services/
│   │   └── facebookApi.js      # Centralized Facebook Graph API engine
│   ├── App.jsx                 # Main application layout & router
│   ├── main.jsx                # React root entry point
│   └── index.css               # Tailwind & WebKit mobile touch styles
├── .env.example                # Clean environment variables template
├── db-setup.sql                # SQL Schema with Row Level Security (RLS)
├── package.json                # Project manifest (ES Module)
├── vercel.json                 # Vercel security headers & routing
└── vite.config.js              # Optimized Vite rollup bundle splitting
```

---

*Phát triển bởi đội ngũ kỹ thuật TAStore68 • Bản quyền © 2026*

