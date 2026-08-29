# Rà soát đọc/chưa đọc và các luồng chính — 28/08/2026

## Kết luận

Trạng thái “đã đọc” hiện chưa đáng tin để coi là đã đồng bộ với Meta. App ghi trạng thái cục bộ trước, chỉ gửi `mark_seen` trong một số trường hợp, bỏ qua lỗi và không đọc lại trạng thái Meta. Có lỗi độc lập trong tải lịch sử chat và khả năng gửi lại thông báo Push.

Lượt này chỉ rà soát. Không sửa mã ứng dụng, deploy, bấm đánh dấu đọc tin thật, gửi tin khách, đăng bài hay đổi ngân sách/quyền Page. File này là báo cáo mới; không thay thế báo cáo lần triển khai trước.

## Bằng chứng và giới hạn

- `npm run check`: 82/82 test đạt; build thành công. Kiểm tra cú pháp riêng `api/push/status.js`, `public/sw.js` đạt.
- Bản live trả HTTP 200; bundle chính `index-DqC_NFye.js` trùng bản build hiện tại. Service worker trả HTTP 200, phiên bản `tastore68-v6`.
- `GET /api/push/config` trả 200. `POST /api/push/status` không có thông tin xác thực trả 401 đúng dự kiến. Các kết quả này không chứng minh điện thoại nhận Push.
- Trình duyệt bản live: mở được Inbox, Đăng bài, Ads, Quản trị. Khung soạn chat PC nằm trong viewport 2560×1249. Danh sách Inbox tại 390×844 không tràn ngang. Đây là kiểm tra bố cục tại thời điểm quan sát, không chứng minh đã hết lỗi gián đoạn hay bàn phím Safari thật.
- Kết nối Browser tích hợp lỗi khởi tạo; dùng công cụ DevTools dự phòng để quan sát DOM. Không đọc cookie, token hoặc kho lưu trữ trình duyệt.
- Các tình huống lỗi bên dưới được tái hiện với dữ liệu giả và hàm hiện tại. Handler React được lấy từ nguồn và chạy trong môi trường giả lập state; đây không phải thao tác trên hội thoại thật.
- Chưa kiểm chứng màn hình khóa/âm thanh trên điện thoại vật lý. Chưa tái hiện lần đăng 5 Page chỉ thành công 4; không có phản hồi lỗi của đúng lần đó.

## Các lỗi cần ưu tiên

### P1 — Đọc tất cả báo hoàn tất khi Meta thất bại, xóa cả số của Page khác

Nguồn: `src/components/inbox/CRMInbox.jsx:1523`, `src/services/facebookApi.js:149`.

Handler lưu thời điểm đọc cho toàn bộ hội thoại đang tải trước khi gọi Meta. Chỉ hội thoại qua `canMarkConversationSeen` mới được gửi; kết quả `Promise.allSettled` không được kiểm tra. Sau đó mọi `unread_count` và mọi Page trong bảng tổng hợp đều bị đặt thành 0.

Tái hiện: chỉ tải hội thoại Page A, bảng tổng hợp có A=1/B=7; Meta từ chối thao tác và có thêm một tin mới trong lúc chờ. Sau khi handler kết thúc, cả tin cũ, tin mới và số của Page B đều thành 0.

Ảnh hưởng: bỏ sót khách, hiểu sai phạm vi “tất cả”, không biết thao tác nào chưa đồng bộ. Hội thoại chưa tải/phân trang tiếp không thực sự được xử lý trên Meta.

Hướng sửa: chốt tập hội thoại theo phạm vi Page rõ ràng; theo dõi thành công/thất bại/bỏ qua từng mục; không xóa số Page ngoài phạm vi hoặc tin tới sau thời điểm thao tác; chỉ thông báo Meta xác nhận khi có bằng chứng tương ứng.

### P1 — Trạng thái cục bộ ghi đè kết quả đọc/chưa đọc của Meta

