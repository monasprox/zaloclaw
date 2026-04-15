# zaloclaw — Agent Help (Hướng dẫn dành cho AI Agent)

> **Mục đích:** File này là tài liệu chuẩn để AI agent đọc và hiểu cách sử dụng toàn bộ công cụ của zaloclaw. Agent PHẢI đọc file này khi bắt đầu session mới hoặc sau mỗi lần restart/update.

---

## ⚡ Quy trình bắt buộc khi Agent khởi động

**Mỗi khi được khởi tạo hoặc restart, agent phải thực hiện:**

1. **Đọc file này** (`docs/agent-help.md`) để nắm toàn bộ cách sử dụng công cụ
2. **Đọc file `TOOLS.md`** (nếu có, tại root hoặc `docs/`) để xem ghi chú cập nhật mới nhất
3. **Ghi nhớ** rằng plugin chỉ cung cấp **1 tool duy nhất** tên `zaloclaw` với 147 actions
4. **Xác nhận** trạng thái đăng nhập bằng action `status` trước khi thao tác

### Lưu kiến thức để không quên sau restart

Agent PHẢI tự ghi lại kiến thức vào một trong các nơi sau để nhớ cách dùng:

| Phương pháp | Cách thực hiện |
|-------------|---------------|
| **store_memory** (ưu tiên) | Dùng tool `store_memory` để lưu các fact quan trọng về cách dùng zaloclaw |
| **TOOLS.md** | Tạo/cập nhật file `TOOLS.md` tại root repo với ghi chú ngắn gọn về tools đã dùng |
| **Context file** | Nếu dùng trong OpenClaw, ghi vào file context của agent session |

**Ví dụ store_memory:**
```
subject: "zaloclaw tools"
fact: "zaloclaw is a single tool with 147 actions. Call with {action: 'action-name', ...params}. Names auto-resolve to IDs."
```

---

## 📋 Tổng quan Plugin

- **Tên tool:** `zaloclaw`
- **Mô tả:** OpenClaw channel plugin kết nối tài khoản Zalo cá nhân qua zca-js
- **Số lượng actions:** 147
- **Cách gọi:** Truyền object JSON với field `action` + các params tương ứng
- **Tự động phân giải:** Tên người dùng / tên nhóm → Zalo numeric ID (không cần nhớ số)

### Cấu trúc gọi tool

```json
{
  "action": "tên-action",
  "threadId": "ID hoặc tên người/nhóm",
  "isGroup": true/false,
  ...các params khác
}
```

### Quy tắc chung

- `threadId` = ID người nhận (DM) hoặc ID nhóm — có thể dùng **tên hiển thị**, plugin tự phân giải
- `isGroup` = `true` nếu gửi vào nhóm, `false` nếu DM
- `userId` — có thể dùng tên hiển thị, plugin tự tra cứu trong danh sách bạn bè
- `groupId` — có thể dùng tên nhóm, plugin tự tra cứu
- Kết quả trả về luôn có dạng JSON object
- Khi lỗi, kết quả có `{ error: true, message: "..." }`

---

## 🔧 Danh sách toàn bộ Actions (147)

### 1. Nhắn tin — Messaging (16 actions)

#### `send` — Gửi tin nhắn văn bản
```json
{
  "action": "send",
  "threadId": "user_id_or_name",
  "message": "Nội dung tin nhắn",
  "isGroup": false,
  "urgency": 0,
  "messageTtl": 0
}
```
| Param | Bắt buộc | Mô tả |
|-------|----------|-------|
| `threadId` | ✅ | ID hoặc tên người/nhóm nhận |
| `message` | ✅ | Nội dung tin nhắn |
| `isGroup` | ✅ | `true` = nhóm, `false` = DM |
| `urgency` | ❌ | `0` = bình thường, `1` = quan trọng (tin quan trọng), `2` = khẩn cấp |
| `messageTtl` | ❌ | Thời gian tự xóa (ms): `60000` = 1 phút, `3600000` = 1 giờ |

#### `send-styled` — Gửi tin có định dạng rich text
```json
{
  "action": "send-styled",
  "threadId": "123456",
  "message": "**Chào bạn**, đây là tin *quan trọng*",
  "isGroup": false,
  "urgency": 1
}
```
Markdown hỗ trợ: `**bold**`, `*italic*`, `__underline__`, `~~strike~~`

Hoặc dùng `styles` array cho màu sắc:
```json
{
  "action": "send-styled",
  "threadId": "123456",
  "message": "Cảnh báo: hệ thống quá tải",
  "styles": [
    { "start": 0, "len": 9, "st": "b" },
    { "start": 0, "len": 9, "st": "c_FF0000" }
  ],
  "isGroup": false
}
```
Style codes: `b` = bold, `i` = italic, `u` = underline, `s` = strikethrough, `c_HEX` = màu

#### `send-link` — Gửi link có preview
```json
{ "action": "send-link", "threadId": "123456", "url": "https://example.com", "isGroup": false }
```

#### `send-image` — Gửi ảnh (URL hoặc local path)
```json
{ "action": "send-image", "threadId": "123456", "url": "https://example.com/photo.jpg", "message": "Caption", "isGroup": false }
```

#### `send-file` — Gửi file (PDF, doc, bất kỳ)
```json
{ "action": "send-file", "threadId": "123456", "filePath": "/path/to/file.pdf", "isGroup": false }
```
Hoặc từ URL:
```json
{ "action": "send-file", "threadId": "123456", "url": "https://example.com/report.pdf", "isGroup": false }
```

