# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.1] — 2026-04-14

### Fixed
- **CI**: regenerate `package-lock.json` with npm 10 to resolve `npm ci` failure (`opusscript@0.0.8` missing from lock file)

### Security
- **SSRF prevention**: new `safeFetch` wrapper validates all outbound URLs — blocks private/internal IPs (IPv4 + IPv6), embedded credentials, non-HTTP schemes, and DNS rebinding via hostname resolution
- **Path traversal prevention**: `enforceSandboxPath` enforces lexical containment + symlink verification; all thread operations confined to `~/.openclaw/workspace/threads/`
- **Local file access whitelist**: `validateLocalFilePath` restricts file operations to `~/.openclaw/workspace/`, `~/.openclaw/media/`, and system temp directories
- **Credential hardening**: stored credentials now written with `0600` permissions; directories created with `0700`
- **Output redaction**: lowered minimum secret length from 20 → 8 characters; regex patterns created fresh per call to prevent `lastIndex` race conditions
- **Race condition fix**: `getApi()` uses promise memoization to prevent concurrent duplicate login attempts
- **Image download safety**: hash-based filenames, whitelisted extensions, size limit (20 MB), path containment verification
- **QR code isolation**: unique temp file per invocation (`crypto.randomBytes`) with `0600` permissions
- **Thread ID sanitization**: ASCII-only alphanumeric/hyphen/underscore, max 100 characters

### Changed
- **TypeScript strict mode** enabled (`tsconfig.json`)
- **Tool parameter validation**: all local file paths and outbound URLs validated through safety modules

### Added
- `src/safety/url-validator.ts` — SSRF-safe fetch with IP validation, DNS resolution, timeout, and size limits
- `src/types/vendor.d.ts` — type declarations for `qrcode-terminal`, `jsqr`, and `pngjs`
- Test framework (vitest) with 63 security and regression tests across 5 test files
- `validateLocalFilePath`, `enforceSandboxPath`, `cleanupOldSandboxes` in thread-sandbox
- `isPrivateIp`, `validateUrlForOutboundFetch`, `safeFetch` in url-validator

### Fixed
- `isLocalFilePath` in `send.ts` no longer matches URLs containing path-like substrings — now only matches actual filesystem paths

## [2.0.0] — 2026-04-14

### Changed
- **Project restructure**: reorganized `src/` into domain-based modules (`channel/`, `client/`, `config/`, `tools/`, `parsing/`, `safety/`, `runtime/`, `features/`)
- **Status reporting**: `collectStatusIssues` is now synchronous — fixes crash in `openclaw status` when core spreads async return value
- **Image processing**: images in groups are only processed when bot is @mentioned; non-mention images are buffered for later context

### Fixed
- `collectStatusIssues` returned `Promise` (async) but core expected sync `StatusIssue[]` — caused `TypeError: Spread syntax requires ...iterable[Symbol.iterator]`
- Image-only messages in groups bypassed mention gate via `!hasMedia` check — bot responded to all images regardless of @mention
- Status scan reported "not logged in" even when bot was active — `collectStatusIssues` runs in CLI process where `apiInstance` is always null; now checks credentials on disk instead

### Added
- `README.md` with full documentation
- `LICENSE` (MIT)
- `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
- `.editorconfig`, `.github/` templates and CI workflow
- Comprehensive `.gitignore`

## [1.0.0] — 2026-04-13

### Added
- Initial release as `opclaw-zalo` (renamed from `zalo-personal`)
- Full Zalo personal account integration via zca-js v2.1.2
- 130+ agent tool actions (messaging, friends, groups, polls, reminders, profile, catalogs, etc.)
- QR code login flow with credential persistence
- Group mention gating with per-group configuration
- DM access policies: open, pairing, allowlist, disabled
- Features: reaction-ack, quote-reply, read-receipts, sticker support, auto-unsend, message buffering