Nguồn: `src/services/facebookApi.js:394`, `src/components/inbox/CRMInbox.jsx:691`, `src/components/inbox/CRMInbox.jsx:741`.

Hai tình huống đã tái hiện:

- Meta trả `unread_count=0`, tin mới nhất do Page gửi sau mốc đọc cục bộ: app đổi thành 1.
- Meta trả `unread_count=2`, thời gian cập nhật trước mốc đọc cục bộ: app đổi thành 0.

Mở một hội thoại cũng đánh dấu đọc cục bộ trước khi tải tin thành công. Lỗi `mark_seen` bị bỏ qua. Theo điều kiện hiện tại của app, tin quá hạn, tin cuối do Page gửi hoặc thiếu dữ liệu sẽ không được gửi `mark_seen` nhưng vẫn mất dấu chưa đọc trong app.

Meta có thao tác `mark_seen` trong Send API: [bộ tài liệu do Meta phát hành trên Postman](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api%3Fentity%3Dfolder-22794852-6724e47b-0e25-4cb0-95cb-cd04279dd917). Sự tồn tại của thao tác này không phải bằng chứng app đã xác minh đồng bộ hai chiều với trạng thái Inbox Business Suite. Không kết luận API không thể đồng bộ; vấn đề đã chứng minh là app chưa kiểm tra kết quả đó.

Hướng sửa: tách “đã xem trên thiết bị” khỏi trạng thái Meta; không dùng mọi `updated_time` để suy ra tin khách mới; chỉ ghi nhận xem khi đúng hội thoại đã hiển thị; có trạng thái đang đồng bộ/lỗi và đối chiếu lại Meta.

### P1 — Tải tin cũ có thể trộn lịch sử hai khách

Nguồn: `src/components/inbox/CRMInbox.jsx:811`.

Handler tải thêm lịch sử không kiểm tra hội thoại hiện tại sau `await`. Tái hiện: tải tin cũ A, chuyển giao diện sang B, phản hồi A về muộn; state thành `[A-older, B-current]` và cache A chứa cả tin B.

Ảnh hưởng đã chứng minh là lẫn hiển thị/cache. Không có bằng chứng thao tác này tự gửi tin sang khách khác hoặc thay đổi lịch sử trên Meta.

Hướng sửa: gắn request ID và conversation ID cho mọi tải lịch sử; chỉ cập nhật UI/cursor khi vẫn đúng hội thoại; cập nhật cache từng hội thoại độc lập.

### P1 — Push lỗi tạm thời có thể mất luôn cơ hội gửi lại

Nguồn: `api/_lib/push.js:315`, `api/_lib/push.js:362`, `api/webhook.js:88`.

Message ID được ghi nhận chống trùng trước khi gửi. Webhook trả 200 dù tác vụ hoặc dịch vụ Push lỗi; không có hàng đợi thử lại riêng.

Tái hiện bằng dịch vụ Push giả trả 503: lần đầu `attempted=1/sent=0/failed=1`; gọi lại cùng sự kiện nhận `duplicate=true`, tổng số lần gửi vẫn là 1.

Hướng sửa: lưu trạng thái giao nhận theo sự kiện và thiết bị, retry có giới hạn/backoff cho lỗi tạm thời, giữ chống trùng với mục đã gửi thành công. TTL hiện là 60 giây; cần đánh giá cùng tình huống thiết bị mất mạng/ngủ, không chỉ kiểm tra đăng ký thành công.

### P2 — Gắn nhãn “Meta tự động” từ văn bản chưa được xác thực

Nguồn: `src/services/metaOutcomeState.js:44`, `src/components/inbox/CRMInbox.jsx:244`, `src/components/inbox/CustomerProfilePanel.jsx:133`.

