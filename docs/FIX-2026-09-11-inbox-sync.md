# Sửa độ trễ đồng bộ Inbox — 11/09/2026

## Thay đổi

- Service worker v7 chuyển Page ID, PSID, conversation ID và message ID sang app. Nhận Push kích hoạt tải danh sách đúng Page và chat đúng khách, không tự chuyển Page/đánh dấu đã đọc/gửi tin.
- Queue gộp burst, không chồng request của cùng luồng, giữ một lượt sau request đang chạy. Tải bù một lần sau khoảng 2 giây để xử lý độ trễ Graph sau webhook.
- Trạng thái lỗi storage không chặn chuyển sự kiện Push sang Inbox.
- Chat được kiểm tra conversation ID + generation + disposed trước khi áp dụng kết quả, và kiểm tra lại trong React updater. Phát chuông/ghi cache nằm ngoài updater. Không ghi cache/render lại khi dữ liệu không thay đổi.
- Chat đang mở polling 5 giây; Page hiện tại 20 giây; toàn bộ Page 60 giây. Đây là lịch kiểm tra, không phải cam kết độ trễ đầu-cuối. Chat mobile đã đóng không poll. Tab ẩn/offline không chạy tải chat. Rate-limit ở chat chờ 60 giây; lỗi mạng chờ 10 giây.
- Hiện lỗi đồng bộ chat và danh sách ngay cả khi cache còn dữ liệu; giữ tin cũ khi lỗi.
- Tải một Page trong view all không xóa Page khác; silent refresh không reset cursor lịch sử.
- Không dùng cross-tab lock bỏ kết quả cho active chat: từng tab đang hiển thị cần nhận được kết quả riêng. Full list/cross-Page polling vẫn giữ khóa hiện có.
- Bỏ hook tự POST subscribed_apps khi loadPages: không thay cấu hình Meta khi chỉ mở app; giữ setup thủ công/đường backend hiện có.
- Giữ thay đổi Page-token fallback đã có của người dùng trong facebookApi.js, bỏ đoạn enrichPagesWithLikes bị chèn lặp gây sai cú pháp; thêm test fallback và token lỗi.

## Kiểm tra

- Test giả lập timer: burst, in-flight trailing run, dispose và phục hồi sau lỗi.
- Test VM service worker: showNotification rồi truyền đúng danh tính Page/khách/message; test routing Page/chat.
- Test merge targeted list giữ Page khác; static regression checks cho wiring và late-response guards. Đây không phải test UI đầu-cuối.
- Browser smoke tự động bị chặn do thiếu browser-service.mjs của Browser component 26.903.61454; không dùng computer use hoặc đổi Facebook setup để vượt qua.
- Không dùng lại token trong hội thoại, không gửi tin/đăng bài/đánh dấu khách thật trong kiểm thử.

## Cần xác minh thiết bị thật sau deploy

Đã deploy production `dpl_DHAKjL9YCubKUS6hQ4mTNy7Timeu` (READY). Alias trả bundle `/assets/index-DbWUqHwM.js`, có event `metapost-inbox-push`; service worker v7 có message identity. Full check: 117/117 test và build đạt. Live Push config 200; status anonymous 401; webhook POST không chữ ký 401; verify token sai 403. Không chứng minh luồng chat thật hoặc âm báo trên điện thoại.

Mở lại app để lấy bundle/SW mới. Giữ chat mở và nhắn từ tài khoản thử được phép, sau đó kiểm tra view tất cả Page và thử chuyển chat nhanh. Kiểm tra tin gửi từ Business Suite (không có Push cho echo, cần polling). Cuối cùng thử khóa màn hình; việc dịch vụ Push nhận request không chứng minh OS đã hiện thông báo/âm thanh.

Các phát hiện khác trong AUDIT-2026-09-09.md như delivery retry từng thiết bị, cache fallback và backup vẫn ngoài bản sửa đồng bộ này.

## Hotfix Meta #2 trên shortcut

Người dùng báo web tải được, shortcut báo không tải được hội thoại Meta #2. Chưa trực tiếp tái hiện trên điện thoại hoặc xác định khác biệt token/Page giữa hai bản; không quy kết lỗi riêng iOS hay token.

- Chỉ fetchPageConversations thử lại đúng một lần khi Meta trả code 1/2, chờ 1,2 giây, dùng limit tối đa 10 và bỏ phần avatar/attachments mở rộng. Giữ unread_count, participants, can_reply, latest message và cursor.
- Không tự retry mutation/gửi tin; lỗi quyền, token, rate limit không đi vào lần retry này.
- Nếu Page vẫn trả 1/2 hoặc rate-limit, list chờ 60 giây; active chat cũng giãn 60 giây với 1/2. Giữ cache và hiển thị thời gian chờ. Các Page khác vẫn tải được.
- 120/120 tests và build đạt. Deployment `dpl_9X83wq5gWt6ZsMjxWwdXmJVd6Xte`, READY; bundle `/assets/index-BagSOgdb.js`.
- Cần người dùng mở lại shortcut và kiểm tra trên đúng Page; nếu tiếp tục lỗi cần tên Page + toàn bộ thông báo lỗi/giờ thử, không yêu cầu gửi token mới.