#### `send-video` — Gửi video
```json
{ "action": "send-video", "threadId": "123456", "url": "https://example.com/video.mp4", "thumbnailUrl": "https://example.com/thumb.jpg", "isGroup": false }
```

#### `send-voice` — Gửi tin nhắn thoại
```json
{ "action": "send-voice", "threadId": "123456", "voiceUrl": "https://example.com/audio.mp3", "isGroup": false }
```

#### `send-sticker` — Gửi sticker Zalo
Theo keyword (tự tìm và gửi):
```json
{ "action": "send-sticker", "threadId": "123456", "keyword": "vui", "isGroup": false }
```
Theo ID (nếu đã biết):
```json
{ "action": "send-sticker", "threadId": "123456", "stickerId": 12345, "stickerCateId": 678, "isGroup": false }
```

#### `send-card` — Gửi danh thiếp liên hệ
```json
{ "action": "send-card", "threadId": "123456", "userId": "target_user_id", "isGroup": false }
```

#### `send-bank-card` — Gửi thẻ ngân hàng
```json
{ "action": "send-bank-card", "threadId": "123456", "binBank": "970436", "numAccBank": "1234567890", "nameAccBank": "NGUYEN VAN A", "isGroup": false }
```

#### `send-typing` — Hiển thị trạng thái đang nhập
```json
{ "action": "send-typing", "threadId": "123456", "isGroup": false }
```

#### `send-to-stranger` — Gửi tin nhắn cho người lạ (chưa kết bạn)
```json
{ "action": "send-to-stranger", "userId": "stranger_id", "message": "Xin chào!" }
```
> ⚠️ Có thể không được nhận nếu người lạ chặn tin từ người lạ.

#### `forward-message` — Chuyển tiếp tin nhắn
```json
{ "action": "forward-message", "msgId": "original_msg_id", "threadIds": ["thread1", "thread2"], "message": "FYI", "messageTtl": 0 }
```

#### `delete-message` — Xóa tin nhắn
```json
{ "action": "delete-message", "msgId": "msg_id", "threadId": "123456", "isGroup": false, "onlyMe": false }
```
- `onlyMe: true` = chỉ xóa phía mình, `false` = xóa cho tất cả (trong 24h)

#### `undo-message` — Thu hồi (recall) tin nhắn đã gửi
```json
{ "action": "undo-message", "msgId": "msg_id", "threadId": "123456" }
```

#### `add-reaction` — Thả reaction vào tin nhắn
```json
{ "action": "add-reaction", "msgId": "msg_id", "icon": "heart", "threadId": "123456", "isGroup": false }
```
Icon hỗ trợ: `heart` ❤️, `like` 👍, `haha` 😆, `wow` 😮, `cry` 😢, `angry` 😠, `none` (xóa reaction)

> Plugin tự tra cứu `cliMsgId` từ bộ nhớ. Nếu tin nhắn cũ hơn lúc bot khởi động, cần cung cấp `cliMsgId` thủ công.

---

### 2. Bạn bè — Friends (16 actions)

#### `friends` — Danh sách bạn bè
```json
{ "action": "friends", "query": "Nguyễn" }
```
Trả về: `{ friends: [{userId, displayName, zaloName, avatar, phoneNumber}], count }`

#### `find-user` — Tìm người dùng theo SĐT
```json
{ "action": "find-user", "phoneNumber": "0912345678" }
```
Trả về đầy đủ: `userId`, `displayName`, `zaloName`, `avatar`, `cover`, `gender`, `dob`, `status`, `globalId`

#### `find-user-by-username` — Tìm theo username Zalo
```json
{ "action": "find-user-by-username", "username": "nguyenvana" }
```

#### `send-friend-request` — Gửi lời mời kết bạn
```json
{ "action": "send-friend-request", "userId": "user_id_or_name", "requestMessage": "Xin chào!" }
```

#### `get-friend-requests` — Xem lời mời kết bạn đã nhận
```json
{ "action": "get-friend-requests" }
```

#### `accept-friend-request` — Chấp nhận lời mời
```json
{ "action": "accept-friend-request", "userId": "user_id" }
```

#### `reject-friend-request` — Từ chối lời mời
```json
{ "action": "reject-friend-request", "userId": "user_id" }
```

#### `get-sent-requests` — Xem lời mời đã gửi
```json
{ "action": "get-sent-requests" }
```

#### `undo-friend-request` — Hủy lời mời đã gửi
```json
{ "action": "undo-friend-request", "userId": "user_id" }
```

#### `unfriend` — Hủy kết bạn
```json
{ "action": "unfriend", "userId": "user_id_or_name" }
```

#### `check-friend-status` — Kiểm tra trạng thái bạn bè
```json
{ "action": "check-friend-status", "userId": "user_id" }
```
Trả về: `{ userId, isFriend, isRequested, isRequesting }`

#### `set-friend-nickname` — Đặt biệt danh cho bạn
```json
{ "action": "set-friend-nickname", "userId": "user_id", "nickname": "Bạn thân" }
```

#### `remove-friend-nickname` — Xóa biệt danh
```json
{ "action": "remove-friend-nickname", "userId": "user_id" }
```

#### `get-online-friends` — Bạn bè đang online
```json
{ "action": "get-online-friends" }
```

