# Nhật ký thay đổi

Tất cả thay đổi đáng chú ý của dự án được ghi lại trong file này.

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.2] — 2026-04-15

### Sửa lỗi
- **Media scoping**: sửa lỗi reply-scoped media binding — agent không còn lấy ảnh từ buffer chung của group (cross-message media contamination). Giờ chỉ resolve ảnh từ message hiện tại và reply target
- **CI**: tạo lại `package-lock.json` bằng npm 10 để fix `npm ci` failed (thiếu `opusscript@0.0.8`)

### Tái cấu trúc
- **Đổi tên dự án**: `opclaw-zalo` → `zaloclaw` trên toàn bộ codebase (package.json, imports, logs, configs, docs)

### Tài liệu
- Dịch toàn bộ tài liệu và templates sang tiếng Việt (README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue templates)
- Thêm `docs/agent-help.md` — hướng dẫn toàn diện cho agent
- Thêm `TOOLS.md` — tham chiếu nhanh danh sách tools

## [2.0.1] — 2026-04-14

### Sửa lỗi
- **CI**: tạo lại `package-lock.json` bằng npm 10 để khắc phục lỗi `npm ci` (`opusscript@0.0.8` thiếu trong lock file)

### Bảo mật
- **Phòng chống SSRF**: wrapper `safeFetch` mới kiểm tra tất cả URL gửi đi — chặn IP nội bộ/riêng tư (IPv4 + IPv6), thông tin đăng nhập nhúng, scheme không phải HTTP, và DNS rebinding qua phân giải hostname
- **Phòng chống path traversal**: `enforceSandboxPath` áp dụng kiểm tra chứa lexical + xác minh symlink; tất cả thao tác thread giới hạn trong `~/.openclaw/workspace/threads/`
- **Whitelist truy cập file local**: `validateLocalFilePath` giới hạn thao tác file trong `~/.openclaw/workspace/`, `~/.openclaw/media/`, và thư mục temp hệ thống
- **Bảo mật credentials**: thông tin đăng nhập lưu trữ được ghi với quyền `0600`; thư mục tạo với quyền `0700`
- **Lọc đầu ra**: giảm độ dài tối thiểu secret từ 20 → 8 ký tự; regex patterns tạo mới mỗi lần gọi để tránh race condition `lastIndex`
- **Sửa race condition**: `getApi()` sử dụng promise memoization để tránh đăng nhập trùng lặp đồng thời
- **An toàn tải ảnh**: tên file dạng hash, phần mở rộng whitelist, giới hạn 20 MB, xác minh chứa path
- **Cô lập QR code**: file temp duy nhất mỗi lần gọi (`crypto.randomBytes`) với quyền `0600`
- **Sanitize Thread ID**: chỉ ASCII chữ-số/gạch ngang/gạch dưới, tối đa 100 ký tự

### Thay đổi
- **TypeScript strict mode** bật (`tsconfig.json`)
- **Xác thực tham số tool**: tất cả đường dẫn file local và URL gửi đi được kiểm tra qua các module safety

### Thêm mới
- `src/safety/url-validator.ts` — fetch an toàn SSRF với kiểm tra IP, phân giải DNS, timeout, và giới hạn kích thước
- `src/types/vendor.d.ts` — khai báo kiểu cho `qrcode-terminal`, `jsqr`, và `pngjs`
- Framework test (vitest) với 63 test bảo mật và regression trên 5 file test
- `validateLocalFilePath`, `enforceSandboxPath`, `cleanupOldSandboxes` trong thread-sandbox
- `isPrivateIp`, `validateUrlForOutboundFetch`, `safeFetch` trong url-validator

### Sửa lỗi
- `isLocalFilePath` trong `send.ts` không còn khớp URL chứa chuỗi con giống path — giờ chỉ khớp đường dẫn hệ thống file thực

## [2.0.0] — 2026-04-14

### Thay đổi
- **Tái cấu trúc dự án**: sắp xếp lại `src/` thành các module theo domain (`channel/`, `client/`, `config/`, `tools/`, `parsing/`, `safety/`, `runtime/`, `features/`)
- **Báo cáo trạng thái**: `collectStatusIssues` giờ đồng bộ — sửa crash trong `openclaw status` khi core spread giá trị async
- **Xử lý hình ảnh**: ảnh trong nhóm chỉ được xử lý khi bot được @mention; ảnh không mention được đệm cho ngữ cảnh sau

### Sửa lỗi
- `collectStatusIssues` trả về `Promise` (async) nhưng core mong đợi sync `StatusIssue[]` — gây `TypeError: Spread syntax requires ...iterable[Symbol.iterator]`
- Tin nhắn chỉ có ảnh trong nhóm bypass mention gate qua kiểm tra `!hasMedia` — bot phản hồi mọi ảnh bất kể @mention
- Quét trạng thái báo "chưa đăng nhập" ngay cả khi bot đang hoạt động — `collectStatusIssues` chạy trong tiến trình CLI nơi `apiInstance` luôn null; giờ kiểm tra credentials trên đĩa thay thế

### Thêm mới
- `README.md` với tài liệu đầy đủ
- `LICENSE` (MIT)
- `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
- `.editorconfig`, `.github/` templates và CI workflow
- `.gitignore` toàn diện

## [1.0.0] — 2026-04-13

### Thêm mới
- Phát hành đầu tiên với tên `zaloclaw` (đổi tên từ `zalo-personal`)
- Tích hợp đầy đủ tài khoản Zalo cá nhân qua zca-js v2.1.2
- 130+ agent tool actions (nhắn tin, bạn bè, nhóm, bình chọn, nhắc nhở, hồ sơ, danh mục sản phẩm, v.v.)
- Luồng đăng nhập QR code với lưu trữ credentials tự động
- Mention gating nhóm với cấu hình theo nhóm
- Chính sách truy cập DM: open, pairing, allowlist, disabled
- Tính năng: reaction-ack, quote-reply, read-receipts, hỗ trợ sticker, auto-unsend, message buffering
