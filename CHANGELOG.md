# Nhật ký thay đổi

Tất cả thay đổi đáng chú ý của dự án được ghi lại trong file này.

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.5.11] — 2026-07-25

### Sửa lỗi
- **File trong reply/quote không được nhận diện (critical)** — `looksLikeExplicitFileObject` chưa nhận ra Zalo `quote.attach` file format có cấu trúc `{title, href, params}`. Cụ thể: field `params` là JSON string chứa `fileExt`/`fileSize`/`checksum` nhưng không được check. Field `title` chứa filename (ví dụ `hello-from-bun.md`) nhưng không có trong check list. Kết quả: URL từ `href` bị bỏ qua, file không được download.
  - `looksLikeExplicitFileObject`: thêm check `params` JSON string có chứa `"fileExt"`, `"fileSize"`, hoặc `"checksum"`; thêm check `title` có extension (`/\.[a-z0-9]{1,10}$/i`)
  - `mediaMimeFromObject`: detect `application/octet-stream` khi `params` JSON có `fileExt`/`fileSize`
  - File `hello-from-bun.md` và các file kèm trong reply giờ được download đúng
- **Diagnostic log** — giữ `quote.attach raw` log (đã thêm từ v2.5.10) để hỗ trợ debug các format Zalo mới trong tương lai

---

## [2.5.10] — 2026-07-25

### Sửa lỗi
- **Quoted file note false positive** — Fix v2.5.9 hiện note `[media unavailable]` cả khi reply vào tin nhắn text thường (không có file). Đã thêm kiểm tra: chỉ hiện note khi `attach` object thực sự chứa fields như `fileUrl`, `href`, `url`, `hdUrl`, `normalUrl`, `oriUrl`, `thumbUrl`, `fileName` (dấu hiệu của media/file thật).

---

## [2.5.9] — 2026-07-25

### Sửa lỗi
- **file-downloader: Zalo CDN auth** — `file-downloader.ts` trước đây detect Zalo CDN nhưng không gửi auth cookies khi tải file, khiến CDN trả lỗi (404/403) cho các file attachment (PDF, PPTX, DOCX, CSV...). Giờ dùng cùng pattern với `image-downloader.ts`: load Zalo session cookies từ credentials và gửi trong header `Cookie` khi URL là Zalo CDN. File attachment trong DM và group mention giờ tải được đúng.
- **Quoted file unavailable note** — Khi `quote.attach` có dữ liệu nhưng không extract được URL nào (expired CDN, format không hỗ trợ), agent giờ nhận được note rõ ràng: `[media unavailable — Zalo CDN URL may have expired]` thay vì im lặng. Agent biết file đã có nhưng không accessible để phản hồi phù hợp với user.

---

## [2.5.6] — 2026-07-18

### Sửa lỗi
- **Build regression (critical)**: Bản v2.5.5 chỉ chạy `tsc --noEmit` mà không rebuild `dist/index.js` — plugin vẫn chạy code cũ, fix fileUrl không có hiệu lực. Giờ đã build lại đúng.
- **Quoted image/file**: Khi user quote một tin nhắn ảnh trong Zalo rồi nhắn thêm text, bot không thấy ảnh được quote. Root cause: `data.quote.attach` chứa JSON với URL ảnh nhưng không được map vào `ZaloClawMessage.quote` và không được download.
  - `ZaloClawMessage.quote`: thêm field `attach?: string`
  - `convertToZaloClawMessage`: map `data.quote.attach` vào `message.quote.attach`
  - `processMessage`: parse `quote.attach`, extract media URLs qua `extractMediaFromObject`, merge vào `message.mediaUrls` để download cùng message chính
  - Context hiển thị `[Replying to X: "..." [with media]]` khi quote có ảnh/file

## [2.5.5] — 2026-07-18