#### `get-close-friends` — Danh sách bạn thân
```json
{ "action": "get-close-friends" }
```

#### `get-friend-recommendations` — Gợi ý kết bạn
```json
{ "action": "get-friend-recommendations" }
```

---

### 3. Nhóm — Groups (22+ actions)

#### `groups` — Danh sách nhóm
```json
{ "action": "groups", "query": "Team dev" }
```

#### `get-group-info` — Thông tin chi tiết nhóm
```json
{ "action": "get-group-info", "groupId": "group_id_or_name" }
```
Trả về: `groupId`, `name`, `desc`, `totalMember`, `memberIds`, `creatorId`, `adminIds`

#### `create-group` — Tạo nhóm mới
```json
{ "action": "create-group", "groupName": "Nhóm dự án", "memberIds": ["user1", "user2", "user3"] }
```

#### `add-to-group` — Thêm thành viên
```json
{ "action": "add-to-group", "groupId": "group_id", "memberIds": ["user1", "user2"] }
```

#### `remove-from-group` — Xóa thành viên
```json
{ "action": "remove-from-group", "groupId": "group_id", "userId": "user_id" }
```

#### `leave-group` — Rời nhóm
```json
{ "action": "leave-group", "groupId": "group_id" }
```

#### `rename-group` — Đổi tên nhóm
```json
{ "action": "rename-group", "groupId": "group_id", "groupName": "Tên mới" }
```

#### `add-group-admin` / `remove-group-admin` — Quản lý admin
```json
{ "action": "add-group-admin", "groupId": "group_id", "userId": "user_id" }
{ "action": "remove-group-admin", "groupId": "group_id", "userId": "user_id" }
```

#### `change-group-owner` — Chuyển quyền trưởng nhóm
```json
{ "action": "change-group-owner", "groupId": "group_id", "userId": "new_owner_id" }
```

#### `disperse-group` — Giải tán nhóm ⚠️ KHÔNG THỂ HOÀN TÁC
```json
{ "action": "disperse-group", "groupId": "group_id" }
```

#### `update-group-settings` — Cập nhật cài đặt nhóm
```json
{
  "action": "update-group-settings",
  "groupId": "group_id",
  "groupSettings": {
    "blockName": true,
    "signAdminMsg": true,
    "enableMsgHistory": true,
    "joinAppr": true,
    "lockCreatePost": false,
    "lockCreatePoll": false,
    "lockSendMsg": false,
    "lockViewMember": false
  }
}
```

| Setting | Mô tả |
|---------|-------|
| `blockName` | Khóa đổi tên nhóm |
| `signAdminMsg` | Hiện badge admin |
| `setTopicOnly` | Chỉ admin đặt topic |
| `enableMsgHistory` | Thành viên mới xem tin cũ |
| `joinAppr` | Duyệt trước khi vào nhóm |
| `lockCreatePost` | Khóa tạo bài viết |
| `lockCreatePoll` | Khóa tạo bình chọn |
| `lockSendMsg` | Khóa gửi tin nhắn |
| `lockViewMember` | Khóa xem danh sách thành viên |

#### Link nhóm
```json
{ "action": "enable-group-link", "groupId": "group_id" }
{ "action": "disable-group-link", "groupId": "group_id" }
{ "action": "get-group-link", "groupId": "group_id" }
```

#### Duyệt thành viên chờ
```json
{ "action": "get-pending-members", "groupId": "group_id" }
{ "action": "review-pending-members", "groupId": "group_id", "memberIds": ["user1"], "isApprove": true }
```

#### Chặn thành viên trong nhóm (Zalo-level)
```json
{ "action": "block-group-member", "groupId": "group_id", "userId": "user_id" }
{ "action": "unblock-group-member", "groupId": "group_id", "userId": "user_id" }
{ "action": "get-group-blocked", "groupId": "group_id" }
```

#### Thông tin thành viên chi tiết
```json
{ "action": "get-group-members-info", "groupId": "group_id" }
```

#### Tham gia nhóm qua link
```json
{ "action": "join-group-link", "link": "https://zalo.me/g/xxxxxx" }
```

#### Mời / Quản lý lời mời nhóm
```json
{ "action": "invite-to-groups", "userId": "user_id", "groupIds": ["group1", "group2"] }
{ "action": "get-group-invites" }
{ "action": "join-group-invite", "groupId": "group_id" }
{ "action": "delete-group-invite", "groupId": "group_id" }
```

#### `change-group-avatar` — Đổi avatar nhóm
```json
{ "action": "change-group-avatar", "groupId": "group_id", "url": "https://example.com/avatar.jpg" }
```

#### `upgrade-group-to-community` — Nâng cấp lên cộng đồng
```json
{ "action": "upgrade-group-to-community", "groupId": "group_id" }
```

#### `get-group-chat-history` — Lấy lịch sử chat nhóm
```json
{ "action": "get-group-chat-history", "groupId": "group_id", "count": 20 }
```

---

### 4. Bình chọn — Polls (6 actions)

#### `create-poll` — Tạo bình chọn
```json
{
  "action": "create-poll",
  "threadId": "group_id",
  "title": "Đi ăn ở đâu?",
  "options": ["Phở", "Bún bò", "Cơm tấm"],
  "isGroup": true,
  "allowMultiChoices": true,
  "allowAddNewOption": false,
  "hideVotePreview": false,
  "isAnonymous": false,
  "expiredTime": 0
}
```