Chỉ cần nội dung khớp “Đã thêm nhãn tự động: Đã đặt hàng”, hàm suy ra `ordered/meta_auto`, không kiểm tra người gửi hoặc dữ liệu sự kiện có cấu trúc. Tái hiện với một tin văn bản giả do khách gửi cho cùng kết quả. UI sau đó mô tả là đồng bộ nhãn tự động Meta.

Hướng sửa: lấy nhãn hiện tại từ nguồn Meta xác nhận; nếu chỉ suy luận từ transcript thì ghi rõ là suy luận và không coi đó là nhãn Meta đã xác nhận. Tránh để lịch sử văn bản cũ tự áp lại nhãn đã được gỡ.

### P2 — Lỗi tải bị diễn giải thành không có tin/chưa đọc

Nguồn: `src/services/facebookApi.js:469`, `src/services/facebookApi.js:518`.

Tái hiện: API trả lỗi quyền/token nhưng bảng tổng hợp trả tổng chưa đọc=0; API tải tin lỗi nhưng hàm trả `[]`, không ném lỗi. Với chat chưa có cache, giao diện không phân biệt được không có tin với không tải được tin.

Bảng quét chưa đọc chỉ đọc 30 hội thoại đầu mỗi Page, không phân trang hết. Đây chưa phải tổng toàn bộ Inbox.

Hướng sửa: giữ dữ liệu gần nhất khi lỗi, hiển thị lỗi theo Page và nút thử lại; thể hiện rõ phạm vi đã tải hoặc thực hiện phân trang có giới hạn tải hợp lý.

## Các điểm khác qua rà soát

| Khu vực | Kết quả và việc còn lại |
| --- | --- |
| Xử lý xong / Theo dõi | Code hiện lưu workflow cục bộ và thử đồng bộ nhãn tùy chỉnh. Không thực hiện chính thao tác Done/Follow up của Business Suite. Cần thể hiện khác biệt rõ ngay ở nút, không chỉ tooltip/toast. |
| Gửi chữ + ảnh | Đã có xử lý riêng khi chữ thành công nhưng ảnh lỗi: giữ tin chữ đã xác nhận, xóa chữ khỏi ô soạn và báo lỗi ảnh. Test hiện tại đạt; chưa gửi tin khách thật trong lượt này. |
| Đăng bài | Chỉ báo thành công khi có ID; giữ trạng thái kết quả chưa rõ khi timeout, hỏi trước khi retry; không tự đăng thử. Khi retry sau khi sửa nội dung/lịch, cần snapshot bài gốc hoặc xác nhận lại vì handler sử dụng state composer hiện tại. |
| Ads | Mở được màn hình. Có chặn phản hồi dashboard cũ và xác nhận đổi ngân sách. Tuy nhiên lỗi campaign/daily chỉ được log hoặc bỏ qua, nên khi đổi khoảng ngày có thể giữ số cũ dưới lựa chọn mới. Nên hiển thị trạng thái lỗi/cũ riêng từng khối. |
| Cache danh sách | Refresh thành công thay danh sách bằng lô đầu vừa tải; phần giữ cache chỉ dành cho Page thất bại. Cần giữ các trang lịch sử đã tải khi polling để không nhảy/rút danh sách. |
| Nhiều tab | Khóa hiện tại ngăn yêu cầu chạy đồng thời, chưa bảo đảm chỉ một tab polling suốt phiên; các tab có lịch lệch vẫn cùng gọi API. Cần cơ chế tab chủ hoặc cooldown chia sẻ. |
| Thông báo/âm thanh | Có định danh theo Page và hội thoại, chỉ phát hiện tin đến mới trong các luồng polling đã xem; Push payload có tên Page. Chưa kiểm chứng âm thanh/hiển thị vật lý hoặc toàn bộ tình huống chuyển app. |
| Quản trị và sao lưu | UI nói đúng: Supabase hiện dùng cho Push, chưa có đồng bộ cloud thiết lập. Bài mẫu/trả lời nhanh/cấu hình vẫn trên thiết bị; xuất/nhập file không tương đương DB đồng bộ đa thiết bị. |
| Gia cố endpoint Push | Validator chỉ kiểm tra HTTPS và độ dài khóa, chấp nhận cả URL HTTPS loopback với dữ liệu giả. Cần hạn chế đích gửi tới dịch vụ Push hợp lệ và kiểm tra khóa. Đây là phát hiện từ validator, chưa thử truy cập mạng nội bộ hay khai thác production. |
| Token trong Ads | Các hàm đọc Ads còn dùng token trên query URL và fetch không có timeout, khác với `safeFetch`. Nên chuẩn hóa Authorization header/timeout để giảm rủi ro lộ trong log và tránh loader treo. Không ghi token thật trong báo cáo. |