### Sửa lỗi
- **File attachments (Issue #22)**: Khi user gửi file (PPTX, PDF, DOCX, CSV...) qua Zalo DM, bot chỉ nhận được filename dạng plain text hoặc raw JSON — không có URL download, không thể xử lý file.
  - Root cause: Zalo `share.file` protocol dùng field `fileUrl` cho download URL, nhưng `extractMediaFromObject` chỉ tìm `href`/`url` → bỏ qua hoàn toàn
  - `extractMediaFromObject`: thêm `fileUrl` là URL candidate đầu tiên (priority: `fileUrl` → `href` → `url`)
  - `mediaMimeFromObject`: detect `fileUrl`/`extention` fields = `application/octet-stream`; type codes số (vd: `2`) không còn bị bỏ sót
  - `looksLikeExplicitFileObject`: `fileUrl` presence là evidence đủ mạnh để treat object là file attachment
  - Display text: file messages giờ hiển thị `[File: tên.pptx (1234 KB)]` thay vì JSON thô hay rỗng
  - Agent body context: sau khi download, non-image file paths được inject vào body: `[Downloaded file attachment(s) — use file path(s) below to read/analyze: /path/to/file]`
  - Rename `shouldProcessImages` → `shouldProcessMedia` (accuracy, không thay đổi behavior)

## [2.5.4] — 2026-07-17

### Sửa lỗi
- **Quote media parsing**: Parse `msg.data.content` thành object đúng cách khi `msgType` là `chat.photo`, `chat.gif`, `chat.video.msg`, `share.file` — trước đây truyền JSON string thô vào `extractMediaFromObject` thay vì parsed object, khiến ảnh trong quoted message không được nhận dạng

## [2.5.3] — 2026-07-17
### Sửa lỗi
- **Quote-reply (critical)**: `msgType` được lưu đúng dạng string (`"chat.photo"`, `"webchat"`...) thay vì luôn là `0` — quote ảnh/sticker/file giờ hoạt động đúng
- **Quote content**: Pass object trực tiếp cho `SendMessageQuote.content` thay vì `JSON.stringify` — tránh double-encode làm hỏng payload
- **Image debug**: Thêm logging để trace CDN cookie usage và response status khi download ảnh từ Zalo CDN
- **Type fix**: `ZaloClawMessage.rawMsgType` đổi từ `number` sang `string` cho đúng với `TMessage["msgType"]` của zca-js

## [2.5.1] — 2026-07-17
### Thêm mới
- **stop-channel** / **start-channel** / **restart-channel** — kiểm soát kênh ZaloClaw trực tiếp từ agent tool mà không cần vào server
- **self-update** — tự pull code mới nhất từ GitHub, rebuild và hot-reload gateway

## [2.5.0] — 2026-07-17

### Sửa lỗi
- **quote-reply**: Preserve `rawContent` và `rawMsgType` qua toàn bộ pipeline — trước đây `cacheInboundMessage()` luôn dùng `rawMsgType = 0` và content xử lý thay vì content gốc, khiến quote reply với ảnh bị sai
- **image-downloader**: Truyền Zalo session cookies (từ credentials) khi fetch ảnh từ CDN Zalo — trước đây dùng `safeFetch` plain không có auth, CDN trả về trang HTML lỗi nên magic bytes validator reject; thêm fallback `thumbUrl` trong `extractMediaFromObject()`

### Tính năng mới
- **Bridge service v1**: Expose `globalThis.__zaloclawBridgeService` khi plugin register — cho phép các plugin OpenClaw khác gọi ZaloClaw actions programmatically mà không cần model turns

---

## [2.4.5] — 2026-07-09

### Tài liệu
- **CHANGELOG**: Bổ sung đầy đủ entries cho v2.4.1–v2.4.4 — trước đó bị bỏ sót trong quá trình release nhanh
- **openclaw.plugin.json / package.json**: Xác nhận đồng nhất toàn bộ `version`, `compat.pluginApi`, `minGatewayVersion` — tất cả đều là `2.4.5` / `>=2026.5.7`

---

## [2.4.4] — 2026-07-09

### Sửa lỗi
- **package.json / openclaw.plugin.json**: Đồng bộ `minGatewayVersion` lên `>=2026.5.7` — trước đây vẫn ghi `>=2026.2.0` trong khi README/guide đã nói `>=2026.5.7`. Lỗi được phát hiện bởi bé Mi (Ươm Mầm) trong quá trình review tài liệu.

---

## [2.4.3] — 2026-07-09

### Tài liệu
- **docs/guide.md**: Thêm hướng dẫn cài đặt & cấu hình chi tiết từ zero — prerequisites, QR login, config đầy đủ, passive collector, group events, injection guard, troubleshooting

---

## [2.4.2] — 2026-07-09

### Tài liệu (tái cấu trúc)
- **Xóa**: `TOOLS.md`, `docs/FEATURES.md`, `docs/agent-help.md`, `docs/agent-install.md` — ~3500 dòng nội dung chồng chéo và lỗi thời
- **Viết lại**: `README.md` — gọn ~180 dòng, cập nhật cho v2.4.x, link đến docs mới
- **Thêm**: `docs/actions.md` — reference đầy đủ 151 actions theo nhóm, có params và ví dụ
- **Sửa**: `CONTRIBUTING.md` — URL sai (`monasprox` → `monas-team`), rút gọn
- **Sửa**: Số lượng action: 147 → 151 (bao gồm `recall-group-history`, `list-passive-groups` và các action mới)

---

## [2.4.1] — 2026-07-09

### Sửa lỗi (manifest)
- **openclaw.plugin.json**: Xóa `esUrl` khỏi `passiveCollector` config schema — ES không còn dùng từ v2.4.0
- **openclaw.plugin.json**: Cập nhật mô tả `passiveCollector` sang JSONL file storage
- **openclaw.plugin.json**: Thêm `activation.onStartup: true` theo yêu cầu docs OpenClaw
- **openclaw.plugin.json**: Thêm `compat` field
- **Install ledger**: Cập nhật version metadata lên 2.4.x

---

## [2.4.0] — 2026-07-09

### Thay đổi lớn (Breaking-free refactor)
- **passive-collector**: Loại bỏ hoàn toàn phụ thuộc Elasticsearch — giờ lưu vào file JSONL local
  - Storage: `~/.openclaw/workspace/zaloclaw/passive/{groupId}.jsonl`
  - Format: text-visible, một JSON record mỗi dòng — đọc được bằng bất kỳ text editor / CLI tool
  - Portable: hoạt động trên mọi OpenClaw install, không cần ES hay biến môi trường đặc biệt
- **tool**: Thêm 2 action mới cho `zaloclaw` tool:
  - `recall-group-history` — đọc lịch sử nhóm từ JSONL log (hỗ trợ `query`, `count`, `groupId`)
  - `list-passive-groups` — liệt kê tất cả nhóm đang được ghi passive log
- **monitor.ts**: `collectGroupMessage()` giờ là synchronous file append — không còn `await` + `.catch()`

### Sửa lỗi
- Xóa env var `OPENCLAW_ES_URL` / `ES_URL` không còn cần thiết
- Passive log không còn phụ thuộc epistemic plugin

## [2.3.0] — 2026-07-09

### Sửa lỗi
- **passive-collector**: `ES_URL` nay có thể cấu hình qua env var `OPENCLAW_ES_URL` hoặc `ES_URL` (fallback `http://localhost:19200`) — trước đây hardcoded
- **injection-guard**: `autoRemove` mặc định `false` — chỉ cảnh báo, không tự động xóa thành viên khỏi nhóm; cần bật rõ ràng qua config
- **monitor.ts**: Thêm null-guard cho `threadId`/`groupId` — tránh crash khi zca-js không gửi `groupId` trong một số loại sự kiện (recall, system events)
- **openclaw.plugin.json**: Thêm `passiveCollector` và `injectionGuard` vào `configSchema`

### Bảo mật
- **url-validator.ts**: Document rõ giới hạn TOCTOU của DNS rebinding validation
- **injection-guard.ts**: `autoRemove` mặc định `false` ngăn xóa thành viên ngoài ý muốn

### Tài liệu
- **README**: Thêm note quan trọng — sau khi cài plugin lần đầu, cần restart OpenClaw VÀ mở session chat mới (fixes issue #20)
- **README**: Cập nhật yêu cầu OpenClaw lên `>= 2026.5.7`
- **README**: Cập nhật version badge lên v2.3.0

### Yêu cầu
- OpenClaw >= 2026.5.7

---

## [2.1.2] — 2026-06-11

### Sửa lỗi
- **CRITICAL**: Thêm `openclaw.channel` vào `package.json` — thiếu field này khiến plugin bị bỏ qua hoàn toàn khỏi channel catalog, dẫn đến `channels login` luôn fail với "Unsupported channel" dù đã install đúng cách

## [2.1.1] — 2026-06-11

### Tài liệu
- **README**: Viết lại hoàn toàn hướng dẫn cài đặt — 3 cách (ClawHub / npm / clone) cả EN lẫn VI
- **Hướng dẫn QR**: Thêm bước quét QR (`Zalo app → trang cá nhân → icon QR`) và bước xác nhận sau login
- **VI**: Bổ sung Cách 2 (npm) còn thiếu, Cách 3 (clone) đúng thứ tự 4 bước
- **Troubleshooting**: Rõ hơn về `channels login` error và session expired

## [2.1.0] — 2026-06-11

### Cải thiện
- **README**: Thêm English section (bilingual EN+VI) — language toggle, quick-start, troubleshooting
- **Channels login**: Document lỗi `Unsupported channel` và workaround (`openclaw setup`) cho mọi phiên bản OpenClaw
- **Install flow**: Làm rõ `openclaw plugins install --link` là bắt buộc trước `channels login`; cập nhật cả cách 1 (ClawHub) và cách 2 (manual)
- **openclaw.plugin.json**: Thêm `name`, `description`, `version`, `kind`, `homepage` cho catalog discoverability
- **package.json**: Thêm `files`, `publishConfig`, `prepublishOnly` cho npm release; thêm keywords `openclaw-plugin`, `openclaw-channel`

## [2.0.4] — 2026-06-10

### Sửa lỗi
- **CI**: Fix `tsc` step exit code — dùng `continue-on-error` cho SDK version mismatch
- **README**: Redesign với centered header, ClawHub install, disclaimer, table of contents
- **Metadata**: Thêm ClawHub compat metadata, sửa repo URL sang `monas-team`

## [2.0.3] — 2026-04-15

### Sửa lỗi — API contract audit (18 bugs)

#### 🔴 Critical
- **`api.undo()`**: sửa gọi sai 2–3 params → đúng 1 param (`tool.ts`, `auto-unsend.ts`)
- **`addGroupBlockedMember` / `removeGroupBlockedMember`**: sửa thứ tự params ngược `(gid, uid)` → `(uid, gid)` (`tool.ts`)

#### 🔴 High
- **`updateProfile`**: thêm wrapper `{ profile: {...} }` bắt buộc + fetch profile hiện tại trước khi partial update (`tool.ts`)
- **`last-online`**: đổi từ `getUserInfo()` (luôn trả undefined) sang `api.lastOnline(uid)` đúng API (`tool.ts`)
- **`createProductCatalog`**: sửa 3 field names sai: `name`→`productName`, `desc`→`description`, `imageUrl`→`product_photos` (`tool.ts`)
- **`updateProductCatalog`**: sửa field names + thêm `catalogId`, `createTime` required fields (`tool.ts`)
- **`changeAccountAvatar`**: download URL → temp file trước khi gọi API (chỉ nhận local path/Buffer) (`tool.ts`)
- **`changeGroupAvatar`**: download URL → Buffer object trước khi gọi API (`tool.ts`)

#### 🟡 High
- **`forward-message`**: bỏ `msgId` field không tồn tại trong `ForwardMessagePayload`, document limitation (`tool.ts`)
- **DM `senderId` fallback**: thêm guard `rawSenderId.trim()` + warn log khi fallback xảy ra — chặn denyFrom bypass (`monitor.ts`)

#### 🟡 Medium
- **`undo-friend-request`**: bỏ fallback `removeFriend` nguy hiểm, chỉ dùng `undoFriendRequest` official API (`tool.ts`)
- **`getPollDetail`**: cast `pollId` sang string đúng docs: `String(p.pollId)` (`tool.ts`)
- **`getCurrentUid()` null safety**: fallback sang `api.getOwnId()` sync tại mention detection + listener startup (`monitor.ts`)
- **`getBizAccount`**: bỏ param `uid` (API không nhận params) (`tool.ts`)

#### 🟢 Low
- **`join-group-link`**: wrap `getGroupLinkInfo` trong try/catch riêng, không block `joinGroupLink` nếu throw (`tool.ts`)
- **`delete-chat`**: thêm comment document limitation empty `cliMsgId`/`globalMsgId` (`tool.ts`)
- **Tool description**: cập nhật "130 actions" → "147 actions" trong `index.ts`

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
- **`docs/agent-install.md`**: thêm Bước 0 kiểm tra plugin hiện có (bắt buộc xác nhận với owner trước khi gỡ), cấu trúc thư mục chuẩn, hướng dẫn migration từ plugin cũ, và debug guide 6 bước (status, logs, registration, config, credentials, lockfile)

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

## [2.2.0] — 2026-07-08

### Tương thích
- **Fix import paths cho OpenClaw 2026.5.7**: `openclaw/plugin-sdk/zalouser` không còn export `OpenClawConfig`, `MarkdownTableMode`, `RuntimeEnv` — di chuyển sang `plugin-sdk/config-runtime` và `plugin-sdk/runtime`
- **Thêm `contracts.tools`** vào `openclaw.plugin.json` — bắt buộc để expose `zaloclaw` tool ra agent sessions (OpenClaw ≥2026.5)

### Sửa lỗi
- **Group reply via outbound**: `outbound.sendText/sendMedia` luôn dùng `ThreadType.User` — tin nhắn vào group ID bị gửi nhầm DM. Fix: thêm `group-id-cache.ts` — khi nhận message từ group thì cache group ID, outbound tự detect `isGroup`
- **Typing keepalive**: thêm `setInterval` 3s ngay sau khi nhận message để cover khoảng thời gian model setup (gap giữa first typing event và typing keepalive)
- **Reaction fallback**: thêm `lookupCliMsgId()` fallback khi `message.cliMsgId` vắng mặt trong DM events
- **`ackReactionScope`**: đổi default thành `all` để reaction fire cả DM lẫn group

### Đã xác minh
- TypeScript typecheck: **pass** (0 errors)
- Test suite: **104/104 passed**
- Tương thích: OpenClaw 2026.5.7, Node.js 22+, zca-js 2.1.2

---

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