#### `vote-poll` — Bỏ phiếu
```json
{ "action": "vote-poll", "pollId": 123, "threadId": "group_id", "optionId": 1, "isGroup": true }
```

#### `lock-poll` — Khóa bình chọn (ngừng nhận vote)
```json
{ "action": "lock-poll", "pollId": 123, "threadId": "group_id", "isGroup": true }
```

#### `get-poll-detail` — Xem chi tiết bình chọn
```json
{ "action": "get-poll-detail", "pollId": 123, "threadId": "group_id", "isGroup": true }
```

#### `add-poll-options` — Thêm lựa chọn mới
```json
{ "action": "add-poll-options", "pollId": 123, "threadId": "group_id", "options": ["Lựa chọn mới"], "isGroup": true }
```

#### `share-poll` — Chia sẻ bình chọn sang nhóm khác
```json
{ "action": "share-poll", "pollId": 123, "threadId": "group_id", "threadIds": ["other_group1"], "isGroup": true }
```

---

### 5. Nhắc nhở — Reminders (6 actions)

#### `create-reminder` — Tạo nhắc nhở
```json
{
  "action": "create-reminder",
  "threadId": "group_id",
  "title": "Họp team 3h chiều",
  "startTime": 1776268800000,
  "isGroup": true,
  "emoji": "📅",
  "repeat": 0
}
```
| `repeat` | Mô tả |
|----------|-------|
| `0` | Không lặp |
| `1` | Hàng ngày |
| `2` | Hàng tuần |
| `3` | Hàng tháng |

#### `edit-reminder` — Sửa nhắc nhở
```json
{ "action": "edit-reminder", "reminderId": "id", "threadId": "group_id", "isGroup": true, "title": "Tiêu đề mới", "startTime": 1776355200000 }
```

#### `remove-reminder` — Xóa nhắc nhở
```json
{ "action": "remove-reminder", "reminderId": "id", "threadId": "group_id", "isGroup": true }
```

#### `list-reminders` — Liệt kê nhắc nhở trong thread
```json
{ "action": "list-reminders", "threadId": "group_id", "isGroup": true }
```

#### `get-reminder` — Chi tiết nhắc nhở theo ID
```json
{ "action": "get-reminder", "reminderId": "id" }
```

#### `get-reminder-responses` — Xem ai chấp nhận/từ chối
```json
{ "action": "get-reminder-responses", "reminderId": "id" }
```

---

### 6. Quản lý hội thoại — Conversation (16 actions)

#### Tắt/bật thông báo
```json
{ "action": "mute-conversation", "threadId": "123456", "isGroup": false, "duration": -1 }
{ "action": "unmute-conversation", "threadId": "123456", "isGroup": false }
```
| `duration` | Mô tả |
|-----------|-------|
| `3600` | 1 giờ |
| `14400` | 4 giờ |
| `-1` | Vĩnh viễn |

#### Ghim / bỏ ghim
```json
{ "action": "pin-conversation", "threadId": "123456", "isGroup": false }
{ "action": "unpin-conversation", "threadId": "123456", "isGroup": false }
```

#### Xóa hội thoại
```json
{ "action": "delete-chat", "threadId": "123456", "isGroup": false }
```

#### Ẩn / hiện hội thoại
```json
{ "action": "hide-conversation", "threadId": "123456", "isGroup": false }
{ "action": "unhide-conversation", "threadId": "123456", "isGroup": false }
{ "action": "get-hidden-conversations" }
```

#### Đánh dấu chưa đọc
```json
{ "action": "mark-unread", "threadId": "123456", "isGroup": false }
{ "action": "unmark-unread", "threadId": "123456", "isGroup": false }
{ "action": "get-unread-marks" }
```

#### Tin nhắn tự xóa (cấp hội thoại)
```json
{ "action": "set-auto-delete-chat", "threadId": "123456", "ttl": 86400000, "isGroup": false }
{ "action": "get-auto-delete-chats" }
```
| `ttl` | Mô tả |
|-------|-------|
| `0` | Tắt |
| `86400000` | 1 ngày |
| `604800000` | 7 ngày |
| `1209600000` | 14 ngày |

#### Lưu trữ hội thoại
```json
{ "action": "update-archived-chat", "threadId": "123456", "isArchived": true, "isGroup": false }
{ "action": "get-archived-chats" }
```

#### Truy vấn trạng thái
```json
{ "action": "get-mute-status" }
{ "action": "get-pinned-conversations" }
```

---

### 7. Tin nhắn nhanh & Tự động trả lời (8 actions)

#### Quick Messages
```json
{ "action": "list-quick-messages" }
{ "action": "add-quick-message", "keyword": "/hello", "message": "Xin chào! Tôi có thể giúp gì?" }
{ "action": "update-quick-message", "itemId": 123, "keyword": "/hi", "message": "Nội dung mới" }
{ "action": "remove-quick-message", "itemId": 123 }
```

#### Auto-Reply
```json
{
  "action": "create-auto-reply",
  "message": "Tôi đang bận, sẽ phản hồi sau!",
  "startTime": 1776268800000,
  "endTime": 1776355200000,
  "isEnable": true,
  "scope": 0,
  "memberIds": []
}
```
| `scope` | Mô tả |
|---------|-------|
| `0` | Tất cả mọi người |
| `1` | Người lạ |
| `2` | Bạn bè cụ thể (cần `memberIds`) |
| `3` | Tất cả bạn trừ một số (cần `memberIds`) |

