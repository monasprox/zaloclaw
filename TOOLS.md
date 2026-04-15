# Tools Reference — zaloclaw

> **File này dành cho AI agent đọc nhanh khi bắt đầu session mới.**
> Đọc chi tiết đầy đủ tại [`docs/agent-help.md`](docs/agent-help.md).

## Tổng quan

- **Tool name:** `zaloclaw`
- **Số actions:** 147
- **Cách gọi:** `{ "action": "tên-action", ...params }`
- **Tên tự resolve:** Tên người dùng / tên nhóm → Zalo numeric ID

## Actions thường dùng

| Action | Params bắt buộc | Mô tả |
|--------|-----------------|-------|
| `send` | `threadId`, `message`, `isGroup` | Gửi tin nhắn |
| `send-styled` | `threadId`, `message`, `isGroup` | Gửi tin có format (bold/italic/color) |
| `send-image` | `threadId`, `url`, `isGroup` | Gửi ảnh |
| `send-file` | `threadId`, `filePath`/`url`, `isGroup` | Gửi file |
| `friends` | — | List bạn bè (`query` optional) |
| `groups` | — | List nhóm (`query` optional) |
| `me` | — | Xem profile mình |
| `status` | — | Check trạng thái đăng nhập |
| `find-user` | `phoneNumber` | Tìm user theo SĐT |
| `get-group-info` | `groupId` | Thông tin nhóm |
| `add-reaction` | `msgId`, `icon`, `threadId`, `isGroup` | Thả reaction |
| `block-user` | `userId` | Chặn user trong bot |
| `send-sticker` | `threadId`, `keyword`/`stickerId`, `isGroup` | Gửi sticker |

## Params quan trọng

- `urgency`: `0` = default, `1` = important, `2` = urgent
- `messageTtl`: ms (60000 = 1 phút, 3600000 = 1 giờ)
- `isGroup`: `true` = nhóm, `false` = DM
- `icon` cho reaction: `heart`, `like`, `haha`, `wow`, `cry`, `angry`, `none`
- `repeat` cho reminder: `0` = không lặp, `1` = ngày, `2` = tuần, `3` = tháng
- `scope` cho auto-reply: `0` = all, `1` = stranger, `2` = specific friends, `3` = except

## Quy trình update

```
git pull origin main → npm install → npm run typecheck → npm test → openclaw gateway restart → openclaw status
```

## Agent phải nhớ

1. Đọc `docs/agent-help.md` khi bắt đầu session
2. Dùng `store_memory` để lưu facts về cách dùng tools
3. Luôn check `status` trước khi thao tác
4. Bot config actions cần `openclaw gateway restart` sau khi thay đổi
5. Package-lock.json phải tạo bằng npm 10 (Node 22)

---

*Cập nhật: 2026-04-15 | Plugin v2.0.1*