## Thứ tự xử lý đề xuất

1. Trạng thái đọc/chưa đọc và phạm vi từng Page; test thành công, từ chối, quá hạn, tin mới trong lúc chờ, nhiều thiết bị.
2. Chặn race khi chuyển chat và tải lịch sử; phân biệt lỗi tải với danh sách rỗng.
3. Độ tin cậy Push: retry theo thiết bị, quan sát giao nhận và test điện thoại khóa màn hình.
4. Nguồn nhãn, workflow và câu chữ đồng bộ; sau đó cache/polling, Ads, retry đăng bài.

Trước khi coi bản sửa hoàn tất cần bổ sung regression test cho các tình huống đã tái hiện, kiểm tra đúng bundle triển khai và thử một hội thoại kiểm thử được chủ tài khoản chỉ định. Không dùng “82 test qua” làm kết luận mọi luồng thực tế đã đúng.

## Kết quả bản sửa và triển khai

Đã triển khai production ngày 2026-08-28 với deployment `dpl_6nQoLA3XfjgFe84QmdGqU7Z5t57f` và alias `https://metapost-studio.vercel.app`.

- Trạng thái chưa đọc không còn bị mốc đọc cục bộ ghi đè. App chỉ xóa dấu chưa đọc sau khi gửi `mark_seen`, đọc lại trạng thái từ Meta và xác nhận không có tin mới tới trong lúc chờ.
- Thao tác “Xử lý trong app” không còn tự đánh dấu đã đọc hoặc được mô tả như thao tác Done của Business Suite.
- Tải lịch sử được ràng buộc theo conversation/request ID, tránh phản hồi chậm của khách A trộn vào khách B. Lỗi tải được hiển thị và có thể thử lại thay vì giả thành cuộc trò chuyện rỗng.
- Đọc hàng loạt chỉ áp dụng các hội thoại đang tải và chỉ giảm đúng Page được Meta xác nhận; mục lỗi hoặc có tin mới vẫn giữ chưa đọc.
- Không còn suy nhãn Meta từ câu chữ trong transcript. Chỉ dữ liệu nhãn có nguồn Meta có cấu trúc mới được coi là nhãn Meta; cache `meta_auto` cũ được loại khi hội thoại được nạp lại.
- Push giữ TTL 6 giờ. Khi toàn bộ lần gửi thất bại tạm thời, webhook trả lỗi có thể retry và nhả khóa chống trùng để lần Meta retry tiếp theo có thể gửi lại.

Bằng chứng tự động: `npm run check` đạt 93/93 test và production build thành công. Smoke test production trả home 200, bundle `assets/index-WzRHUNjM.js` 200, service worker 200, Push config 200/có cấu hình; API status và subscribe không xác thực trả 401, webhook xác minh sai trả 403.

Chưa dùng hội thoại khách thật để thử gửi/đọc và chưa kiểm chứng thông báo trên điện thoại thật khi khóa màn hình. Hai phần này vẫn cần một phép thử có kiểm soát trên thiết bị của chủ tài khoản; test tự động và HTTP probe không thay thế được bằng chứng vật lý đó.