```json
{ "action": "update-auto-reply", "replyId": 123, "message": "Nội dung mới", "startTime": 0, "endTime": 0 }
{ "action": "delete-auto-reply", "replyId": 123 }
{ "action": "list-auto-replies" }
```

---

### 8. Hồ sơ & Tài khoản — Profile (14 actions)

#### `me` — Xem profile của mình
```json
{ "action": "me" }
```
Trả về: `userId`, `username`, `displayName`, `zaloName`, `avatar`, `bgavatar`, `cover`, `phoneNumber`, `gender`, `dob`, `sdob`, `status`, `bio`, `globalId`, `isActive`, `accountStatus`, `createdTs`

#### `status` — Trạng thái đăng nhập
```json
{ "action": "status" }
```
Trả về: `{ authenticated, hasCredentials }`

#### `get-user-info` — Xem thông tin người dùng
```json
{ "action": "get-user-info", "userId": "user_id" }
```

#### `last-online` — Thời gian online cuối
```json
{ "action": "last-online", "userId": "user_id" }
```

#### `get-qr` — Lấy mã QR của mình
```json
{ "action": "get-qr" }
```

#### `update-profile` — Cập nhật hồ sơ
```json
{ "action": "update-profile", "name": "Tên mới", "dob": "1990-01-15", "gender": 0 }
```
Gender: `0` = Nam, `1` = Nữ

#### `update-profile-bio` — Cập nhật bio
```json
{ "action": "update-profile-bio", "bio": "Bio mới" }
```

#### `change-avatar` — Đổi avatar từ URL
```json
{ "action": "change-avatar", "url": "https://example.com/avatar.jpg" }
```

#### Quản lý avatar cũ
```json
{ "action": "get-avatar-list" }
{ "action": "reuse-avatar", "photoId": "photo_id" }
{ "action": "delete-avatar", "photoId": "photo_id" }
```

#### `get-biz-account` — Xem tài khoản business
```json
{ "action": "get-biz-account", "userId": "user_id" }
```

#### `get-full-avatar` — Avatar full-size + background
```json
{ "action": "get-full-avatar", "userId": "user_id" }
```

#### `get-friend-board` — Bảng bạn bè
```json
{ "action": "get-friend-board" }
```

---

### 9. Cài đặt Zalo — Settings (3 actions)

#### `get-settings` — Xem tất cả cài đặt
```json
{ "action": "get-settings" }
```

#### `update-setting` — Cập nhật cài đặt
```json
{ "action": "update-setting", "settingKey": "key_name", "settingValue": 1 }
```
`settingValue`: `0` = tắt, `1` = bật

#### `update-active-status` — Bật/tắt trạng thái online
```json
{ "action": "update-active-status", "active": true }
```

---

### 10. Sticker & Tiện ích (3 actions)

#### `search-stickers` — Tìm sticker theo keyword
```json
{ "action": "search-stickers", "keyword": "mèo" }
```
Trả về: `{ stickerIds, count }`

#### `search-sticker-detail` — Chi tiết sticker
```json
{ "action": "search-sticker-detail", "stickerId": 12345 }
```

#### `parse-link` — Phân tích metadata URL
```json
{ "action": "parse-link", "url": "https://example.com" }
```

---

### 11. Ghi chú & Nhãn — Notes (4 actions)

#### `create-note` — Tạo ghi chú
```json
{ "action": "create-note", "threadId": "123456", "title": "Ghi chú quan trọng", "pinAct": true }
```

#### `edit-note` — Sửa ghi chú
```json
{ "action": "edit-note", "threadId": "123456", "topicId": "topic_id", "title": "Tiêu đề mới" }
```

#### `get-boards` — Xem bảng ghi chú
```json
{ "action": "get-boards", "threadId": "123456" }
```

#### `get-labels` — Xem nhãn liên hệ
```json
{ "action": "get-labels" }
```

---

### 12. Danh mục & Sản phẩm — Catalogs (8 actions)

#### Quản lý danh mục
```json
{ "action": "get-catalogs" }
{ "action": "create-catalog", "name": "Đồ điện tử" }
{ "action": "update-catalog", "catalogId": "id", "name": "Tên mới" }
{ "action": "delete-catalog", "catalogId": "id" }
```

#### Quản lý sản phẩm
```json
{ "action": "get-products", "catalogId": "catalog_id" }
{ "action": "create-product", "name": "iPhone 15", "price": "25000000", "description": "Mô tả", "catalogId": "catalog_id", "url": "https://example.com/product" }
{ "action": "update-product", "productId": "id", "name": "Tên mới", "price": "23000000" }
{ "action": "delete-product", "productId": "id", "catalogId": "catalog_id" }
```

---

### 13. Chặn người dùng cấp Zalo (2 actions)

Chặn **trực tiếp trên Zalo platform** (khác với chặn trong bot config):
```json
{ "action": "zalo-block-user", "userId": "user_id" }
{ "action": "zalo-unblock-user", "userId": "user_id" }
```

---

### 14. Cấu hình Bot — OpenClaw Layer (13 actions)

> ⚠️ Tất cả action trong nhóm này thay đổi file `openclaw.json`. Sau khi thay đổi, cần chạy `openclaw gateway restart`.

#### Chặn/bỏ chặn người dùng (global)
```json
{ "action": "block-user", "userId": "user_id" }
{ "action": "unblock-user", "userId": "user_id" }
{ "action": "list-blocked" }
{ "action": "list-allowed" }
```

#### Chặn/bỏ chặn trong nhóm cụ thể
```json
{ "action": "block-user-in-group", "userId": "user_id", "groupId": "group_id" }
{ "action": "unblock-user-in-group", "userId": "user_id", "groupId": "group_id" }
{ "action": "list-blocked-in-group", "groupId": "group_id" }
```

#### Cho phép/bỏ cho phép trong nhóm
```json
{ "action": "allow-user-in-group", "userId": "user_id", "groupId": "group_id" }
{ "action": "unallow-user-in-group", "userId": "user_id", "groupId": "group_id" }
{ "action": "list-allowed-in-group", "groupId": "group_id" }
```

#### Cấu hình mention nhóm
```json
{ "action": "group-mention", "groupId": "group_id", "requireMention": true }
```

---

### 15. Tiện ích khác (3 actions)

#### `get-alias-list` — Danh sách biệt danh bạn bè
```json
{ "action": "get-alias-list" }
```

#### `get-related-friend-groups` — Nhóm chung với bạn
```json
{ "action": "get-related-friend-groups", "userId": "user_id" }
```

#### `get-multi-users-by-phones` — Tra cứu nhiều SĐT cùng lúc
```json
{ "action": "get-multi-users-by-phones", "phoneNumbers": ["0912345678", "0987654321"] }
```

---

## 🔄 Cách Update Plugin khi được yêu cầu

### Quy trình update chuẩn

Khi admin hoặc user yêu cầu update plugin zaloclaw, agent thực hiện **tuần tự** các bước sau:

#### Bước 1: Pull code mới nhất

```bash
cd /path/to/zaloclaw
git pull origin main
```

#### Bước 2: Cài lại dependencies

```bash
npm install
```

> **Quan trọng:** Package-lock.json PHẢI được tạo bằng npm 10 (Node 22) để tương thích CI. KHÔNG dùng npm 11.

#### Bước 3: Kiểm tra TypeScript

```bash
npm run typecheck
```

#### Bước 4: Chạy tests

```bash
npm test
```

#### Bước 5: Restart gateway

```bash
openclaw gateway restart
```

#### Bước 6: Xác nhận

```bash
openclaw status
```

Kiểm tra `zaloclaw` có status `ON`.

### Xử lý khi update lỗi

| Vấn đề | Giải pháp |
|--------|-----------|
| `npm install` lỗi | Xóa `node_modules` và `package-lock.json`, chạy lại `npm install` |
| TypeScript lỗi | Kiểm tra phiên bản Node.js ≥ 22, xem lỗi cụ thể |
| Tests fail | Đọc log lỗi, có thể do API thay đổi |
| Gateway không restart | Kiểm tra `openclaw status`, xem logs |
| Session expired sau update | Chạy `openclaw channels login --channel zaloclaw` để quét QR lại |

### Update từ nhánh cụ thể (khi dev yêu cầu test)

```bash
cd /path/to/zaloclaw
git fetch origin
git checkout branch-name
npm install
npm run typecheck
npm test
openclaw gateway restart
```

---

## 📝 Cách ghi nhớ tools (Persistence cho Agent)

### Vấn đề

Mỗi khi agent được restart hoặc session mới được tạo, agent mất toàn bộ context về cách sử dụng zaloclaw tools. Dù plugin đã cài, agent không biết cách gọi đúng.

### Giải pháp: Luôn ghi vào TOOLS.md

Sau mỗi lần sử dụng tools thành công hoặc học được cách dùng mới, agent PHẢI:

1. **Tạo hoặc cập nhật file `TOOLS.md`** tại root repository:

```markdown
# Tools Reference — zaloclaw

## Quick Reference
- Tool name: `zaloclaw`
- 147 actions available
- Full guide: `docs/agent-help.md`

## Recently Used Actions
- `send` — gửi tin nhắn: {threadId, message, isGroup}
- `friends` — list bạn bè: {query?}
- `groups` — list nhóm: {query?}
- ...

## Notes
- Tên tự resolve sang ID, không cần nhớ số
- urgency: 0=default, 1=important, 2=urgent
- Bot config actions cần restart gateway
```

2. **Dùng store_memory** (nếu có) để lưu các facts:

```
Fact: "zaloclaw plugin provides single tool 'zaloclaw' with 147 actions. Call format: {action: 'name', ...params}. Full docs at docs/agent-help.md"
Fact: "zaloclaw send message: {action:'send', threadId:'id_or_name', message:'text', isGroup:bool}. Names auto-resolve to Zalo IDs."
Fact: "zaloclaw update process: git pull → npm install → npm run typecheck → npm test → openclaw gateway restart → openclaw status"
```

3. **Đọc lại docs khi bắt đầu session mới:**
   - Đọc `docs/agent-help.md` (file này)
   - Đọc `TOOLS.md` (nếu tồn tại) để xem ghi chú cập nhật

---

## ⚙️ Cấu hình Plugin

File cấu hình: `~/.openclaw/openclaw.json` → `channels.zaloclaw`

### Cấu hình tối thiểu
```jsonc
{
  "channels": {
    "zaloclaw": {
      "accounts": {
        "default": { "enabled": true }
      }
    }
  }
}
```

### Cấu hình đầy đủ
```jsonc
{
  "channels": {
    "zaloclaw": {
      "accounts": {
        "default": {
          "enabled": true,
          "dmPolicy": "open",           // open | pairing | allowlist | disabled
          "allowFrom": ["*"],
          "denyFrom": [],
          "groupPolicy": "open",        // open | allowlist | disabled
          "groups": {
            "*": { "requireMention": true },
            "123456789": {
              "allow": true,
              "requireMention": false,
              "allowUsers": [],
              "denyUsers": [],
              "tools": {
                "allow": ["send", "friends"],
                "deny": ["delete-chat"]
              }
            }
          },
          "markdown": { "tables": "bullets" },
          "messagePrefix": "",
          "responsePrefix": ""
        }
      }
    }
  }
}
```

### Chính sách DM

| Giá trị | Mô tả |
|---------|-------|
| `open` | Nhận DM từ tất cả |
| `pairing` | Yêu cầu mã PIN trước |
| `allowlist` | Chỉ user trong `allowFrom` |
| `disabled` | Chặn tất cả DM |

### Chính sách nhóm

| Giá trị | Mô tả |
|---------|-------|
| `open` | Hoạt động trong tất cả nhóm |
| `allowlist` | Chỉ nhóm được cấu hình |
| `disabled` | Không hoạt động trong nhóm nào |

### Mention Gating

Khi `requireMention: true` (mặc định trong nhóm):
- Bot **chỉ phản hồi** khi được @mention
- Tin nhắn không @mention → **buffer** (tối đa 50 tin, 4 giờ)
- Khi @mention → bot nhận cả tin nhắn hiện tại + buffer cũ làm context

---

## 🔁 Luồng xử lý tin nhắn

### Tin nhắn đến (Inbound)
```
Zalo → zca-js event → monitor.ts
  ├─ 1. Trích xuất context reply/quote
  │     → Reply: [Replying to Tên_người: "nội dung gốc"]
  ├─ 2. Kiểm tra quyền (denyFrom → dmPolicy/groupPolicy → allowFrom)
  ├─ 3. Mention gating (nhóm: không @mention → buffer)
  ├─ 4. Xử lý ảnh (download nếu DM hoặc @mention)
  ├─ 5. Tập hợp context (sender + buffer + media + quote)
  ├─ 6. Đóng gói → gửi đến OpenClaw agent
  └─ 7. Agent phản hồi → send.ts → Zalo
```

### Tin nhắn đi (Outbound)
```
Agent response → send.ts
  ├─ 1. Parse markdown → Zalo TextStyle
  ├─ 2. Áp dụng urgency level
  ├─ 3. Đặt TTL (nếu có)
  └─ 4. Gửi qua zca-js API → Zalo
```

### Message ID Mapping
- Plugin lưu `msgId ↔ cliMsgId` trong bộ nhớ (tối đa 500 entries)
- Dùng cho `add-reaction` và `undo-message`
- Reset khi gateway restart
- Tin nhắn cũ hơn lần khởi động → cần `cliMsgId` thủ công

---

## 🔍 Xử lý sự cố

| Vấn đề | Giải pháp |
|--------|-----------|
| Bot không phản hồi trong nhóm | Kiểm tra `groupPolicy` (phải là `open` hoặc nhóm trong config) + `requireMention` + `denyUsers` |
| Bot không nhận DM | Kiểm tra `dmPolicy` (`disabled` chặn tất cả), `allowFrom` nếu `allowlist` |
| "Session expired" | Chạy `openclaw channels login --channel zaloclaw` và quét QR lại |
| Reaction/undo không hoạt động | Chỉ hoạt động với tin nhắn sau lần khởi động gần nhất. Tin cũ cần `cliMsgId` thủ công |
| Thay đổi config không có hiệu lực | Chạy `openclaw gateway restart` sau mỗi thay đổi trong `openclaw.json` |
| Plugin không hiện trong `openclaw status` | Chạy `openclaw plugins install --link /path/to/zaloclaw` rồi restart gateway |

### Lệnh kiểm tra nhanh

```bash
# Xem trạng thái tổng quan
openclaw status

# Đăng nhập lại
openclaw channels login --channel zaloclaw

# Restart gateway
openclaw gateway restart

# Kiểm tra TypeScript
cd /path/to/zaloclaw && npm run typecheck

# Chạy tests
cd /path/to/zaloclaw && npm test
```

---

## 📚 Tham chiếu nhanh cho Agent

### Top 10 actions hay dùng nhất

| Action | Công dụng | Params tối thiểu |
|--------|----------|------------------|
| `send` | Gửi tin nhắn | `threadId`, `message`, `isGroup` |
| `friends` | List bạn bè | `query` (optional) |
| `groups` | List nhóm | `query` (optional) |
| `me` | Xem profile mình | (không cần params) |
| `status` | Check đăng nhập | (không cần params) |
| `find-user` | Tìm user theo SĐT | `phoneNumber` |
| `send-image` | Gửi ảnh | `threadId`, `url`, `isGroup` |
| `get-group-info` | Info nhóm | `groupId` |
| `add-reaction` | Thả reaction | `msgId`, `icon`, `threadId`, `isGroup` |
| `block-user` | Chặn user (bot) | `userId` |

### Tất cả 147 action names (để copy nhanh)

```
send, send-styled, send-link, send-image, send-file, send-video, send-voice,
send-sticker, send-card, send-bank-card, send-typing, send-to-stranger,
forward-message, delete-message, undo-message, add-reaction,
friends, find-user, find-user-by-username, send-friend-request,
get-friend-requests, accept-friend-request, reject-friend-request,
get-sent-requests, undo-friend-request, unfriend, check-friend-status,
set-friend-nickname, remove-friend-nickname, get-online-friends,
get-close-friends, get-friend-recommendations, get-alias-list,
get-related-friend-groups, get-multi-users-by-phones,
groups, get-group-info, create-group, add-to-group, remove-from-group,
leave-group, rename-group, add-group-admin, remove-group-admin,
change-group-owner, disperse-group, update-group-settings,
enable-group-link, disable-group-link, get-group-link,
get-pending-members, review-pending-members,
get-group-blocked, block-group-member, unblock-group-member,
get-group-members-info, join-group-link, invite-to-groups,
get-group-invites, join-group-invite, delete-group-invite,
change-group-avatar, upgrade-group-to-community, get-group-chat-history,
create-poll, vote-poll, lock-poll, get-poll-detail, add-poll-options, share-poll,
create-reminder, remove-reminder, edit-reminder, list-reminders,
get-reminder, get-reminder-responses,
mute-conversation, unmute-conversation, pin-conversation, unpin-conversation,
delete-chat, hide-conversation, unhide-conversation, get-hidden-conversations,
mark-unread, unmark-unread, get-unread-marks,
set-auto-delete-chat, get-auto-delete-chats,
get-archived-chats, update-archived-chat,
get-mute-status, get-pinned-conversations,
list-quick-messages, add-quick-message, remove-quick-message, update-quick-message,
list-auto-replies, create-auto-reply, update-auto-reply, delete-auto-reply,
get-settings, update-setting, update-active-status,
me, status, get-user-info, last-online, get-qr,
update-profile, update-profile-bio, change-avatar,
delete-avatar, get-avatar-list, reuse-avatar,
get-biz-account, get-full-avatar, get-friend-board,
search-stickers, search-sticker-detail, parse-link, send-report,
create-note, edit-note, get-boards, get-labels,
create-catalog, update-catalog, delete-catalog, get-catalogs,
create-product, update-product, delete-product, get-products,
zalo-block-user, zalo-unblock-user,
block-user, unblock-user, block-user-in-group, unblock-user-in-group,
list-blocked, list-allowed, allow-user-in-group, unallow-user-in-group,
list-allowed-in-group, list-blocked-in-group, group-mention
```

---

## 🏗️ Kiến trúc Plugin (cho dev/agent hiểu code)

```
zaloclaw/
├── index.ts                    → Entry point & tool registration
├── openclaw.plugin.json        → Plugin manifest (JSON Schema config)
├── src/
│   ├── channel/                → Channel lifecycle & message flow
│   │   ├── channel.ts          → Plugin definition, account start/stop
│   │   ├── monitor.ts          → Inbound message processing & routing
│   │   ├── send.ts             → Outbound message delivery & markdown
│   │   ├── onboarding.ts       → QR code login flow
│   │   ├── image-downloader.ts → Media download handler
│   │   └── probe.ts            → Connection health probe
│   ├── client/                 → Zalo API wrapper
│   │   ├── zalo-client.ts      → zca-js API lifecycle
│   │   ├── credentials.ts      → Credential persistence
│   │   ├── accounts.ts         → Multi-account resolution
│   │   ├── qr-display.ts       → Terminal QR renderer
│   │   └── friend-request-store.ts → Friend request tracking
│   ├── config/                 → Configuration
│   │   ├── config-schema.ts    → Zod schema + UI hints
│   │   └── config-manager.ts   → Runtime config read/write
│   ├── tools/
│   │   └── tool.ts             → 147 action handlers (main file)
│   ├── features/               → Feature modules
│   │   ├── auto-unsend.ts      → Message recall
│   │   ├── msg-id-store.ts     → msgId ↔ cliMsgId mapping
│   │   ├── quote-reply.ts      → Reply-to-message
│   │   ├── reaction-ack.ts     → Reaction acknowledgments
│   │   ├── read-receipt.ts     → Read receipts
│   │   └── sticker.ts          → Sticker search, cache & send
│   ├── parsing/
│   │   └── mention-parser.ts   → @mention detection
│   ├── safety/                 → Security guardrails
│   │   ├── output-filter.ts    → Redact secrets from responses
│   │   ├── thread-sandbox.ts   → Path validation, sandbox
│   │   └── url-validator.ts    → SSRF prevention, safeFetch
│   └── runtime/
│       ├── runtime.ts          → Runtime environment singleton
│       ├── types.ts            → TypeScript types
│       └── status-issues.ts    → Health status reporting
├── docs/
│   ├── agent-help.md           → File này — hướng dẫn cho agent
│   ├── agent-install.md        → Hướng dẫn cài đặt chi tiết
│   └── FEATURES.md             → Feature spec & zca-js API notes
└── tests/                      → Vitest test suite
```

### Lệnh development

```bash
npm run typecheck    # Kiểm tra TypeScript (tsc --noEmit)
npm test             # Chạy tests (vitest run)
npm run test:watch   # Chạy tests watch mode
```

---

*Plugin Version: 2.0.1 | zca-js: ≥2.1.2 | OpenClaw: ≥2026.2.0 | Node.js: ≥22*
*Cập nhật lần cuối: 2026-04-15*
