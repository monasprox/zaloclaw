var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/client/credentials.ts
import { readFileSync, writeFileSync, unlinkSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
function saveCredentials(data) {
  const dir = dirname(CREDENTIALS_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 448 });
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 384 });
  try {
    chmodSync(CREDENTIALS_PATH, 384);
  } catch {
  }
}
function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function deleteCredentials() {
  if (existsSync(CREDENTIALS_PATH)) {
    unlinkSync(CREDENTIALS_PATH);
  }
}
function hasCredentials() {
  return existsSync(CREDENTIALS_PATH);
}
function refreshCredentials(freshCookies) {
  const existing = loadCredentials();
  if (!existing) return;
  existing.cookie = freshCookies;
  saveCredentials(existing);
}
var CREDENTIALS_PATH;
var init_credentials = __esm({
  "src/client/credentials.ts"() {
    "use strict";
    CREDENTIALS_PATH = join(homedir(), ".openclaw", "zaloclaw-credentials.json");
  }
});

// src/client/zalo-client.ts
var zalo_client_exports = {};
__export(zalo_client_exports, {
  ensureAuthenticated: () => ensureAuthenticated,
  getApi: () => getApi,
  getApiSync: () => getApiSync,
  getCurrentUid: () => getCurrentUid,
  hasStoredCredentials: () => hasStoredCredentials,
  isAuthenticated: () => isAuthenticated,
  loginWithCredentials: () => loginWithCredentials,
  loginWithQR: () => loginWithQR,
  logout: () => logout
});
import { Zalo, LoginQRCallbackEventType } from "zca-js";
import sharp from "sharp";
import * as fs from "fs";
async function imageMetadataGetter(filePath) {
  const data = await fs.promises.readFile(filePath);
  const metadata = await sharp(data).metadata();
  return {
    height: metadata.height || 0,
    width: metadata.width || 0,
    size: metadata.size || data.length
  };
}
async function loginWithQR(callback) {
  const zalo = new Zalo({ logging: false, imageMetadataGetter });
  const api = await zalo.loginQR(void 0, (event) => {
    if (event.type === LoginQRCallbackEventType.GotLoginInfo && event.data) {
      saveCredentials({
        imei: event.data.imei,
        cookie: event.data.cookie,
        userAgent: event.data.userAgent
      });
    }
    callback?.(event);
  });
  apiInstance = api;
  try {
    const raw = await api.fetchAccountInfo();
    const info = raw?.profile ?? raw;
    currentUid = info?.userId ?? null;
  } catch {
  }
  return api;
}
async function loginWithCredentials() {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error("No saved credentials found. Login with QR first.");
  }
  const zalo = new Zalo({ logging: false, imageMetadataGetter });
  const api = await zalo.login({
    imei: creds.imei,
    cookie: creds.cookie,
    userAgent: creds.userAgent,
    language: creds.language
  });
  apiInstance = api;
  try {
    const raw = await api.fetchAccountInfo();
    const info = raw?.profile ?? raw;
    currentUid = info?.userId ?? null;
  } catch {
  }
  return api;
}
async function getApi() {
  if (apiInstance) {
    return apiInstance;
  }
  if (!hasCredentials()) {
    throw new Error("Not authenticated. Login with QR first.");
  }
  if (loginPromise) {
    return loginPromise;
  }
  loginPromise = loginWithCredentials().finally(() => {
    loginPromise = null;
  });
  return loginPromise;
}
function getApiSync() {
  return apiInstance;
}
function getCurrentUid() {
  return currentUid;
}
function isAuthenticated() {
  return apiInstance !== null;
}
function hasStoredCredentials() {
  return hasCredentials();
}
async function logout() {
  apiInstance = null;
  currentUid = null;
  loginPromise = null;
  deleteCredentials();
}
async function ensureAuthenticated() {
  return getApi();
}
var apiInstance, currentUid, loginPromise;
var init_zalo_client = __esm({
  "src/client/zalo-client.ts"() {
    "use strict";
    init_credentials();
    apiInstance = null;
    currentUid = null;
    loginPromise = null;
  }
});

// src/parsing/mention-parser.ts
function normalizeName(name) {
  return name.trim().normalize("NFC");
}
function nameKey(name) {
  return normalizeName(name).toLowerCase();
}
function profileName(profile) {
  return normalizeName(
    String(
      profile?.displayName ?? profile?.display_name ?? profile?.dName ?? profile?.zaloName ?? profile?.zalo_name ?? profile?.name ?? ""
    )
  );
}
function buildIndex(members) {
  const cleaned = members.map((m) => ({ uid: m.uid, name: normalizeName(m.name) })).filter((m) => m.uid && m.name.length > 0);
  const counts = /* @__PURE__ */ new Map();
  for (const m of cleaned) {
    const key = nameKey(m.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const uniqueNameToUid = /* @__PURE__ */ new Map();
  for (const m of cleaned) {
    const key = nameKey(m.name);
    if (counts.get(key) === 1) uniqueNameToUid.set(key, m.uid);
  }
  const byNameLower = cleaned.map((m) => ({ nameLower: nameKey(m.name), nameOriginal: m.name, uid: m.uid })).sort((a, b) => b.nameLower.length - a.nameLower.length);
  return { byNameLower, uniqueNameToUid };
}
function upsertMembersFromProfiles(membersByUid, profiles) {
  for (const [uid, p] of Object.entries(profiles)) {
    const name = profileName(p);
    if (name) membersByUid.set(uid, { uid, name });
  }
}
async function fetchUserInfoProfiles(api, memberIds) {
  if (memberIds.length === 0) return {};
  try {
    const userInfoResp = await api.getUserInfo(memberIds);
    return userInfoResp?.changed_profiles ?? {};
  } catch {
    return {};
  }
}
async function loadGroupMemberIndex(groupId) {
  const cached = groupMemberCache.get(groupId);
  if (cached && Date.now() - cached.cachedAt < MEMBER_CACHE_TTL_MS) return cached.index;
  const api = await getApi();
  const groupResp = await api.getGroupInfo([groupId]);
  const info = groupResp?.gridInfoMap?.[groupId];
  if (!info) return buildIndex([]);
  let memberIds = info.memberIds ?? [];
  if (memberIds.length === 0) {
    const memVerList = info.memVerList ?? [];
    memberIds = memVerList.map((entry) => entry.split("_")[0]).filter(Boolean);
  }
  if (memberIds.length === 0) return buildIndex([]);
  const membersByUid = /* @__PURE__ */ new Map();
  const batchSize = 40;
  for (let i = 0; i < memberIds.length; i += batchSize) {
    const batch = memberIds.slice(i, i + batchSize);
    try {
      const profilesResp = await api.getGroupMembersInfo(batch);
      upsertMembersFromProfiles(membersByUid, profilesResp?.profiles ?? {});
    } catch (err) {
      console.error(`[mention-parser] getGroupMembersInfo batch failed for group ${groupId}:`, err);
    }
  }
  let missingMemberIds = memberIds.filter((uid) => !membersByUid.has(uid));
  if (missingMemberIds.length > 0) {
    const changedProfiles = await fetchUserInfoProfiles(api, missingMemberIds);
    upsertMembersFromProfiles(membersByUid, changedProfiles);
  }
  missingMemberIds = memberIds.filter((uid) => !membersByUid.has(uid));
  if (missingMemberIds.length > 0) {
    const settled = await Promise.allSettled(
      missingMemberIds.map((uid) => api.getUserInfo(uid))
    );
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const changedProfiles = result.value?.changed_profiles ?? {};
      upsertMembersFromProfiles(membersByUid, changedProfiles);
    }
  }
  const members = Array.from(membersByUid.values());
  const index = buildIndex(members);
  if (groupMemberCache.size >= MEMBER_CACHE_MAX) {
    const firstKey = groupMemberCache.keys().next().value;
    if (firstKey) groupMemberCache.delete(firstKey);
  }
  groupMemberCache.set(groupId, { index, cachedAt: Date.now() });
  return index;
}
function isWordChar(ch) {
  if (!ch) return false;
  return /[\p{L}\p{N}_]/u.test(ch);
}
function longestNamePrefixMatch(rest, index) {
  const restLower = rest.toLowerCase();
  for (const entry of index.byNameLower) {
    if (restLower.startsWith(entry.nameLower)) {
      const after = rest[entry.nameLower.length];
      if (isWordChar(after)) continue;
      if (index.uniqueNameToUid.get(entry.nameLower) === entry.uid) {
        return rest.substring(0, entry.nameLower.length);
      }
    }
  }
  return null;
}
function parseOutboundMentions(input, index) {
  if (!input || index.byNameLower.length === 0) {
    return { text: input, mentions: [], stripIndices: [] };
  }
  let output = "";
  const mentions = [];
  const stripIndices = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === "@") {
      const prev = i > 0 ? input[i - 1] : void 0;
      if (isWordChar(prev)) {
        output += ch;
        i++;
        continue;
      }
      if (input[i + 1] === "[") {
        const close = input.indexOf("]", i + 2);
        if (close !== -1) {
          const name = input.substring(i + 2, close);
          const uid = index.uniqueNameToUid.get(name.toLowerCase());
          if (uid) {
            const pos = output.length;
            output += "@" + name;
            mentions.push({ pos, uid, len: 1 + name.length });
            stripIndices.push(i + 1);
            stripIndices.push(close);
            i = close + 1;
            continue;
          }
        }
      }
      const rest = input.substring(i + 1);
      const matchedName = longestNamePrefixMatch(rest, index);
      if (matchedName) {
        const uid = index.uniqueNameToUid.get(matchedName.toLowerCase());
        if (uid) {
          const pos = output.length;
          output += "@" + matchedName;
          mentions.push({ pos, uid, len: 1 + matchedName.length });
          i += 1 + matchedName.length;
          continue;
        }
      }
    }
    output += ch;
    i++;
  }
  return { text: output, mentions, stripIndices };
}
async function resolveOutboundMentions(groupId, text) {
  if (!text || !groupId) return { text, mentions: [], stripIndices: [] };
  if (!text.includes("@")) return { text, mentions: [], stripIndices: [] };
  try {
    const index = await loadGroupMemberIndex(groupId);
    return parseOutboundMentions(text, index);
  } catch (err) {
    console.error(`[mention-parser] resolve failed for group ${groupId}:`, err);
    return { text, mentions: [], stripIndices: [] };
  }
}
var MEMBER_CACHE_TTL_MS, MEMBER_CACHE_MAX, groupMemberCache;
var init_mention_parser = __esm({
  "src/parsing/mention-parser.ts"() {
    "use strict";
    init_zalo_client();
    MEMBER_CACHE_TTL_MS = 5 * 60 * 1e3;
    MEMBER_CACHE_MAX = 50;
    groupMemberCache = /* @__PURE__ */ new Map();
  }
});

// src/safety/output-filter.ts
function redactOutput(text) {
  let result = text;
  for (const { pattern, replacement } of REDACTION_RULES) {
    result = result.replace(pattern(), replacement);
  }
  return result;
}
var REDACTION_RULES;
var init_output_filter = __esm({
  "src/safety/output-filter.ts"() {
    "use strict";
    REDACTION_RULES = [
      { pattern: () => /\/root\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
      { pattern: () => /\/home\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
      { pattern: () => /~\/\.openclaw\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
      { pattern: () => /\/usr\/lib\/node_modules\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
      { pattern: () => /\bmcp__[a-z_-]+__[a-z_-]+/g, replacement: "[tool]" },
      { pattern: () => /openclaw\/plugin-sdk\/[^\s"'`)\]}>]+/g, replacement: "[internal]" },
      { pattern: () => /openclaw\/dist\/[^\s"'`)\]}>]+/g, replacement: "[internal]" },
      { pattern: () => /\bsession[_-]?id[:\s=]+[a-f0-9-]{36}/gi, replacement: "session [id]" },
      // [M2] Lowered from {20,} to {8,} to catch shorter secrets/tokens
      { pattern: () => /\b(api[_-]?key|token|secret|password|credential)[:\s=]+["']?[A-Za-z0-9_\-./+=]{8,}["']?/gi, replacement: "$1=[redacted]" },
      { pattern: () => /\bpm2\s+(restart|stop|start|delete|logs)\s+[^\s]+/g, replacement: "pm2 [command]" },
      { pattern: () => /at\s+[^\n]*node_modules[^\n]*/g, replacement: "at [internal]" },
      { pattern: () => /at\s+[^\n]*\/dist\/[^\n]*/g, replacement: "at [internal]" }
    ];
  }
});

// src/channel/send.ts
var send_exports = {};
__export(send_exports, {
  isLocalFilePath: () => isLocalFilePath,
  markdownToZaloStyles: () => markdownToZaloStyles,
  sendLinkZaloClaw: () => sendLinkZaloClaw,
  sendMessageZaloClaw: () => sendMessageZaloClaw
});
import { ThreadType, TextStyle } from "zca-js";
import * as fs4 from "fs";
function markdownToZaloStyles(input) {
  const styles = [];
  let text = input;
  text = text.replace(/^(#{1,6})\s+(.+)$/gm, (_m, _h, content) => content);
  const inlinePatterns = [
    { regex: /\*\*\*(.+?)\*\*\*/g, style: TextStyle.Bold },
    { regex: /\*\*(.+?)\*\*/g, style: TextStyle.Bold },
    { regex: /~~(.+?)~~/g, style: TextStyle.StrikeThrough },
    { regex: /__(.+?)__/g, style: TextStyle.Underline },
    { regex: /`([^`]+)`/g, style: TextStyle.Bold },
    { regex: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, style: TextStyle.Italic }
  ];
  for (const { regex, style } of inlinePatterns) {
    let result = "";
    let lastIndex = 0;
    const pending = [];
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      result += text.slice(lastIndex, match.index);
      const start = result.length;
      const content = match[1];
      result += content;
      pending.push({ start, len: content.length, st: style });
      lastIndex = match.index + match[0].length;
    }
    if (pending.length > 0) {
      result += text.slice(lastIndex);
      text = result;
      styles.push(...pending);
    }
  }
  return { text, styles };
}
function countStripsBefore(sorted, value) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
async function sendMessageZaloClaw(threadId, text, options = {}) {
  if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };
  if (options.localPath) {
    return uploadAndSendLocalImage(threadId, options.localPath, {
      ...options,
      caption: text || options.caption
    });
  }
  if (text && isLocalFilePath(text.trim()) && fs4.existsSync(text.trim())) {
    return uploadAndSendLocalImage(threadId, text.trim(), {
      ...options,
      caption: options.caption
    });
  }
  if (options.mediaUrl) {
    return sendMediaZaloClaw(threadId, options.mediaUrl, {
      ...options,
      caption: text || options.caption
    });
  }
  try {
    const api = await getApi();
    const type = options.isGroup ? ThreadType.Group : ThreadType.User;
    const redacted = redactOutput(text);
    const truncated = redacted.length > ZALO_MAX_TEXT_LENGTH ? redacted.slice(0, ZALO_MAX_TEXT_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX : redacted;
    const { text: postMarkdownText, styles } = markdownToZaloStyles(truncated);
    let outboundText = postMarkdownText;
    let mentions = [];
    let alignedStyles = styles;
    if (options.isGroup) {
      const resolved = await resolveOutboundMentions(threadId.trim(), postMarkdownText);
      outboundText = resolved.text;
      mentions = resolved.mentions;
      if (resolved.stripIndices.length > 0 && styles.length > 0) {
        alignedStyles = styles.map((s) => {
          const shift = countStripsBefore(resolved.stripIndices, s.start);
          return shift === 0 ? s : { ...s, start: s.start - shift };
        });
      }
    }
    const content = { msg: outboundText };
    if (alignedStyles.length > 0) content.styles = alignedStyles;
    if (mentions.length > 0) content.mentions = mentions;
    if (options.quote) content.quote = options.quote;
    const result = await api.sendMessage(content, threadId.trim(), type);
    const msgId = result?.message?.msgId;
    return { ok: true, messageId: msgId != null ? String(msgId) : void 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function sendMediaZaloClaw(threadId, mediaUrl, options = {}) {
  if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };
  if (!mediaUrl?.trim()) return { ok: false, error: "No media URL provided" };
  try {
    const api = await getApi();
    const type = options.isGroup ? ThreadType.Group : ThreadType.User;
    const result = await api.sendLink(
      { link: mediaUrl.trim(), msg: options.caption || void 0 },
      threadId.trim(),
      type
    );
    const msgId = result?.msgId;
    return { ok: true, messageId: msgId != null ? String(msgId) : void 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function sendLinkZaloClaw(threadId, url, options = {}) {
  if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };
  if (!url?.trim()) return { ok: false, error: "No URL provided" };
  try {
    const api = await getApi();
    const type = options.isGroup ? ThreadType.Group : ThreadType.User;
    const result = await api.sendLink({ link: url.trim() }, threadId.trim(), type);
    const msgId = result?.msgId;
    return { ok: true, messageId: msgId != null ? String(msgId) : void 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function uploadAndSendLocalImage(threadId, localPath, options = {}) {
  if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };
  if (!localPath?.trim()) return { ok: false, error: "No local path provided" };
  if (!fs4.existsSync(localPath)) return { ok: false, error: `File not found: ${localPath}` };
  try {
    const api = await getApi();
    const type = options.isGroup ? ThreadType.Group : ThreadType.User;
    const result = await api.sendMessage(
      { msg: options.caption || "", attachments: localPath },
      threadId.trim(),
      type
    );
    if (options.cleanupAfterUpload === true) {
      try {
        fs4.unlinkSync(localPath);
      } catch {
      }
    }
    const msgId = result?.message?.msgId;
    return { ok: true, messageId: msgId != null ? String(msgId) : void 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
function isLocalFilePath(str) {
  if (!str) return false;
  const trimmed = str.trim();
  if (/^https?:\/\//i.test(trimmed)) return false;
  return trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../");
}
var ZALO_MAX_TEXT_LENGTH, TRUNCATION_SUFFIX;
var init_send = __esm({
  "src/channel/send.ts"() {
    "use strict";
    init_zalo_client();
    init_mention_parser();
    init_output_filter();
    ZALO_MAX_TEXT_LENGTH = 4e3;
    TRUNCATION_SUFFIX = "\n\n[...tin nh\u1EAFn qu\xE1 d\xE0i, \u0111\xE3 c\u1EAFt b\u1EDBt]";
  }
});

// src/features/group-id-cache.ts
function recordGroupId(id) {
  if (id?.trim()) knownGroupIds.add(id.trim());
}
function isKnownGroupId(id) {
  return knownGroupIds.has(id?.trim() ?? "");
}
var knownGroupIds;
var init_group_id_cache = __esm({
  "src/features/group-id-cache.ts"() {
    "use strict";
    knownGroupIds = /* @__PURE__ */ new Set();
  }
});

// src/runtime/runtime.ts
function setZaloClawRuntime(next) {
  runtime = next;
}
function getZaloClawRuntime() {
  if (!runtime) {
    throw new Error("ZaloClaw runtime not initialized");
  }
  return runtime;
}
var runtime;
var init_runtime = __esm({
  "src/runtime/runtime.ts"() {
    "use strict";
    runtime = null;
  }
});

// src/safety/url-validator.ts
import { URL as URL2 } from "node:url";
import * as dns from "node:dns/promises";
import * as net from "node:net";
function isPrivateIp(ip) {
  const normalized = ip.replace(/^::ffff:/i, "");
  if (net.isIPv4(normalized)) {
    const parts = normalized.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(normalized)) {
    const lower = normalized.toLowerCase();
    if (lower === "::1") return true;
    if (lower === "::") return true;
    if (lower.startsWith("fe80:")) return true;
    if (/^f[cd]/i.test(lower)) return true;
    return false;
  }
  return true;
}
async function validateUrlForOutboundFetch(rawUrl) {
  let parsed;
  try {
    parsed = new URL2(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked URL scheme: ${parsed.protocol} (only http/https allowed)`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }
  let hostname = parsed.hostname;
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`Blocked private/internal IP: ${hostname}`);
    }
    return parsed;
  }
  try {
    const addresses = await dns.resolve4(hostname).catch(() => []);
    const addresses6 = await dns.resolve6(hostname).catch(() => []);
    const allAddresses = [...addresses, ...addresses6];
    if (allAddresses.length === 0) {
      throw new Error(`DNS resolution failed for: ${hostname}`);
    }
    for (const ip of allAddresses) {
      if (isPrivateIp(ip)) {
        throw new Error(`Blocked: ${hostname} resolves to private/internal IP ${ip}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Blocked")) throw err;
    throw new Error(`DNS validation failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parsed;
}
async function safeFetch(rawUrl, options = {}) {
  const maxSize = options.maxSizeBytes ?? MAX_DOWNLOAD_SIZE_BYTES;
  const timeout = options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  if (!options.skipSsrfCheck) {
    await validateUrlForOutboundFetch(rawUrl);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(rawUrl, {
      signal: controller.signal,
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxSize) {
      throw new Error(`File too large: ${contentLength} bytes (max ${maxSize})`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }
    const chunks = [];
    let totalSize = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > maxSize) {
        reader.cancel();
        throw new Error(`Download exceeded size limit: ${totalSize} bytes (max ${maxSize})`);
      }
      chunks.push(value);
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType: response.headers.get("content-type")
    };
  } finally {
    clearTimeout(timer);
  }
}
var MAX_DOWNLOAD_SIZE_BYTES, DOWNLOAD_TIMEOUT_MS;
var init_url_validator = __esm({
  "src/safety/url-validator.ts"() {
    "use strict";
    MAX_DOWNLOAD_SIZE_BYTES = 50 * 1024 * 1024;
    DOWNLOAD_TIMEOUT_MS = 3e4;
  }
});

// src/channel/image-downloader.ts
import * as fs5 from "fs";
import * as path2 from "path";
import * as crypto2 from "crypto";
import * as os2 from "os";
function buildZaloCookieHeader(cookie) {
  if (!cookie) return void 0;
  if (Array.isArray(cookie)) {
    const pairs = cookie.map((c) => {
      const key = c.key ?? c.name ?? "";
      const value = c.value ?? "";
      return key ? `${key}=${value}` : "";
    }).filter(Boolean);
    return pairs.length > 0 ? pairs.join("; ") : void 0;
  }
  if (typeof cookie === "object") {
    const pairs = Object.entries(cookie).filter(([k]) => Boolean(k)).map(([k, v]) => `${k}=${v}`);
    return pairs.length > 0 ? pairs.join("; ") : void 0;
  }
  return void 0;
}
function detectImageType(buffer) {
  for (const { prefix, type } of IMAGE_MAGIC_BYTES) {
    if (buffer.length >= prefix.length) {
      const match = prefix.every((byte, i) => buffer[i] === byte);
      if (match) return type;
    }
  }
  const head = buffer.subarray(0, 100).toString("utf8").trim().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml") && head.includes("<svg")) {
    return "svg";
  }
  return void 0;
}
async function downloadImageFromUrl(url, workspaceDir) {
  try {
    const targetDir = workspaceDir || path2.join(os2.homedir(), ".openclaw/media/inbound");
    if (!fs5.existsSync(targetDir)) {
      fs5.mkdirSync(targetDir, { recursive: true });
    }
    const urlHash = crypto2.createHash("sha256").update(url).digest("hex").substring(0, 12);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").substring(0, 19);
    const ext = getSafeExtension(url);
    const filename = `${timestamp}-zalo-${urlHash}.${ext}`;
    const filePath = path2.join(targetDir, filename);
    const resolvedPath = path2.resolve(filePath);
    const resolvedDir = path2.resolve(targetDir);
    if (!resolvedPath.startsWith(resolvedDir + path2.sep)) {
      console.error(`[image-downloader] Path traversal blocked: ${filePath}`);
      return void 0;
    }
    const isZaloCdn = /^https:\/\/(?:[a-z0-9-]+\.)*(?:zalo|zadn|zdn)\.(?:vn|me)\//i.test(url);
    let buffer;
    let contentType;
    if (isZaloCdn) {
      const creds = loadCredentials();
      const cookieHeader = creds?.cookie ? buildZaloCookieHeader(creds.cookie) : void 0;
      console.log(`[image-downloader] isZaloCdn=${isZaloCdn} url=${url.substring(0, 80)}`);
      if (isZaloCdn && cookieHeader) {
        console.log(`[image-downloader] Using Zalo session cookies (${cookieHeader.split(";").length} cookies)`);
      } else if (isZaloCdn && !cookieHeader) {
        console.warn(`[image-downloader] Zalo CDN but no cookies found \u2014 download may fail`);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3e4);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            ...cookieHeader ? { Cookie: cookieHeader } : {},
            "User-Agent": creds?.userAgent ?? "Mozilla/5.0"
          }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuf = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        contentType = response.headers.get("content-type");
        console.log(`[image-downloader] Response status=${response.status} contentType=${contentType} size=${arrayBuf.byteLength}`);
      } finally {
        clearTimeout(timer);
      }
    } else {
      const result = await safeFetch(url, {
        maxSizeBytes: MAX_IMAGE_SIZE_BYTES
      });
      buffer = result.buffer;
      contentType = result.contentType;
    }
    const mimeBase = contentType?.split(";")[0]?.trim().toLowerCase();
    if (mimeBase && !ALLOWED_MIME_TYPES.has(mimeBase) && !mimeBase.startsWith("image/")) {
      console.warn(`[image-downloader] Rejected non-image content-type "${contentType}" from ${url}`);
      return void 0;
    }
    const detectedType = detectImageType(buffer);
    if (!detectedType) {
      const headStr = buffer.subarray(0, 200).toString("utf8").toLowerCase();
      if (headStr.includes("<!doctype") || headStr.includes("<html") || headStr.includes("<head")) {
        console.warn(`[image-downloader] Rejected HTML content disguised as image from ${url}`);
        return void 0;
      }
      console.warn(`[image-downloader] Unknown image format from ${url}, saving anyway`);
    }
    fs5.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error(`[image-downloader] Error downloading ${url}:`, err);
    return void 0;
  }
}
function getSafeExtension(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    if (match) {
      const ext = match[1].toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) return ext;
    }
  } catch {
  }
  return "jpg";
}
var MAX_IMAGE_SIZE_BYTES, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, IMAGE_MAGIC_BYTES;
var init_image_downloader = __esm({
  "src/channel/image-downloader.ts"() {
    "use strict";
    init_url_validator();
    init_credentials();
    MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
    ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff"]);
    ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set([
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/svg+xml",
      "image/tiff"
    ]);
    IMAGE_MAGIC_BYTES = [
      { prefix: [255, 216, 255], type: "jpeg" },
      // JPEG
      { prefix: [137, 80, 78, 71], type: "png" },
      // PNG
      { prefix: [71, 73, 70, 56], type: "gif" },
      // GIF (GIF87a/GIF89a)
      { prefix: [82, 73, 70, 70], type: "webp" },
      // WebP (RIFF container)
      { prefix: [66, 77], type: "bmp" }
      // BMP
    ];
  }
});

// src/channel/file-downloader.ts
import * as fs6 from "fs";
import * as path3 from "path";
import * as crypto3 from "crypto";
import * as os3 from "os";
function buildZaloCookieHeader2(cookie) {
  if (!cookie) return void 0;
  if (Array.isArray(cookie)) {
    const pairs = cookie.map((c) => {
      const key = c.key ?? c.name ?? "";
      const value = c.value ?? "";
      return key ? `${key}=${value}` : "";
    }).filter(Boolean);
    return pairs.length > 0 ? pairs.join("; ") : void 0;
  }
  if (typeof cookie === "object") {
    const pairs = Object.entries(cookie).filter(([k]) => Boolean(k)).map(([k, v]) => `${k}=${v}`);
    return pairs.length > 0 ? pairs.join("; ") : void 0;
  }
  return void 0;
}
async function downloadFileFromUrl(url, workspaceDir) {
  try {
    const targetDir = workspaceDir || path3.join(os3.homedir(), ".openclaw/media/inbound");
    if (!fs6.existsSync(targetDir)) {
      fs6.mkdirSync(targetDir, { recursive: true });
    }
    const urlHash = crypto3.createHash("sha256").update(url).digest("hex").substring(0, 12);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").substring(0, 19);
    const ext = getSafeExtension2(url) || "file";
    const filename = `${timestamp}-zalo-file-${urlHash}.${ext}`;
    const filePath = path3.join(targetDir, filename);
    const resolvedPath = path3.resolve(filePath);
    const resolvedDir = path3.resolve(targetDir);
    if (!resolvedPath.startsWith(resolvedDir + path3.sep)) {
      console.error(`[file-downloader] Path traversal blocked: ${filePath}`);
      return void 0;
    }
    const isZaloCdn = /^https:\/\/(?:[a-z0-9-]+\.)*(?:zalo|zadn|zdn)\.(?:vn|me)\//i.test(url);
    let buffer;
    let contentType;
    if (isZaloCdn) {
      const creds = loadCredentials();
      const cookieHeader = creds?.cookie ? buildZaloCookieHeader2(creds.cookie) : void 0;
      console.log(`[file-downloader] Zalo CDN url=${url.substring(0, 80)}`);
      if (!cookieHeader) {
        console.warn(`[file-downloader] Zalo CDN but no cookies found \u2014 download may fail`);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3e4);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            ...cookieHeader ? { Cookie: cookieHeader } : {},
            "User-Agent": creds?.userAgent ?? "Mozilla/5.0"
          }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuf = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        contentType = response.headers.get("content-type");
        console.log(`[file-downloader] Response status=${response.status} contentType=${contentType} size=${arrayBuf.byteLength}`);
      } finally {
        clearTimeout(timer);
      }
    } else {
      const result = await safeFetch(url, {
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
        skipSsrfCheck: false
      });
      buffer = result.buffer;
      contentType = result.contentType;
    }
    if (contentType) {
      console.log(`[file-downloader] Downloaded ${contentType} from ${url}`);
    }
    fs6.writeFileSync(filePath, buffer);
    console.log(`[file-downloader] Saved to ${filePath} (${buffer.length} bytes)`);
    return filePath;
  } catch (err) {
    console.error(`[file-downloader] Error downloading ${url}:`, err);
    return void 0;
  }
}
function getSafeExtension2(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    if (match) {
      return match[1].toLowerCase();
    }
  } catch {
  }
  return "";
}
var MAX_FILE_SIZE_BYTES;
var init_file_downloader = __esm({
  "src/channel/file-downloader.ts"() {
    "use strict";
    init_url_validator();
    init_credentials();
    MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
  }
});

// src/client/friend-request-store.ts
import { readFileSync as readFileSync3, writeFileSync as writeFileSync5, mkdirSync as mkdirSync4 } from "node:fs";
import { dirname as dirname2, join as join5 } from "node:path";
import { homedir as homedir4 } from "node:os";
function loadRequests() {
  if (cache !== null) return cache;
  try {
    const raw = readFileSync3(STORE_PATH, "utf-8");
    cache = JSON.parse(raw);
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}
function saveRequests(requests) {
  cache = requests;
  mkdirSync4(dirname2(STORE_PATH), { recursive: true });
  writeFileSync5(STORE_PATH, JSON.stringify(requests, null, 2));
}
function addPendingRequest(fromUid, message, src) {
  const requests = loadRequests().filter((r) => r.fromUid !== fromUid);
  requests.push({ fromUid, message, src, receivedAt: Date.now() });
  saveRequests(requests);
}
function removePendingRequest(fromUid) {
  const requests = loadRequests().filter((r) => r.fromUid !== fromUid);
  saveRequests(requests);
}
function getPendingRequests() {
  return loadRequests();
}
var STORE_PATH, cache;
var init_friend_request_store = __esm({
  "src/client/friend-request-store.ts"() {
    "use strict";
    STORE_PATH = join5(homedir4(), ".openclaw", "zalo-friend-requests.json");
    cache = null;
  }
});

// src/features/read-receipt.ts
function recordReadReceipt(threadId, seenBy) {
  const users = Array.isArray(seenBy) ? seenBy : [seenBy];
  if (readReceipts.size >= MAX_THREADS && !readReceipts.has(threadId)) {
    const oldest = readReceipts.keys().next().value;
    if (oldest) readReceipts.delete(oldest);
  }
  const existing = readReceipts.get(threadId);
  if (existing) {
    const newUsers = users.filter((u) => !existing.seenBy.includes(u));
    existing.seenBy.push(...newUsers);
    existing.seenAt = Date.now();
  } else {
    readReceipts.set(threadId, { seenBy: users, seenAt: Date.now() });
  }
}
var readReceipts, MAX_THREADS;
var init_read_receipt = __esm({
  "src/features/read-receipt.ts"() {
    "use strict";
    readReceipts = /* @__PURE__ */ new Map();
    MAX_THREADS = 200;
  }
});

// src/features/group-event.ts
import { GroupEventType } from "zca-js";
function renderTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
function mergeConfig(cfg) {
  return { ...DEFAULTS, ...cfg };
}
async function handleGroupEvent(event, ctx) {
  const cfg = mergeConfig(ctx.config);
  if (!cfg.enabled) return;
  const type = event.type;
  const groupId = event.threadId ?? event.groupId ?? "";
  const groupName = event.data?.groupName ?? event.data?.name ?? groupId;
  const memberIds = event.data?.members ? Array.isArray(event.data.members) ? event.data.members.map((m) => String(m.id ?? m.userId ?? m.uid ?? m)) : [String(event.data.members)] : event.data?.fromUid ? [String(event.data.fromUid)] : [];
  const memberName = event.data?.members?.[0]?.dName ?? event.data?.members?.[0]?.name ?? event.data?.dName ?? event.data?.fromName ?? memberIds[0] ?? "Th\xE0nh vi\xEAn";
  const vars = { name: memberName, groupName };
  let message = null;
  switch (type) {
    case GroupEventType.JOIN:
      if (cfg.welcome) {
        message = renderTemplate(cfg.welcomeTemplate, vars);
      }
      break;
    case GroupEventType.LEAVE:
      if (cfg.leaveAlert) {
        message = renderTemplate(cfg.leaveTemplate, vars);
      }
      break;
    case GroupEventType.REMOVE_MEMBER:
      if (cfg.leaveAlert) {
        message = renderTemplate(cfg.kickTemplate, vars);
      }
      break;
    case GroupEventType.ADD_ADMIN:
      if (cfg.adminAlert) {
        message = renderTemplate(cfg.adminAddTemplate, vars);
      }
      break;
    case GroupEventType.REMOVE_ADMIN:
      if (cfg.adminAlert) {
        message = renderTemplate(cfg.adminRemoveTemplate, vars);
      }
      break;
    default:
      break;
  }
  if (!message || !groupId) return;
  ctx.log?.(`[group-event] ${type} in ${groupId} \u2192 sending: ${message}`);
  try {
    await ctx.api.sendMessage(
      { msg: message, mentions: [] },
      groupId,
      1
      // ThreadType.Group
    );
  } catch (err) {
    ctx.log?.(`[group-event] sendMessage failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
var DEFAULTS;
var init_group_event = __esm({
  "src/features/group-event.ts"() {
    "use strict";
    DEFAULTS = {
      enabled: false,
      welcome: true,
      leaveAlert: true,
      adminAlert: false,
      welcomeTemplate: "\u{1F44B} Ch\xE0o m\u1EEBng {name} \u0111\xE3 tham gia nh\xF3m {groupName}!",
      leaveTemplate: "\u{1F44B} {name} \u0111\xE3 r\u1EDDi nh\xF3m {groupName}.",
      kickTemplate: "\u{1F6AB} {name} \u0111\xE3 b\u1ECB x\xF3a kh\u1ECFi nh\xF3m {groupName}.",
      adminAddTemplate: "\u2B50 {name} \u0111\u01B0\u1EE3c th\xEAm l\xE0m qu\u1EA3n tr\u1ECB vi\xEAn nh\xF3m {groupName}.",
      adminRemoveTemplate: "\u{1F53B} {name} b\u1ECB thu h\u1ED3i quy\u1EC1n qu\u1EA3n tr\u1ECB vi\xEAn nh\xF3m {groupName}."
    };
  }
});

// src/features/passive-collector.ts
import * as fs7 from "fs";
import * as path4 from "path";
import * as os4 from "os";
function collectGroupMessage(opts) {
  const { groupId, senderId, senderName, content, msgId, silent = true } = opts;
  if (!content?.trim()) return;
  try {
    fs7.mkdirSync(PASSIVE_DIR, { recursive: true });
    const record = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      group_id: groupId,
      sender_id: senderId,
      sender_name: senderName,
      msg: content,
      turn_type: "passive",
      ...msgId ? { msg_id: msgId } : {}
    };
    const filePath = path4.join(PASSIVE_DIR, `${groupId}.jsonl`);
    fs7.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
  } catch (err) {
    if (!silent) throw err;
  }
}
function recallGroupHistory(params) {
  const { groupId, limit = 50, query } = params;
  const filePath = path4.join(PASSIVE_DIR, `${groupId}.jsonl`);
  if (!fs7.existsSync(filePath)) return [];
  const lines = fs7.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  let records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
    }
  }
  if (query) {
    const q = query.toLowerCase();
    records = records.filter(
      (r) => r.msg.toLowerCase().includes(q) || r.sender_name.toLowerCase().includes(q)
    );
  }
  return records.reverse().slice(0, limit);
}
function listPassiveGroups() {
  if (!fs7.existsSync(PASSIVE_DIR)) return [];
  const files = fs7.readdirSync(PASSIVE_DIR).filter((f) => f.endsWith(".jsonl"));
  return files.map((filename) => {
    const groupId = filename.replace(/\.jsonl$/, "");
    const filePath = path4.join(PASSIVE_DIR, filename);
    const lines = fs7.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    let lastTs = null;
    try {
      const last = JSON.parse(lines[lines.length - 1]);
      lastTs = last.ts ?? null;
    } catch {
    }
    return { groupId, recordCount: lines.length, lastTs };
  });
}
var PASSIVE_DIR;
var init_passive_collector = __esm({
  "src/features/passive-collector.ts"() {
    "use strict";
    PASSIVE_DIR = path4.join(
      os4.homedir(),
      ".openclaw",
      "workspace",
      "zaloclaw",
      "passive"
    );
  }
});

// src/features/injection-guard.ts
function isInjectionAttempt(text) {
  if (!text) return false;
  return INJECTION_PATTERNS.some((p) => p.test(text));
}
function getKey(groupId, userId) {
  return `${groupId}:${userId}`;
}
function getRecord(key) {
  const now = Date.now();
  const existing = violations.get(key);
  if (existing) {
    if (now - existing.lastAt > RESET_MS) {
      violations.delete(key);
      return { count: 0, lastAt: now, warned: false };
    }
    return existing;
  }
  return { count: 0, lastAt: now, warned: false };
}
async function checkInjection(ctx) {
  if (!isInjectionAttempt(ctx.message)) return false;
  const key = getKey(ctx.groupId, ctx.userId);
  const record = getRecord(key);
  record.count++;
  record.lastAt = Date.now();
  violations.set(key, record);
  ctx.log?.(`[injection-guard] attempt #${record.count} from ${ctx.userName} (${ctx.userId}) in ${ctx.groupId}`);
  if (record.count >= BLOCK_THRESHOLD) {
    const autoRemove = ctx.autoRemove ?? false;
    if (autoRemove) {
      ctx.log?.(`[injection-guard] removing ${ctx.userName} from group after ${record.count} attempts`);
      try {
        await ctx.api.removeUserFromGroup(ctx.userId, ctx.groupId);
      } catch (err) {
        ctx.log?.(`[injection-guard] remove failed: ${String(err)}`);
      }
      violations.delete(key);
    } else {
      ctx.log?.(`[injection-guard] BLOCK_THRESHOLD reached for ${ctx.userName} (autoRemove=false \u2014 warn only)`);
    }
    return true;
  }
  if (record.count >= WARN_THRESHOLD && !record.warned) {
    record.warned = true;
    violations.set(key, record);
    const warningPrefix = "\u26A0\uFE0F ";
    const mentionText = `@${ctx.userName}`;
    const warningText = `${warningPrefix}${mentionText} \u2014 Em ph\xE1t hi\u1EC7n b\u1EA1n \u0111ang c\u1ED1 g\u1EAFng can thi\u1EC7p v\xE0o c\xE1ch em ho\u1EA1t \u0111\u1ED9ng.

H\xE0nh vi n\xE0y kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p trong nh\xF3m. N\u1EBFu ti\u1EBFp t\u1EE5c, b\u1EA1n s\u1EBD b\u1ECB x\xF3a kh\u1ECFi nh\xF3m t\u1EF1 \u0111\u1ED9ng.`;
    const mentionPos = warningPrefix.length;
    const mention = { pos: mentionPos, uid: ctx.userId, len: mentionText.length };
    try {
      await ctx.api.sendMessage({ msg: warningText, mentions: [mention] }, ctx.groupId, 1);
    } catch (err) {
      ctx.log?.(`[injection-guard] warning send failed: ${String(err)}`);
    }
    return true;
  }
  return true;
}
var violations, RESET_MS, WARN_THRESHOLD, BLOCK_THRESHOLD, INJECTION_PATTERNS;
var init_injection_guard = __esm({
  "src/features/injection-guard.ts"() {
    "use strict";
    violations = /* @__PURE__ */ new Map();
    RESET_MS = 60 * 60 * 1e3;
    WARN_THRESHOLD = 2;
    BLOCK_THRESHOLD = 3;
    INJECTION_PATTERNS = [
      // English
      /ignore\s+(previous|all|your)\s+(instructions?|rules?|prompt)/i,
      /forget\s+(your|all|previous)\s+(rules?|instructions?|training)/i,
      /you\s+are\s+now\s+/i,
      /act\s+as\s+(if\s+you\s+are|a\s+different|an?\s+)/i,
      /pretend\s+(you\s+are|to\s+be)/i,
      /bypass\s+(your\s+)?(rules?|restrictions?|filter|safety)/i,
      /jailbreak/i,
      /do\s+anything\s+now/i,
      /DAN\s+mode/i,
      /system\s*prompt/i,
      /reveal\s+(your\s+)?(instructions?|prompt|system)/i,
      /override\s+(your\s+)?(instructions?|rules?)/i,
      /new\s+persona/i,
      /disregard\s+(your\s+)?(previous|all)/i,
      // Vietnamese
      /bỏ\s*qua\s+(hướng\s*dẫn|quy\s*tắc|lệnh\s*trước)/i,
      /quên\s+(đi\s+)?(tất\s+cả|quy\s*tắc|hướng\s*dẫn)/i,
      /giả\s*vờ\s+(là|bạn\s+là|em\s+là)/i,
      /đóng\s*vai\s+(là|một)/i,
      /bây\s+giờ\s+bạn\s+là/i,
      /mày\s+là\s+/i,
      /không\s+có\s+(giới\s*hạn|quy\s*tắc|hạn\s*chế)/i,
      /vượt\s+qua\s+(giới\s*hạn|bộ\s*lọc)/i,
      /tiết\s+lộ\s+(system\s+prompt|hướng\s+dẫn|lệnh\s+hệ\s+thống)/i,
      /lọc\s+.*(xnxx|porn|sex|18\+|người\s+lớn)/i,
      /tìm\s+.*(xnxx|porn|sex|18\+)/i
    ];
  }
});

// src/features/msg-id-store.ts
function recordMsgId(msgId, cliMsgId, threadId, isGroup) {
  if (!msgId || !cliMsgId) return;
  if (store.size > MAX_ENTRIES) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of store) {
      if (v.ts < cutoff) store.delete(k);
    }
  }
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(msgId, { cliMsgId, threadId, isGroup, ts: Date.now() });
}
function lookupCliMsgId(msgId) {
  const entry = store.get(msgId);
  if (!entry) return void 0;
  if (Date.now() - entry.ts > TTL_MS) {
    store.delete(msgId);
    return void 0;
  }
  return entry;
}
var store, MAX_ENTRIES, TTL_MS;
var init_msg_id_store = __esm({
  "src/features/msg-id-store.ts"() {
    "use strict";
    store = /* @__PURE__ */ new Map();
    MAX_ENTRIES = 500;
    TTL_MS = 30 * 60 * 1e3;
  }
});

// src/channel/thread-queue.ts
var DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_PER_THREAD, DEFAULT_MAX_AGE_MS, DEFAULT_PROCESSING_TIMEOUT_MS, ThreadMessageQueue;
var init_thread_queue = __esm({
  "src/channel/thread-queue.ts"() {
    "use strict";
    DEFAULT_MAX_CONCURRENT = 1;
    DEFAULT_MAX_PER_THREAD = 10;
    DEFAULT_MAX_AGE_MS = 5 * 60 * 1e3;
    DEFAULT_PROCESSING_TIMEOUT_MS = 3 * 60 * 1e3;
    ThreadMessageQueue = class {
      #maxConcurrent;
      #maxPerThread;
      #maxAgeMs;
      #processingTimeoutMs;
      #handler;
      #onDrop;
      #onTimeout;
      #onError;
      #onStale;
      #threads = /* @__PURE__ */ new Map();
      #activeCount = 0;
      /** Threads waiting for a global concurrency slot (FIFO). */
      #pendingThreads = [];
      constructor(options) {
        this.#maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
        this.#maxPerThread = options.maxPerThread ?? DEFAULT_MAX_PER_THREAD;
        this.#maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
        this.#processingTimeoutMs = options.processingTimeoutMs ?? DEFAULT_PROCESSING_TIMEOUT_MS;
        this.#handler = options.handler;
        this.#onDrop = options.onDrop;
        this.#onTimeout = options.onTimeout;
        this.#onError = options.onError;
        this.#onStale = options.onStale;
      }
      /** Enqueue a message for processing. Returns true if accepted, false if dropped. */
      enqueue(threadId, data) {
        let state = this.#threads.get(threadId);
        if (!state) {
          state = { queue: [], processing: false };
          this.#threads.set(threadId, state);
        }
        const entry = {
          data,
          threadId,
          enqueuedAt: Date.now()
        };
        if (state.queue.length >= this.#maxPerThread) {
          const dropped = state.queue.shift();
          this.#onDrop?.(threadId, dropped);
        }
        state.queue.push(entry);
        this.#tryDrain(threadId);
        return true;
      }
      /** Number of threads currently processing a message. */
      get activeCount() {
        return this.#activeCount;
      }
      /** Total number of messages pending across all threads. */
      get pendingCount() {
        let total = 0;
        for (const state of this.#threads.values()) {
          total += state.queue.length;
        }
        return total;
      }
      /** Number of threads that have pending messages. */
      get pendingThreadCount() {
        let count = 0;
        for (const state of this.#threads.values()) {
          if (state.queue.length > 0) count++;
        }
        return count;
      }
      /** Snapshot of per-thread queue depths. */
      threadStats() {
        const result = /* @__PURE__ */ new Map();
        for (const [id, state] of this.#threads) {
          if (state.queue.length > 0 || state.processing) {
            result.set(id, { pending: state.queue.length, processing: state.processing });
          }
        }
        return result;
      }
      /** Attempt to start processing the next message for `threadId`. */
      #tryDrain(threadId) {
        const state = this.#threads.get(threadId);
        if (!state || state.processing || state.queue.length === 0) return;
        if (this.#activeCount >= this.#maxConcurrent) {
          if (!this.#pendingThreads.includes(threadId)) {
            this.#pendingThreads.push(threadId);
          }
          return;
        }
        this.#processNext(threadId, state);
      }
      /** Pop the next non-stale message from the thread queue and process it. */
      #processNext(threadId, state) {
        const now = Date.now();
        while (state.queue.length > 0) {
          const next = state.queue[0];
          if (now - next.enqueuedAt > this.#maxAgeMs) {
            state.queue.shift();
            this.#onStale?.(threadId, next);
            continue;
          }
          break;
        }
        if (state.queue.length === 0) {
          this.#cleanupThread(threadId);
          return;
        }
        const entry = state.queue.shift();
        state.processing = true;
        this.#activeCount++;
        const timeoutPromise = new Promise((resolve7) => {
          const timer = setTimeout(() => resolve7("timeout"), this.#processingTimeoutMs);
          if (typeof timer === "object" && "unref" in timer) {
            timer.unref();
          }
        });
        const handlerPromise = this.#handler(entry.data).then(() => "done").catch((err) => {
          this.#onError?.(threadId, err);
          return "error";
        });
        void Promise.race([handlerPromise, timeoutPromise]).then((result) => {
          if (result === "timeout") {
            this.#onTimeout?.(threadId);
          }
          state.processing = false;
          this.#activeCount--;
          if (state.queue.length > 0) {
            this.#tryDrain(threadId);
          } else {
            this.#cleanupThread(threadId);
          }
          this.#drainPendingThread();
        });
      }
      /** Remove empty, idle thread state to prevent unbounded Map growth. */
      #cleanupThread(threadId) {
        const state = this.#threads.get(threadId);
        if (state && !state.processing && state.queue.length === 0) {
          this.#threads.delete(threadId);
        }
      }
      /** Start processing for the next thread waiting for a concurrency slot. */
      #drainPendingThread() {
        while (this.#pendingThreads.length > 0 && this.#activeCount < this.#maxConcurrent) {
          const nextThreadId = this.#pendingThreads.shift();
          const state = this.#threads.get(nextThreadId);
          if (state && !state.processing && state.queue.length > 0) {
            this.#processNext(nextThreadId, state);
            return;
          }
        }
      }
      /** Clear all queues and reset state. For testing only. */
      _reset() {
        this.#threads.clear();
        this.#pendingThreads.length = 0;
        this.#activeCount = 0;
      }
    };
  }
});

// src/channel/monitor.ts
var monitor_exports = {};
__export(monitor_exports, {
  _convertToZaloClawMessage: () => convertToZaloClawMessage,
  _filterAttachableMediaPaths: () => filterAttachableMediaPaths,
  _isDuplicateMsg: () => isDuplicateMsg,
  _isSystemNotificationContent: () => isSystemNotificationContent,
  _processedMsgIds: () => processedMsgIds,
  monitorZaloClawProvider: () => monitorZaloClawProvider
});
import { createReplyPrefixOptions, createTypingCallbacks } from "openclaw/plugin-sdk/channel-reply-pipeline";
import { logTypingFailure, logAckFailure } from "openclaw/plugin-sdk/channel-feedback";
import { mergeAllowlist, summarizeMapping } from "openclaw/plugin-sdk/allow-from";
import { ThreadType as ThreadType2, FriendEventType, Reactions } from "zca-js";
import * as fs8 from "fs";
import * as path5 from "path";
import * as crypto4 from "crypto";
import sharp2 from "sharp";
function resolveMentionGatingWithBypass(params) {
  if (!params.isGroup || !params.requireMention) return { shouldSkip: false };
  if (params.wasMentioned) return { shouldSkip: false };
  if (params.allowTextCommands && params.hasControlCommand && params.commandAuthorized) return { shouldSkip: false };
  return { shouldSkip: true };
}
function bufferGroupMessage(groupId, entry) {
  let buffer = groupMessageBuffer.get(groupId) ?? [];
  buffer.push(entry);
  const cutoff = Math.floor(Date.now() / 1e3) - GROUP_BUFFER_MAX_AGE_S;
  buffer = buffer.filter((m) => m.timestamp > cutoff).slice(-GROUP_BUFFER_MAX_MESSAGES);
  groupMessageBuffer.set(groupId, buffer);
}
function consumeGroupBuffer(groupId) {
  const buffer = groupMessageBuffer.get(groupId);
  if (!buffer || buffer.length === 0) return { text: "" };
  const lines = buffer.map((m) => {
    return `[${m.senderName}]: ${m.content}`;
  });
  groupMessageBuffer.delete(groupId);
  return { text: lines.join("\n") };
}
function cacheInboundMessage(threadId, data) {
  if (lastInboundMessage.size >= INBOUND_CACHE_MAX && !lastInboundMessage.has(threadId)) {
    const oldest = lastInboundMessage.keys().next().value;
    if (oldest) lastInboundMessage.delete(oldest);
  }
  lastInboundMessage.set(threadId, {
    msgId: data.msgId,
    cliMsgId: data.cliMsgId,
    content: data.content,
    msgType: data.msgType ?? "webchat",
    uidFrom: data.uidFrom,
    ts: data.ts,
    ttl: data.ttl ?? 0,
    propertyExt: data.propertyExt
  });
}
function isDuplicateMsg(msgId) {
  if (!msgId) return false;
  const now = Date.now();
  if (processedMsgIds.has(msgId)) return true;
  if (processedMsgIds.size >= DEDUP_MAX) {
    for (const [id, ts] of processedMsgIds) {
      if (now - ts > DEDUP_TTL) processedMsgIds.delete(id);
    }
    if (processedMsgIds.size >= DEDUP_MAX) {
      const oldest = processedMsgIds.keys().next().value;
      if (oldest) processedMsgIds.delete(oldest);
    }
  }
  processedMsgIds.set(msgId, now);
  return false;
}
function isSystemNotificationContent(content) {
  const normalized = content.trim();
  return SYSTEM_NOTIFICATION_PATTERNS.some((pattern) => pattern.test(normalized));
}
function pushMediaUrl(mediaUrls, mediaTypes, url, mimeType) {
  if (typeof url !== "string" || !url.trim()) return;
  const trimmed = url.trim();
  if (mediaUrls.includes(trimmed)) return;
  mediaUrls.push(trimmed);
  mediaTypes.push(mimeType);
}
function mediaMimeFromObject(obj) {
  const raw = [
    obj.type,
    obj.mediaType,
    obj.contentType,
    obj.mimeType,
    obj.msgType
  ].map((value) => typeof value === "string" || typeof value === "number" ? String(value).toLowerCase() : "").join(" ");
  if (raw.includes("photo") || raw.includes("image")) return "image/jpeg";
  if (raw.includes("video")) return "video/mp4";
  if (raw.includes("audio") || raw.includes("voice")) return "audio/mpeg";
  if (raw.includes("file") || raw.includes("attach")) return "application/octet-stream";
  if (typeof obj.fileUrl === "string" || typeof obj.extention === "string") return "application/octet-stream";
  return void 0;
}
function looksLikeExplicitFileObject(obj, url) {
  const hasFileName = ["fileName", "filename", "name"].some((key) => typeof obj[key] === "string" && String(obj[key]).trim().length > 0);
  const hasFileSize = ["fileSize", "size"].some((key) => obj[key] !== void 0 && obj[key] !== null);
  const hasFileUrl = typeof obj.fileUrl === "string" && obj.fileUrl.trim().length > 0;
  return hasFileName || hasFileSize || hasFileUrl || GENERIC_FILE_URL_RE.test(url) || IMAGE_URL_RE.test(url);
}
function fileSha256(filePath) {
  try {
    return crypto4.createHash("sha256").update(fs8.readFileSync(filePath)).digest("hex");
  } catch {
    return void 0;
  }
}
function looksLikeHtmlFile(filePath) {
  try {
    const head = fs8.readFileSync(filePath).subarray(0, 512).toString("utf8").trim().toLowerCase();
    return head.includes("<!doctype") || head.includes("<html") || head.includes("<head");
  } catch {
    return false;
  }
}
function getQuoteForThread(threadId) {
  const cached = lastInboundMessage.get(threadId);
  if (!cached) return void 0;
  return {
    content: cached.content,
    msgType: cached.msgType,
    propertyExt: cached.propertyExt,
    uidFrom: cached.uidFrom,
    msgId: cached.msgId,
    cliMsgId: cached.cliMsgId,
    ts: String(cached.ts),
    ttl: cached.ttl
  };
}
async function resolveUserName(userId) {
  const cached = nameCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < NAME_CACHE_TTL) return cached.name;
  try {
    const api = await getApi();
    const userInfo = await api.getUserInfo(userId);
    const profile = userInfo?.changed_profiles?.[userId];
    const name = profile?.displayName || profile?.zaloName || userId;
    nameCache.set(userId, { name, cachedAt: Date.now() });
    return name;
  } catch {
    return userId;
  }
}
async function resolveGroupName(groupId) {
  const cached = groupNameCache.get(groupId);
  if (cached && Date.now() - cached.cachedAt < NAME_CACHE_TTL) return cached.name;
  try {
    const api = await getApi();
    const infoResp = await api.getGroupInfo([groupId]);
    const info = infoResp?.gridInfoMap?.[groupId];
    const name = info?.name || `group:${groupId}`;
    groupNameCache.set(groupId, { name, cachedAt: Date.now() });
    return name;
  } catch {
    return `group:${groupId}`;
  }
}
function normalizeZaloClawEntry(entry) {
  return entry.replace(/^(zaloclaw|oz):/i, "").trim();
}
function buildNameIndex(items, nameFn) {
  const index = /* @__PURE__ */ new Map();
  for (const item of items) {
    const name = nameFn(item)?.trim().toLowerCase();
    if (!name) continue;
    const list = index.get(name) ?? [];
    list.push(item);
    index.set(name, list);
  }
  return index;
}
function logVerbose(core, runtime2, message) {
  if (core.logging.shouldLogVerbose()) {
    runtime2.log(`[zaloclaw] ${message}`);
  }
}
function isSenderAllowed(senderId, allowFrom) {
  if (allowFrom.includes("*")) return true;
  const normalizedSenderId = senderId.toLowerCase();
  return allowFrom.some((entry) => {
    const normalized = entry.toLowerCase().replace(/^(zaloclaw|oz):/i, "");
    return normalized === normalizedSenderId;
  });
}
function isSenderDenied(senderId, denyFrom) {
  if (denyFrom.length === 0) return false;
  const normalizedSenderId = senderId.toLowerCase();
  return denyFrom.some((entry) => {
    const normalized = entry.toLowerCase().replace(/^(zaloclaw|oz):/i, "");
    return normalized === normalizedSenderId;
  });
}
function isUserDeniedInGroup(params) {
  const groups = params.groups ?? {};
  const candidates = [
    params.groupId,
    `group:${params.groupId}`,
    params.groupName ?? "",
    normalizeGroupSlug(params.groupName ?? "")
  ].filter(Boolean);
  for (const candidate of candidates) {
    const groupConfig = groups[candidate];
    if (!groupConfig || !groupConfig.denyUsers) continue;
    const denyUsers = groupConfig.denyUsers.map((v) => String(v));
    if (isSenderDenied(params.senderId, denyUsers)) return true;
  }
  const wildcard = groups["*"];
  if (wildcard?.denyUsers) {
    const denyUsers = wildcard.denyUsers.map((v) => String(v));
    if (isSenderDenied(params.senderId, denyUsers)) return true;
  }
  return false;
}
function checkGroupAllowUsers(params) {
  const groups = params.groups ?? {};
  const candidates = [
    params.groupId,
    `group:${params.groupId}`,
    params.groupName ?? "",
    normalizeGroupSlug(params.groupName ?? "")
  ].filter(Boolean);
  for (const candidate of candidates) {
    const groupConfig = groups[candidate];
    if (groupConfig?.allowUsers && groupConfig.allowUsers.length > 0) {
      return isSenderAllowed(params.senderId, groupConfig.allowUsers.map((v) => String(v)));
    }
  }
  const wildcard = groups["*"];
  if (wildcard?.allowUsers && wildcard.allowUsers.length > 0) {
    return isSenderAllowed(params.senderId, wildcard.allowUsers.map((v) => String(v)));
  }
  return void 0;
}
function normalizeGroupSlug(raw) {
  const trimmed = raw?.trim().toLowerCase() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(/^#/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function isGroupAllowed(params) {
  const groups = params.groups ?? {};
  const keys = Object.keys(groups);
  if (keys.length === 0) return false;
  const candidates = [
    params.groupId,
    `group:${params.groupId}`,
    params.groupName ?? "",
    normalizeGroupSlug(params.groupName ?? "")
  ].filter(Boolean);
  for (const candidate of candidates) {
    const entry = groups[candidate];
    if (!entry) continue;
    return entry.allow !== false && entry.enabled !== false;
  }
  const wildcard = groups["*"];
  if (wildcard) return wildcard.allow !== false && wildcard.enabled !== false;
  return false;
}
function renameFilesFromMessageContent(messageText, localPaths) {
  const filenamePattern = /([\w][\w.\-_]*\.(?:csv|pdf|docx?|xlsx?|txt|zip|rar|7z|pptx?|odt|ods|jpg|jpeg|png|gif|bmp|webp|mp[34]|avi|mkv))/gi;
  const matches = messageText.match(filenamePattern) ?? [];
  if (matches.length === 0 || localPaths.length === 0) return localPaths;
  const renamed = [];
  const usedNames = /* @__PURE__ */ new Set();
  for (let i = 0; i < localPaths.length; i++) {
    const fp = localPaths[i];
    const targetName = i < matches.length ? matches[i] : void 0;
    if (targetName && !usedNames.has(targetName)) {
      const safeName = targetName.replace(/[\/\\]/g, "_").substring(0, 120);
      const dir = path5.dirname(fp);
      const newPath = path5.join(dir, safeName);
      try {
        let finalPath = newPath;
        let counter = 1;
        while (fs8.existsSync(finalPath)) {
          const ext = path5.extname(safeName);
          const base = path5.basename(safeName, ext);
          finalPath = path5.join(dir, `${base}_${counter}${ext}`);
          counter++;
        }
        fs8.renameSync(fp, finalPath);
        console.log(`[zaloclaw] Renamed ${fp} \u2192 ${finalPath}`);
        renamed.push(finalPath);
        usedNames.add(safeName);
      } catch (err) {
        console.warn(`[zaloclaw] Failed to rename ${fp}: ${err}`);
        renamed.push(fp);
      }
    } else {
      renamed.push(fp);
    }
  }
  return renamed;
}
function extractMediaFromObject(obj, mediaUrls, mediaTypes) {
  if (!obj || typeof obj !== "object") return "";
  const record = obj;
  const title = typeof record.title === "string" ? record.title : "";
  const description = typeof record.description === "string" ? record.description : "";
  const mimeType = mediaMimeFromObject(record);
  const photoUrl = record.hdUrl || record.normalUrl || record.oriUrl || record.thumbUrl;
  if (photoUrl) {
    pushMediaUrl(mediaUrls, mediaTypes, photoUrl, "image/jpeg");
  }
  const urlCandidates = [
    [record.fileUrl, "fileUrl"],
    [record.href, "href"],
    [record.url, "url"]
  ];
  for (const [candidate] of urlCandidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const trimmedUrl = candidate.trim();
    const resolvedMime = mimeType ?? (IMAGE_URL_RE.test(trimmedUrl) ? "image/jpeg" : "application/octet-stream");
    if (mimeType || looksLikeExplicitFileObject(record, trimmedUrl)) {
      pushMediaUrl(mediaUrls, mediaTypes, trimmedUrl, resolvedMime);
      break;
    }
  }
  const fileName = typeof record.fileName === "string" ? record.fileName.trim() : "";
  if (title || description) return title || description;
  if (fileName) {
    const rawSize = record.fileSize ?? record.size;
    const sizeStr = typeof rawSize === "number" && rawSize > 0 ? ` (${(rawSize / 1024).toFixed(0)} KB)` : "";
    return `[File: ${fileName}${sizeStr}]`;
  }
  return mediaUrls.length > 0 ? "[Media attachment]" : "";
}
function convertToZaloClawMessage(msg) {
  const data = msg.data;
  let content = "";
  const mediaUrls = [];
  const mediaTypes = [];
  if (typeof data.content === "string") {
    const trimmed = data.content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) {
          content = extractMediaFromObject(parsed, mediaUrls, mediaTypes);
          if (!content && !mediaUrls.length) content = data.content;
        } else {
          content = data.content;
        }
      } catch {
        content = data.content;
      }
    } else {
      content = data.content;
    }
  } else if (typeof data.content === "object" && data.content !== null) {
    const attachment = data.content;
    content = extractMediaFromObject(attachment, mediaUrls, mediaTypes);
    if (!content && mediaUrls.length > 0) content = "[Media attachment]";
  }
  if (content && isSystemNotificationContent(content)) return null;
  if (!content.trim() && mediaUrls.length === 0) return null;
  if (!msg.threadId) return null;
  const quote = data.quote;
  const isGroup = msg.type === ThreadType2.Group;
  const threadId = msg.threadId;
  const rawSenderId = data.uidFrom;
  const senderId = !isGroup && (!rawSenderId?.trim() || !/^\d+$/.test(rawSenderId.trim())) ? (console.warn(`[monitor] DM uidFrom empty/non-numeric ("${rawSenderId}"), falling back to threadId ${threadId}`), threadId) : rawSenderId;
  const senderName = data.dName ?? "";
  const timestamp = data.ts ? parseInt(data.ts, 10) : Math.floor(Date.now() / 1e3);
  const mentions = isGroup && msg.data.mentions ? msg.data.mentions : void 0;
  return {
    threadId,
    msgId: data.msgId,
    cliMsgId: data.cliMsgId,
    type: isGroup ? 1 : 0,
    content: content || "[Media]",
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : void 0,
    mediaTypes: mediaTypes.length > 0 ? mediaTypes : void 0,
    mentions: mentions ?? void 0,
    timestamp,
    rawContent: (() => {
      const msgTypeStr = String(data.msgType ?? "");
      const MEDIA_TYPES = ["chat.photo", "chat.gif", "chat.video.msg", "share.file", "chat.sticker", "chat.doodle"];
      if (MEDIA_TYPES.includes(msgTypeStr) && typeof data.content === "string") {
        const trimmed = data.content.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            return JSON.parse(trimmed);
          } catch {
          }
        }
      }
      return data.content;
    })(),
    rawMsgType: String(data.msgType ?? "webchat"),
    propertyExt: data.propertyExt ?? void 0,
    quote: quote ? {
      msg: quote.msg || void 0,
      fromId: quote.ownerId || void 0,
      fromName: quote.fromD || void 0,
      msgId: quote.globalMsgId ? String(quote.globalMsgId) : void 0,
      ts: quote.ts || void 0,
      attach: typeof quote.attach === "string" && quote.attach.trim() ? quote.attach.trim() : void 0
    } : void 0,
    metadata: {
      isGroup,
      groupId: isGroup ? threadId : void 0,
      senderName,
      fromId: senderId
    }
  };
}
function isImageAttachment(url, mediaType) {
  const type = mediaType?.toLowerCase() ?? "";
  return type.startsWith("image/") || IMAGE_URL_RE.test(url);
}
async function downloadInboundMedia(message) {
  const urls = message.mediaUrls ?? [];
  const mediaTypes = message.mediaTypes ?? [];
  const downloaded = [];
  const seenUrls = /* @__PURE__ */ new Set();
  const seenHashes = /* @__PURE__ */ new Set();
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    const mediaType = mediaTypes[i];
    const localPath = isImageAttachment(url, mediaType) ? await downloadImageFromUrl(url) : await downloadFileFromUrl(url);
    if (!localPath) continue;
    const hash = fileSha256(localPath);
    if (hash && seenHashes.has(hash)) {
      try {
        fs8.rmSync(localPath, { force: true });
      } catch {
      }
      continue;
    }
    if (hash) seenHashes.add(hash);
    if (!downloaded.includes(localPath)) downloaded.push(localPath);
  }
  return downloaded;
}
async function filterAttachableMediaPaths(paths) {
  const filtered = [];
  for (const filePath of paths) {
    try {
      const metadata = await sharp2(filePath).metadata();
      if (metadata.width && metadata.height) {
        const minSide = Math.min(metadata.width, metadata.height);
        const maxSide = Math.max(metadata.width, metadata.height);
        const aspectRatio = maxSide / minSide;
        if (minSide < 180) {
          console.warn(`[zaloclaw] Dropping tiny image attachment ${filePath} (${metadata.width}x${metadata.height})`);
          continue;
        }
        if (aspectRatio >= 4 && minSide < 300) {
          console.warn(`[zaloclaw] Dropping banner-like image attachment ${filePath} (${metadata.width}x${metadata.height})`);
          continue;
        }
      }
    } catch {
      if (IMAGE_URL_RE.test(filePath) || looksLikeHtmlFile(filePath)) {
        console.warn(`[zaloclaw] Dropping invalid image attachment ${filePath}`);
        continue;
      }
    }
    filtered.push(filePath);
  }
  return filtered;
}
async function processMessage(message, account, config, core, runtime2, statusSink) {
  const { threadId, content, timestamp, metadata } = message;
  if (!content?.trim()) return;
  if (message.msgId && message.cliMsgId) {
    recordMsgId(message.msgId, message.cliMsgId, threadId, metadata?.isGroup ?? false);
  }
  if (message.msgId && message.cliMsgId) {
    cacheInboundMessage(threadId, {
      msgId: message.msgId,
      cliMsgId: message.cliMsgId,
      content: message.rawContent ?? message.content,
      msgType: message.rawMsgType ?? "webchat",
      uidFrom: metadata?.fromId ?? "",
      ts: timestamp ?? Math.floor(Date.now() / 1e3),
      ttl: 0,
      propertyExt: message.propertyExt
    });
  }
  const isGroup = metadata?.isGroup ?? false;
  const senderId = metadata?.fromId ?? threadId;
  const senderName = metadata?.senderName ?? "";
  const chatId = threadId;
  if (isGroup) recordGroupId(chatId);
  const configDenyFrom = (account.config.denyFrom ?? []).map((v) => String(v));
  if (configDenyFrom.length > 0 && isSenderDenied(senderId, configDenyFrom)) {
    logVerbose(core, runtime2, `Blocked denied sender ${senderId} via denyFrom`);
    return;
  }
  const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "open";
  const groups = account.config.groups ?? {};
  if (isGroup) {
    if (isUserDeniedInGroup({ senderId, groupId: chatId, groups })) {
      logVerbose(core, runtime2, `Blocked sender ${senderId} denied in group ${chatId}`);
      return;
    }
    const userAllowed = checkGroupAllowUsers({ senderId, groupId: chatId, groups });
    if (userAllowed === false) {
      logVerbose(core, runtime2, `Blocked sender ${senderId} not in group ${chatId} allowUsers`);
      return;
    }
    if (groupPolicy === "disabled") {
      logVerbose(core, runtime2, `Drop group ${chatId} (groupPolicy=disabled)`);
      return;
    }
    if (groupPolicy === "allowlist") {
      if (!isGroupAllowed({ groupId: chatId, groups })) {
        logVerbose(core, runtime2, `Drop group ${chatId} (not allowlisted)`);
        return;
      }
    }
  }
  const dmPolicy2 = account.config.dmPolicy ?? "open";
  const configAllowFrom = (account.config.allowFrom ?? ["*"]).map((v) => String(v));
  let effectiveContent = content.trim();
  if (message.quote?.msg || message.quote?.attach) {
    const quoteSender = message.quote.fromName || message.quote.fromId || "unknown";
    let quoteMediaNote = "";
    if (message.quote.attach) {
      try {
        const attachObj = JSON.parse(message.quote.attach);
        const quoteMediaUrls = [];
        const quoteMediaTypes = [];
        extractMediaFromObject(attachObj, quoteMediaUrls, quoteMediaTypes);
        if (quoteMediaUrls.length > 0) {
          for (let i = 0; i < quoteMediaUrls.length; i++) {
            if (!message.mediaUrls) message.mediaUrls = [];
            if (!message.mediaTypes) message.mediaTypes = [];
            if (!message.mediaUrls.includes(quoteMediaUrls[i])) {
              message.mediaUrls.push(quoteMediaUrls[i]);
              message.mediaTypes.push(quoteMediaTypes[i] ?? "image/jpeg");
            }
          }
          quoteMediaNote = " [with media]";
        } else {
          quoteMediaNote = " [media unavailable \u2014 Zalo CDN URL may have expired]";
        }
      } catch {
      }
    }
    const quoteText = message.quote.msg ? `"${message.quote.msg}"` : "[media]";
    effectiveContent = `[Replying to ${quoteSender}: ${quoteText}${quoteMediaNote}]
${effectiveContent}`;
  }
  const rawBody = effectiveContent;
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, config);
  const storeAllowFrom = !isGroup && (dmPolicy2 !== "open" || shouldComputeAuth) ? await core.channel.pairing.readAllowFromStore({ channel: "zaloclaw", accountId: account.accountId }).catch(() => []) : [];
  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowFrom];
  const useAccessGroups = config.commands?.useAccessGroups !== false;
  const senderAllowedForCommands = isSenderAllowed(senderId, effectiveAllowFrom);
  const commandAuthorized = shouldComputeAuth ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
    useAccessGroups,
    authorizers: [
      { configured: effectiveAllowFrom.length > 0, allowed: senderAllowedForCommands }
    ]
  }) : void 0;
  if (!isGroup) {
    if (dmPolicy2 === "disabled") {
      logVerbose(core, runtime2, `Blocked DM from ${senderId} (dmPolicy=disabled)`);
      return;
    }
    if (dmPolicy2 !== "open") {
      if (!senderAllowedForCommands) {
        if (dmPolicy2 === "pairing") {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "zaloclaw",
            id: senderId,
            accountId: account.accountId,
            meta: { name: senderName || void 0 }
          });
          if (created) {
            logVerbose(core, runtime2, `pairing request sender=${senderId}`);
            try {
              await sendMessageZaloClaw(
                chatId,
                core.channel.pairing.buildPairingReply({
                  channel: "zaloclaw",
                  idLine: `Your Zalo user id: ${senderId}`,
                  code
                })
              );
              statusSink?.({ lastOutboundAt: Date.now() });
            } catch {
            }
          }
        } else {
          logVerbose(core, runtime2, `Blocked unauthorized sender ${senderId} (dmPolicy=${dmPolicy2})`);
        }
        return;
      }
    }
  }
  if (isGroup && core.channel.commands.isControlCommandMessage(rawBody, config) && commandAuthorized !== true) {
    logVerbose(core, runtime2, `Drop control command from unauthorized sender ${senderId}`);
    return;
  }
  const selfUid = getCurrentUid() ?? (await getApi()).getOwnId();
  const wasMentioned = isGroup && selfUid ? (message.mentions ?? []).some((m) => m.uid === selfUid) : false;
  const resolvedRequireMention = isGroup ? resolveGroupMentionSetting(account, chatId) : false;
  const hasControlCommand = core.channel.commands.isControlCommandMessage(rawBody, config);
  if (isGroup && resolvedRequireMention) {
    const mentionGate = resolveMentionGatingWithBypass({
      isGroup: true,
      requireMention: true,
      canDetectMention: true,
      wasMentioned,
      allowTextCommands: true,
      hasControlCommand,
      commandAuthorized: commandAuthorized === true
    });
    if (mentionGate.shouldSkip) {
      const resolvedName = senderName || await resolveUserName(senderId);
      bufferGroupMessage(chatId, {
        senderName: resolvedName,
        content: rawBody,
        timestamp: timestamp ?? Math.floor(Date.now() / 1e3)
      });
      logVerbose(core, runtime2, `Buffered non-mention message in group ${chatId} from ${senderId}`);
      return;
    }
  }
  const peer = isGroup ? { kind: "group", id: chatId } : { kind: "direct", id: senderId };
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "zaloclaw",
    accountId: account.accountId,
    peer: { kind: peer.kind, id: peer.id }
  });
  const resolvedSenderName = senderName || await resolveUserName(senderId);
  const fromLabel = isGroup ? await resolveGroupName(chatId) : resolvedSenderName || `user:${senderId}`;
  try {
    const api = await getApi();
    const type = isGroup ? ThreadType2.Group : ThreadType2.User;
    await api.sendTypingEvent(chatId, type);
  } catch {
  }
  let preTypingDone = false;
  const preTypingInterval = setInterval(async () => {
    if (preTypingDone) {
      clearInterval(preTypingInterval);
      return;
    }
    try {
      const api = await getApi();
      const type = isGroup ? ThreadType2.Group : ThreadType2.User;
      await api.sendTypingEvent(chatId, type);
    } catch {
      clearInterval(preTypingInterval);
    }
  }, 3e3);
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey
  });
  const bufferedContext = isGroup ? consumeGroupBuffer(chatId) : { text: "" };
  let bodyWithSender = isGroup ? `[userId: ${senderId}, name: ${resolvedSenderName}]: ${rawBody}` : rawBody;
  if (bufferedContext.text) {
    bodyWithSender = `[Recent group chat (context only, not addressed to you):
${bufferedContext.text}
]

${bodyWithSender}`;
  }
  if (isGroup && message.mentions && message.mentions.length > 0) {
    const mentionedUserIds = message.mentions.filter((m) => m.type === 0 && m.uid && m.uid !== getCurrentUid()).map((m) => m.uid);
    if (mentionedUserIds.length > 0) {
      try {
        const api = await getApi();
        const userInfos = [];
        for (const uid of mentionedUserIds) {
          try {
            const result = await api.getUserInfo(uid);
            const info = result?.changed_profiles?.[uid];
            if (info) {
              const name = info.displayName ?? info.zaloName ?? uid;
              const gender = info.gender ? ` | gender: ${info.gender}` : "";
              const dob = info.dob ? ` | dob: ${info.dob}` : "";
              userInfos.push(`  - @${name} (userId: ${uid}${gender}${dob})`);
            } else {
              userInfos.push(`  - userId: ${uid} (profile not available)`);
            }
          } catch {
            userInfos.push(`  - userId: ${uid} (lookup failed)`);
          }
        }
        if (userInfos.length > 0) {
          bodyWithSender = `[Mentioned users:
${userInfos.join("\n")}
]

${bodyWithSender}`;
        }
      } catch {
      }
    }
  }
  const shouldProcessMedia = !isGroup || wasMentioned;
  let localMediaPaths;
  if (shouldProcessMedia && message.mediaUrls && message.mediaUrls.length > 0) {
    console.log(`[zaloclaw] Downloading ${message.mediaUrls.length} attachment(s) for native support...`);
    localMediaPaths = await filterAttachableMediaPaths(await downloadInboundMedia(message));
    if (localMediaPaths.length > 0 && rawBody) {
      localMediaPaths = renameFilesFromMessageContent(rawBody, localMediaPaths);
    }
    if (localMediaPaths.length > 0) {
      console.log(`[zaloclaw] Downloaded ${localMediaPaths.length} attachment(s) \u2192 ${localMediaPaths.join(", ")}`);
      const nonImagePaths = localMediaPaths.filter(
        (p) => !IMAGE_URL_RE.test(p)
      );
      if (nonImagePaths.length > 0) {
        const fileLines = nonImagePaths.map((p) => `  - ${p}`).join("\n");
        bodyWithSender = `${bodyWithSender}

[Downloaded file attachment(s) \u2014 use file path(s) below to read/analyze:
${fileLines}]`;
      }
    }
  } else if (!shouldProcessMedia && message.mediaUrls && message.mediaUrls.length > 0) {
    logVerbose(core, runtime2, `Skipping ${message.mediaUrls.length} attachment(s) in group ${chatId} (not mentioned)`);
  }
  const effectiveLocalMediaPaths = localMediaPaths && localMediaPaths.length > 0 ? localMediaPaths : void 0;
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Zalo JS",
    from: fromLabel,
    timestamp: timestamp ? timestamp * 1e3 : void 0,
    previousTimestamp,
    envelope: envelopeOptions,
    body: bodyWithSender
  });
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: isGroup ? `'zaloclaw':group:${chatId}` : `'zaloclaw':${senderId}`,
    To: `'zaloclaw':${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: resolvedSenderName || void 0,
    SenderId: senderId,
    CommandAuthorized: commandAuthorized,
    Provider: "zaloclaw",
    Surface: "zaloclaw",
    MessageSid: message.msgId ?? `${timestamp}`,
    OriginatingChannel: "zaloclaw",
    OriginatingTo: `'zaloclaw':${chatId}`,
    WasMentioned: wasMentioned || void 0,
    // Only attach media when mentioned (groups) or in DMs
    MediaPaths: shouldProcessMedia && effectiveLocalMediaPaths && effectiveLocalMediaPaths.length > 0 ? effectiveLocalMediaPaths : void 0,
    MediaPath: shouldProcessMedia && effectiveLocalMediaPaths && effectiveLocalMediaPaths.length > 0 ? effectiveLocalMediaPaths[0] : void 0,
    MediaUrls: void 0,
    MediaUrl: void 0,
    MediaTypes: shouldProcessMedia && effectiveLocalMediaPaths && effectiveLocalMediaPaths.length > 0 ? message.mediaTypes : void 0
  });
  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime2.error?.(`Failed updating session meta: ${String(err)}`);
    }
  });
  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "zaloclaw",
    accountId: account.accountId
  });
  const ackReaction = (config.messages?.ackReaction ?? "").trim();
  const ackScope = config.messages?.ackReactionScope ?? "group-mentions";
  const removeAckAfterReply = config.messages?.removeAckAfterReply ?? false;
  const shouldAck = Boolean(
    ackReaction && core.channel.reactions.shouldAckReaction({
      scope: ackScope,
      isDirect: !isGroup,
      isGroup,
      isMentionableGroup: isGroup,
      requireMention: false,
      canDetectMention: false,
      effectiveWasMentioned: true,
      shouldBypassMention: true
    })
  );
  let ackReactionPromise = null;
  const resolvedCliMsgId = message.cliMsgId ?? lookupCliMsgId(message.msgId ?? "")?.cliMsgId;
  if (shouldAck && message.msgId && resolvedCliMsgId) {
    const ackMsgId = message.msgId;
    const ackCliMsgId = resolvedCliMsgId;
    ackReactionPromise = (async () => {
      try {
        const api = await getApi();
        const type = isGroup ? ThreadType2.Group : ThreadType2.User;
        const iconMap = {
          heart: Reactions.HEART,
          love: Reactions.HEART,
          like: Reactions.LIKE,
          haha: Reactions.HAHA,
          wow: Reactions.WOW,
          sad: Reactions.CRY,
          cry: Reactions.CRY,
          angry: Reactions.ANGRY,
          "\u{1F44D}": Reactions.LIKE,
          "\u2764\uFE0F": Reactions.HEART,
          "\u{1F606}": Reactions.HAHA,
          "\u{1F62E}": Reactions.WOW,
          "\u{1F622}": Reactions.CRY,
          "\u{1F620}": Reactions.ANGRY,
          "\u{1F440}": Reactions.SURPRISE
        };
        const reactionIcon = iconMap[ackReaction.toLowerCase()] ?? ackReaction;
        await api.addReaction(reactionIcon, {
          data: { msgId: ackMsgId, cliMsgId: ackCliMsgId },
          threadId: chatId,
          type
        });
        return true;
      } catch (err) {
        logAckFailure({
          log: (msg) => logVerbose(core, runtime2, msg),
          channel: "zaloclaw",
          target: chatId,
          error: err
        });
        return false;
      }
    })();
  }
  const typingCallbacks = createTypingCallbacks({
    start: async () => {
      const api = await getApi();
      const type = isGroup ? ThreadType2.Group : ThreadType2.User;
      await api.sendTypingEvent(chatId, type);
    },
    onStartError: (err) => {
      logTypingFailure({
        log: (msg) => logVerbose(core, runtime2, msg),
        channel: "zaloclaw",
        target: chatId,
        action: "start",
        error: err
      });
    }
  });
  const quoteForReply = getQuoteForThread(chatId);
  preTypingDone = true;
  clearInterval(preTypingInterval);
  try {
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: config,
      dispatcherOptions: {
        ...prefixOptions,
        deliver: async (payload) => {
          await deliverZaloClawReply({
            payload,
            chatId,
            isGroup,
            runtime: runtime2,
            core,
            config,
            accountId: account.accountId,
            statusSink,
            quote: quoteForReply,
            tableMode: core.channel.text.resolveMarkdownTableMode({
              cfg: config,
              channel: "zaloclaw",
              accountId: account.accountId
            })
          });
        },
        onError: (err, info) => {
          runtime2.error(`[${account.accountId}] reply failed: ${String(err)}`);
        },
        onReplyStart: typingCallbacks.onReplyStart,
        onIdle: typingCallbacks.onIdle,
        onCleanup: typingCallbacks.onCleanup
      },
      replyOptions: { onModelSelected }
    });
  } finally {
    if (shouldAck && message.msgId && message.cliMsgId) {
      const removeMsgId = message.msgId;
      const removeCliMsgId = message.cliMsgId;
      core.channel.reactions.removeAckReactionAfterReply({
        removeAfterReply: removeAckAfterReply,
        ackReactionPromise,
        ackReactionValue: ackReaction || null,
        remove: async () => {
          const api = await getApi();
          const type = isGroup ? ThreadType2.Group : ThreadType2.User;
          await api.addReaction(Reactions.NONE, {
            data: { msgId: removeMsgId, cliMsgId: removeCliMsgId },
            threadId: chatId,
            type
          });
        },
        onError: (err) => {
          logAckFailure({
            log: (msg) => logVerbose(core, runtime2, msg),
            channel: "zaloclaw",
            target: chatId,
            error: err
          });
        }
      });
    }
  }
}
function resolveGroupMentionSetting(account, groupId) {
  const groups = account.config.groups ?? {};
  const candidates = [groupId, `group:${groupId}`, "*"];
  for (const key of candidates) {
    const entry = groups[key];
    if (entry && typeof entry.requireMention === "boolean") return entry.requireMention;
  }
  return true;
}
function isReasoningOnlyMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(REASONING_PREFIX)) return true;
  if (THINKING_TAG_RE.test(trimmed)) return true;
  return false;
}
function stripThinkingTags(text) {
  return text.replace(/<(?:think|thinking|thought|antthinking)\b[^>]*>[\s\S]*?<\/(?:think|thinking|thought|antthinking)>/gi, "").trim();
}
async function deliverZaloClawReply(params) {
  const { payload, chatId, isGroup, runtime: runtime2, core, config, accountId, statusSink } = params;
  if (payload.isReasoning) {
    logVerbose(core, runtime2, `Skipping reasoning block for ${chatId}`);
    return;
  }
  const tableMode = params.tableMode ?? "code";
  let text = core.channel.text.convertMarkdownTables(payload.text ?? "", tableMode);
  if (text && isReasoningOnlyMessage(text)) {
    logVerbose(core, runtime2, `Skipping reasoning-only message for ${chatId}`);
    return;
  }
  text = stripThinkingTags(text);
  const mediaList = payload.mediaUrls?.length ? payload.mediaUrls : payload.mediaUrl ? [payload.mediaUrl] : [];
  let quoteUsed = false;
  const getQuoteOnce = () => {
    if (quoteUsed || !params.quote) return void 0;
    quoteUsed = true;
    return params.quote;
  };
  if (mediaList.length > 0) {
    let first = true;
    for (const mediaUrl of mediaList) {
      const caption = first ? text : void 0;
      first = false;
      try {
        await sendMessageZaloClaw(chatId, caption ?? "", { mediaUrl, isGroup, quote: getQuoteOnce() });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime2.error(`Media send failed: ${String(err)}`);
      }
    }
    return;
  }
  if (text) {
    const chunkMode = core.channel.text.resolveChunkMode(config, "zaloclaw", accountId);
    const chunks = core.channel.text.chunkMarkdownTextWithMode(text, ZALOJS_TEXT_LIMIT, chunkMode);
    logVerbose(core, runtime2, `Sending ${chunks.length} text chunk(s) to ${chatId}`);
    for (const chunk of chunks) {
      try {
        await sendMessageZaloClaw(chatId, chunk, { isGroup, quote: getQuoteOnce() });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime2.error(`Message send failed: ${String(err)}`);
      }
    }
  }
}
async function monitorZaloClawProvider(options) {
  let { account, config } = options;
  const { abortSignal, statusSink, runtime: runtime2 } = options;
  const core = getZaloClawRuntime();
  let stopped = false;
  let restartTimer = null;
  let keepAliveTimer = null;
  let resolveRunning = null;
  try {
    const allowFromEntries = (account.config.allowFrom ?? []).map((entry) => normalizeZaloClawEntry(String(entry))).filter((entry) => entry && entry !== "*");
    if (allowFromEntries.length > 0) {
      try {
        const api = await getApi();
        const friends = await api.getAllFriends();
        const friendList = Array.isArray(friends) ? friends.map((f) => ({
          userId: String(f.userId),
          displayName: f.displayName ?? f.zaloName ?? "",
          avatar: f.avatar
        })) : [];
        const byName = buildNameIndex(friendList, (friend) => friend.displayName);
        const additions = [];
        const mapping = [];
        const unresolved = [];
        for (const entry of allowFromEntries) {
          if (/^\d+$/.test(entry)) {
            additions.push(entry);
            continue;
          }
          const matches = byName.get(entry.toLowerCase()) ?? [];
          const match = matches[0];
          const id = match?.userId ? String(match.userId) : void 0;
          if (id) {
            additions.push(id);
            mapping.push(`${entry}\u2192${id}`);
          } else {
            unresolved.push(entry);
          }
        }
        const allowFrom = mergeAllowlist({ existing: account.config.allowFrom, additions });
        account = { ...account, config: { ...account.config, allowFrom } };
        summarizeMapping("zaloclaw users", mapping, unresolved, runtime2);
      } catch (err) {
        runtime2.log?.(`zaloclaw user resolve failed. ${String(err)}`);
      }
    }
    const denyFromEntries = (account.config.denyFrom ?? []).map((entry) => normalizeZaloClawEntry(String(entry))).filter((entry) => entry && entry !== "*");
    if (denyFromEntries.length > 0) {
      try {
        const api = await getApi();
        const friends = await api.getAllFriends();
        const friendList = Array.isArray(friends) ? friends.map((f) => ({
          userId: String(f.userId),
          displayName: f.displayName ?? f.zaloName ?? "",
          avatar: f.avatar
        })) : [];
        const byName = buildNameIndex(friendList, (friend) => friend.displayName);
        const additions = [];
        const mapping = [];
        const unresolved = [];
        for (const entry of denyFromEntries) {
          if (/^\d+$/.test(entry)) {
            additions.push(entry);
            continue;
          }
          const matches = byName.get(entry.toLowerCase()) ?? [];
          const match = matches[0];
          const id = match?.userId ? String(match.userId) : void 0;
          if (id) {
            additions.push(id);
            mapping.push(`${entry}\u2192${id}`);
          } else {
            unresolved.push(entry);
          }
        }
        const denyFrom = mergeAllowlist({ existing: account.config.denyFrom, additions });
        account = { ...account, config: { ...account.config, denyFrom } };
        summarizeMapping("zaloclaw blocked users", mapping, unresolved, runtime2);
      } catch (err) {
        runtime2.log?.(`zaloclaw denyFrom resolve failed. ${String(err)}`);
      }
    }
    const groupsConfig = account.config.groups ?? {};
    const groupKeys = Object.keys(groupsConfig).filter((key) => key !== "*");
    if (groupKeys.length > 0) {
      try {
        const api = await getApi();
        const groupsResp = await api.getAllGroups();
        const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});
        let groupList = [];
        if (groupIds.length > 0) {
          try {
            const infoResp = await api.getGroupInfo(groupIds);
            const gridInfoMap = infoResp?.gridInfoMap ?? {};
            groupList = Object.entries(gridInfoMap).map(([id, info]) => ({
              groupId: id,
              name: info.name ?? "",
              memberCount: info.totalMember
            }));
          } catch {
            groupList = groupIds.map((id) => ({ groupId: id, name: "", memberCount: 0 }));
          }
        }
        const byName = buildNameIndex(groupList, (group) => group.name);
        const mapping = [];
        const unresolved = [];
        const nextGroups = { ...groupsConfig };
        for (const entry of groupKeys) {
          const cleaned = normalizeZaloClawEntry(entry);
          if (/^\d+$/.test(cleaned)) {
            if (!nextGroups[cleaned]) nextGroups[cleaned] = groupsConfig[entry];
            mapping.push(`${entry}\u2192${cleaned}`);
            continue;
          }
          const matches = byName.get(cleaned.toLowerCase()) ?? [];
          const match = matches[0];
          const id = match?.groupId ? String(match.groupId) : void 0;
          if (id) {
            if (!nextGroups[id]) nextGroups[id] = groupsConfig[entry];
            mapping.push(`${entry}\u2192${id}`);
          } else {
            unresolved.push(entry);
          }
        }
        for (const groupKey of Object.keys(nextGroups)) {
          const groupConfig = nextGroups[groupKey];
          if (!groupConfig.denyUsers || groupConfig.denyUsers.length === 0) continue;
          const denyUserEntries = groupConfig.denyUsers.map((entry) => normalizeZaloClawEntry(String(entry))).filter((entry) => entry && entry !== "*");
          if (denyUserEntries.length === 0) continue;
          const friends = await api.getAllFriends();
          const friendList = Array.isArray(friends) ? friends.map((f) => ({
            userId: String(f.userId),
            displayName: f.displayName ?? f.zaloName ?? "",
            avatar: f.avatar
          })) : [];
          const friendByName = buildNameIndex(friendList, (friend) => friend.displayName);
          const userAdditions = [];
          const userMapping = [];
          const userUnresolved = [];
          for (const entry of denyUserEntries) {
            if (/^\d+$/.test(entry)) {
              userAdditions.push(entry);
              continue;
            }
            const matches = friendByName.get(entry.toLowerCase()) ?? [];
            const match = matches[0];
            const id = match?.userId ? String(match.userId) : void 0;
            if (id) {
              userAdditions.push(id);
              userMapping.push(`${entry}\u2192${id}`);
            } else {
              userUnresolved.push(entry);
            }
          }
          const resolvedDenyUsers = mergeAllowlist({ existing: groupConfig.denyUsers, additions: userAdditions });
          nextGroups[groupKey] = { ...groupConfig, denyUsers: resolvedDenyUsers };
          if (userMapping.length > 0 || userUnresolved.length > 0) {
            summarizeMapping(`zaloclaw group:${groupKey} blocked users`, userMapping, userUnresolved, runtime2);
          }
        }
        account = { ...account, config: { ...account.config, groups: nextGroups } };
        summarizeMapping("zaloclaw groups", mapping, unresolved, runtime2);
      } catch (err) {
        runtime2.log?.(`zaloclaw group resolve failed. ${String(err)}`);
      }
    }
  } catch (err) {
    runtime2.log?.(`zaloclaw resolve failed. ${String(err)}`);
  }
  const stop = () => {
    stopped = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    resolveRunning?.();
  };
  let listenersRegistered = false;
  const startListener = async () => {
    if (stopped || abortSignal.aborted) {
      resolveRunning?.();
      return;
    }
    logVerbose(core, runtime2, `[${account.accountId}] starting zca-js listener`);
    try {
      const api = await getApi();
      const selfUid = getCurrentUid() ?? api.getOwnId();
      if (listenersRegistered) {
        try {
          api.listener.stop();
        } catch {
        }
        api.listener.start({ retryOnClose: true });
        return;
      }
      listenersRegistered = true;
      const groupIds = Object.keys(account.config.groups ?? {}).filter((k) => k.startsWith("group:") || /^\d+$/.test(k));
      if (groupIds.length > 0) {
        for (const groupId of groupIds) {
          try {
            const history = await api.getGroupChatHistory(groupId, 20);
            const msgs = history?.groupMsgs ?? [];
            for (const gm of msgs) {
              const gmData = gm.data ?? gm;
              const gmContent = typeof gmData.content === "string" ? gmData.content : "";
              const gmSenderName = gmData.dName ?? gmData.uidFrom ?? "unknown";
              const gmTs = gmData.ts ? parseInt(gmData.ts, 10) : 0;
              if (gmContent && gmTs > 0) {
                bufferGroupMessage(groupId, {
                  senderName: gmSenderName,
                  content: gmContent,
                  timestamp: gmTs
                });
              }
            }
            if (msgs.length > 0) {
              logVerbose(core, runtime2, `[${account.accountId}] Prefilled ${msgs.length} messages for group ${groupId}`);
            }
          } catch (err) {
            logVerbose(core, runtime2, `[${account.accountId}] Failed to prefill history for group ${groupId}: ${String(err)}`);
          }
        }
      }
      const messageQueue = new ThreadMessageQueue({
        maxConcurrent: 4,
        maxPerThread: 10,
        maxAgeMs: 5 * 60 * 1e3,
        // 5 minutes
        processingTimeoutMs: 3 * 60 * 1e3,
        // 3 minutes
        handler: (message) => processMessage(message, account, config, core, runtime2, statusSink),
        onDrop: (threadId, dropped) => {
          logVerbose(core, runtime2, `[${account.accountId}] queue overflow: dropped oldest message in thread ${threadId} (msgId=${dropped.data.msgId ?? "?"})`);
        },
        onTimeout: (threadId) => {
          runtime2.error(`[${account.accountId}] message processing timed out for thread ${threadId}`);
        },
        onError: (threadId, err) => {
          runtime2.error(`[${account.accountId}] Failed to process message in thread ${threadId}: ${String(err)}`);
        },
        onStale: (threadId, entry) => {
          logVerbose(core, runtime2, `[${account.accountId}] skipped stale message in thread ${threadId} (age=${Math.round((Date.now() - entry.enqueuedAt) / 1e3)}s)`);
        }
      });
      api.listener.on("message", (msg) => {
        if (msg.isSelf) return;
        if (selfUid && msg.data.uidFrom === selfUid) return;
        if (isDuplicateMsg(msg.data.msgId)) {
          logVerbose(core, runtime2, `[${account.accountId}] skipping duplicate msgId ${msg.data.msgId}`);
          return;
        }
        const converted = convertToZaloClawMessage(msg);
        if (!converted) return;
        logVerbose(core, runtime2, `[${account.accountId}] inbound message`);
        statusSink?.({ lastInboundAt: Date.now() });
        const _passiveEnabled = config?.plugins?.entries?.zaloclaw?.config?.passiveCollector?.enabled === true;
        const _passiveSenderId = converted.metadata?.fromId ?? "";
        if (_passiveEnabled && converted.metadata?.isGroup && _passiveSenderId !== selfUid && converted.threadId) {
          collectGroupMessage({
            groupId: converted.threadId,
            senderId: _passiveSenderId,
            senderName: converted.metadata?.senderName ?? _passiveSenderId,
            content: typeof converted.content === "string" ? converted.content : "",
            msgId: converted.msgId
          });
        }
        if (converted.metadata?.isGroup && typeof converted.content === "string" && converted.threadId) {
          const _injContent = converted.content;
          const _injGroupId = converted.threadId;
          const _injUserId = converted.metadata?.fromId ?? "";
          const _injUserName = converted.metadata?.senderName ?? "unknown";
          checkInjection({
            api,
            groupId: _injGroupId,
            userId: _injUserId,
            userName: _injUserName,
            message: _injContent,
            log: (msg2) => runtime2.log?.(`[${account.accountId}] ${msg2}`)
          }).then((blocked) => {
            if (!blocked) messageQueue.enqueue(converted.threadId, converted);
          }).catch(() => {
            messageQueue.enqueue(converted.threadId, converted);
          });
          return;
        }
        messageQueue.enqueue(converted.threadId, converted);
      });
      api.listener.on("friend_event", (event) => {
        try {
          if (event.type === FriendEventType.REQUEST && !event.isSelf) {
            const data = event.data;
            addPendingRequest(data.fromUid, data.message, data.src);
            runtime2.log?.(`[${account.accountId}] friend request from ${data.fromUid}`);
          } else if (event.type === FriendEventType.UNDO_REQUEST) {
            const data = event.data;
            removePendingRequest(data.fromUid);
          } else if (event.type === FriendEventType.ADD) {
            removePendingRequest(event.data);
          }
        } catch (err) {
          runtime2.error(`[${account.accountId}] friend event error: ${String(err)}`);
        }
      });
      api.listener.on("group_event", (event) => {
        handleGroupEvent(event, {
          api,
          config: account.config?.groupEvents,
          log: (msg) => runtime2.log?.(`[${account.accountId}] ${msg}`)
        }).catch((err) => {
          runtime2.error?.(`[${account.accountId}] group_event handler error: ${String(err)}`);
        });
      });
      api.listener.on("reaction", (reaction) => {
        if (reaction.isSelf) return;
        const icon = reaction.data.content?.rIcon || "";
        const fromUid = reaction.data.uidFrom;
        const threadId = reaction.threadId;
        const isGroup = reaction.isGroup;
        logVerbose(core, runtime2, `[${account.accountId}] reaction: ${icon} from ${fromUid} in ${isGroup ? "group" : "dm"} ${threadId}`);
      });
      api.listener.on("typing", (typing) => {
        if (typing.isSelf) return;
        const threadId = typing.threadId;
        const isGroup = typing.type === ThreadType2.Group;
        logVerbose(core, runtime2, `[${account.accountId}] typing in ${isGroup ? "group" : "dm"} ${threadId}`);
      });
      api.listener.on("seen_messages", (seenObjects) => {
        for (const seen of seenObjects) {
          if (seen.threadId && seen.uid) {
            recordReadReceipt(seen.threadId, seen.uid);
          }
        }
        logVerbose(core, runtime2, `[${account.accountId}] seen_messages: ${seenObjects.length} entries`);
      });
      api.listener.on("error", (err) => {
        runtime2.error(`[${account.accountId}] listener error: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
      });
      api.listener.on("closed", (code, reason) => {
        runtime2.log?.(`[${account.accountId}] listener closed: code=${code} reason=${reason}`);
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
        if (stopped || abortSignal.aborted) resolveRunning?.();
      });
      api.listener.on("connected", () => {
        logVerbose(core, runtime2, `[${account.accountId}] listener connected`);
      });
      api.listener.start({ retryOnClose: true });
      const keepaliveDuration = api.getContext().settings?.keepalive?.keepalive_duration;
      if (keepaliveDuration && keepaliveDuration > 0) {
        const intervalMs = keepaliveDuration * 1e3;
        runtime2.log?.(`[${account.accountId}] keepAlive: ${keepaliveDuration}s interval`);
        keepAliveTimer = setInterval(async () => {
          if (stopped || abortSignal.aborted) return;
          try {
            await api.keepAlive();
            const jar = api.getCookie();
            const serialized = jar.serializeSync?.()?.cookies ?? jar.toJSON?.()?.cookies;
            if (serialized) refreshCredentials(serialized);
          } catch (err) {
            runtime2.error(`[${account.accountId}] keepAlive failed: ${String(err)}`);
          }
        }, intervalMs);
      }
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("Already started")) {
        runtime2.log?.(`[${account.accountId}] listener already running`);
        return;
      }
      runtime2.error(`[${account.accountId}] listener start failed: ${errMsg}`);
      if (!stopped && !abortSignal.aborted) {
        logVerbose(core, runtime2, `[${account.accountId}] retrying in 10s...`);
        restartTimer = setTimeout(startListener, 1e4);
      } else {
        resolveRunning?.();
      }
    }
  };
  const runningPromise = new Promise((resolve7) => {
    resolveRunning = resolve7;
    abortSignal.addEventListener("abort", () => {
      stop();
      resolve7();
    }, { once: true });
  });
  await startListener();
  await runningPromise;
  return { stop };
}
var ZALOJS_TEXT_LIMIT, nameCache, groupNameCache, NAME_CACHE_TTL, groupMessageBuffer, GROUP_BUFFER_MAX_MESSAGES, GROUP_BUFFER_MAX_AGE_S, lastInboundMessage, INBOUND_CACHE_MAX, processedMsgIds, DEDUP_TTL, DEDUP_MAX, SYSTEM_NOTIFICATION_PATTERNS, IMAGE_URL_RE, GENERIC_FILE_URL_RE, THINKING_TAG_RE, REASONING_PREFIX;
var init_monitor = __esm({
  "src/channel/monitor.ts"() {
    "use strict";
    init_runtime();
    init_send();
    init_zalo_client();
    init_image_downloader();
    init_file_downloader();
    init_friend_request_store();
    init_read_receipt();
    init_group_event();
    init_passive_collector();
    init_injection_guard();
    init_msg_id_store();
    init_group_id_cache();
    init_credentials();
    init_thread_queue();
    ZALOJS_TEXT_LIMIT = 2e3;
    nameCache = /* @__PURE__ */ new Map();
    groupNameCache = /* @__PURE__ */ new Map();
    NAME_CACHE_TTL = 60 * 60 * 1e3;
    groupMessageBuffer = /* @__PURE__ */ new Map();
    GROUP_BUFFER_MAX_MESSAGES = 50;
    GROUP_BUFFER_MAX_AGE_S = 4 * 60 * 60;
    lastInboundMessage = /* @__PURE__ */ new Map();
    INBOUND_CACHE_MAX = 500;
    processedMsgIds = /* @__PURE__ */ new Map();
    DEDUP_TTL = 6e4;
    DEDUP_MAX = 2e3;
    SYSTEM_NOTIFICATION_PATTERNS = [
      /^Bạn vừa kết bạn với\b/i,
      /^You (?:are|were) (?:now )?(?:friends|connected) with\b/i,
      /^You just became friends with\b/i
    ];
    IMAGE_URL_RE = /\.(?:jpe?g|png|gif|webp|bmp|svg|tiff?)(?:[?#]|$)/i;
    GENERIC_FILE_URL_RE = /\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar)(?:[?#]|$)/i;
    THINKING_TAG_RE = /^\s*<(?:think|thinking|thought|antthinking)\b[^>]*>/i;
    REASONING_PREFIX = "Reasoning:\n";
  }
});

// index.ts
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

// src/channel/channel.ts
import {
  applyAccountNameToChannelSection,
  DEFAULT_ACCOUNT_ID as DEFAULT_ACCOUNT_ID3,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId as normalizeAccountId3,
  setAccountEnabledInConfigSection
} from "openclaw/plugin-sdk/channel-plugin-common";

// src/client/accounts.ts
init_zalo_client();
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/channel-plugin-common";
function listConfiguredAccountIds(cfg) {
  const accounts = cfg.channels?.["zaloclaw"]?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}
function listZaloClawAccountIds(cfg) {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.toSorted((a, b) => a.localeCompare(b));
}
function resolveDefaultZaloClawAccountId(cfg) {
  const zaloClawConfig = cfg.channels?.["zaloclaw"];
  if (zaloClawConfig?.defaultAccount?.trim()) return zaloClawConfig.defaultAccount.trim();
  const ids = listZaloClawAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}
function resolveAccountConfig(cfg, accountId) {
  const accounts = cfg.channels?.["zaloclaw"]?.accounts;
  if (!accounts || typeof accounts !== "object") return void 0;
  return accounts[accountId];
}
function mergeZaloClawAccountConfig(cfg, accountId) {
  const raw = cfg.channels?.["zaloclaw"] ?? {};
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}
async function checkZaloClawAuthenticated() {
  return hasStoredCredentials();
}
function resolveZaloClawAccountSync(params) {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = params.cfg.channels?.["zaloclaw"]?.enabled !== false;
  const merged = mergeZaloClawAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  return { accountId, name: merged.name?.trim() || void 0, enabled, authenticated: false, config: merged };
}
async function getZaloClawUserInfo() {
  try {
    const { getApi: getApi2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
    const api = await getApi2();
    const raw = await api.fetchAccountInfo();
    const info = raw?.profile ?? raw;
    return info ? { userId: info.userId, displayName: info.displayName } : null;
  } catch {
    return null;
  }
}

// src/config/config-schema.ts
import {
  AllowFromListSchema,
  buildCatchallMultiAccountChannelSchema,
  buildChannelConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema
} from "openclaw/plugin-sdk/channel-config-primitives";
import { ToolPolicySchema } from "openclaw/plugin-sdk/agent-config-primitives";
import { z } from "zod";
var ZaloGroupConfigSchema = z.object({
  /** Whether this group is enabled for the bot. */
  allow: z.boolean().optional(),
  enabled: z.boolean().optional(),
  /** Require @mention before the bot responds in this group. */
  requireMention: z.boolean().optional(),
  /** Explicit per-group allowlist (user IDs or names). */
  allowUsers: AllowFromListSchema,
  /** Explicit per-group denylist. */
  denyUsers: AllowFromListSchema,
  /** Per-group tool execution policy. */
  tools: ToolPolicySchema
});
var GroupEventsSchema = z.object({
  enabled: z.boolean().optional(),
  welcome: z.boolean().optional(),
  leaveAlert: z.boolean().optional(),
  adminAlert: z.boolean().optional(),
  welcomeTemplate: z.string().optional(),
  leaveTemplate: z.string().optional(),
  kickTemplate: z.string().optional(),
  adminAddTemplate: z.string().optional(),
  adminRemoveTemplate: z.string().optional()
}).optional();
var ZaloClawAccountSchema = z.object({
  /** Human-readable label for this account. */
  name: z.string().optional(),
  /** Enable/disable this account. */
  enabled: z.boolean().optional(),
  /** Markdown rendering options (table mode). */
  markdown: MarkdownConfigSchema,
  /** DM access policy: open | pairing | allowlist | disabled. */
  dmPolicy: DmPolicySchema.optional(),
  /** Users allowed to DM. Supports names and numeric IDs. */
  allowFrom: AllowFromListSchema,
  /** Users explicitly denied. */
  denyFrom: AllowFromListSchema,
  /** Group access policy: open | allowlist | disabled. */
  groupPolicy: GroupPolicySchema.optional(),
  /** Per-group overrides keyed by group ID, name, or "*". */
  groups: z.record(z.string(), ZaloGroupConfigSchema).optional(),
  /** Prefix prepended to every outbound message. */
  messagePrefix: z.string().optional(),
  /** Prefix prepended to agent responses. */
  responsePrefix: z.string().optional(),
  /** Group event handlers: welcome, leave, kick, admin alerts. */
  groupEvents: GroupEventsSchema
  // passiveCollector intentionally omitted from channel schema
  // Configure via plugins.entries.zaloclaw.passiveCollector (hidden from UI)
});
var ZaloClawAccountSchemaForSdk = ZaloClawAccountSchema;
var ZaloClawConfigSchema = buildCatchallMultiAccountChannelSchema(ZaloClawAccountSchemaForSdk);
var ZaloClawChannelConfigSchema = buildChannelConfigSchema(
  ZaloClawConfigSchema,
  {
    uiHints: {
      "": {
        label: "ZaloClaw",
        help: "Channel status and configuration."
      },
      dmPolicy: {
        label: "DM Policy",
        help: 'Controls who can message the bot in DMs. "pairing" requires a code exchange, "allowlist" only allows entries in allowFrom, "open" accepts all, "disabled" blocks DMs.'
      },
      groupPolicy: {
        label: "Group Policy",
        help: 'Controls which groups the bot responds in. "open" = all groups, "allowlist" = only groups listed under groups, "disabled" = ignore all groups.'
      },
      allowFrom: {
        label: "Allow From",
        help: "Users allowed to interact in DMs. Use Zalo user IDs or display names. Wildcard: *"
      },
      denyFrom: {
        label: "Deny From",
        help: "Users denied from interacting. Checked before allowFrom."
      },
      "markdown.tables": {
        label: "Markdown Tables",
        help: 'How to render markdown tables: "code" = code block, "bullets" = bullet list, "off" = strip.'
      },
      messagePrefix: {
        label: "Message Prefix",
        help: "Text prepended to every outbound message (e.g. bot name tag)."
      },
      responsePrefix: {
        label: "Response Prefix",
        help: "Text prepended to agent responses."
      },
      groups: {
        label: "Groups",
        help: "Per-group overrides. Key = group ID, name, or * for default."
      },
      "groups.*.requireMention": {
        label: "Require @Mention",
        help: "If true, bot only responds when @mentioned in this group."
      },
      "groups.*.allowUsers": {
        label: "Group Allow Users",
        help: "Only these users can trigger the bot in this group."
      },
      "groups.*.denyUsers": {
        label: "Group Deny Users",
        help: "Block specific users in this group."
      },
      "groups.*.tools": {
        label: "Group Tool Policy",
        help: "Override tool execution permissions for this group."
      }
    }
  }
);

// src/channel/onboarding.ts
import {
  DEFAULT_ACCOUNT_ID as DEFAULT_ACCOUNT_ID2,
  normalizeAccountId as normalizeAccountId2
} from "openclaw/plugin-sdk/channel-plugin-common";
import {
  addWildcardAllowFrom,
  promptAccountId,
  promptChannelAccessConfig
} from "openclaw/plugin-sdk/setup";
import * as fs3 from "fs";
init_zalo_client();
import { LoginQRCallbackEventType as LoginQRCallbackEventType2 } from "zca-js";

// src/client/qr-display.ts
import * as fs2 from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import qrcode from "qrcode-terminal";
import { PNG } from "pngjs";
import jsQR from "jsqr";
async function readQRFromPNG(pngPath) {
  return new Promise((resolve7, reject) => {
    try {
      const buffer = fs2.readFileSync(pngPath);
      const png = PNG.sync.read(buffer);
      const code = jsQR(Uint8ClampedArray.from(png.data), png.width, png.height);
      if (!code) {
        reject(new Error("Could not decode QR code from image"));
        return;
      }
      resolve7(code.data);
    } catch (err) {
      reject(new Error(`Failed to read QR code: ${err instanceof Error ? err.message : String(err)}`));
    }
  });
}
async function displayQRFromPNG(base64Image) {
  const uniqueId = crypto.randomBytes(8).toString("hex");
  const pngPath = path.join(os.tmpdir(), `zaloclaw-qr-${uniqueId}.png`);
  try {
    const buffer = Buffer.from(base64Image, "base64");
    fs2.writeFileSync(pngPath, buffer, { mode: 384 });
    const qrContent = await readQRFromPNG(pngPath);
    console.log("\n");
    qrcode.generate(qrContent, { small: true });
    console.log("\nScan the QR code above with your Zalo app to login");
    console.log(`
QR image saved at: ${pngPath}
`);
    return pngPath;
  } catch (err) {
    try {
      fs2.unlinkSync(pngPath);
    } catch {
    }
    throw new Error(`Failed to display QR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// src/channel/onboarding.ts
var channel = "zaloclaw";
function setZaloClawDmPolicy(cfg, dmPolicy2) {
  const allowFrom = dmPolicy2 === "open" ? addWildcardAllowFrom(cfg.channels?.["zaloclaw"]?.allowFrom) : void 0;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      "zaloclaw": {
        ...cfg.channels?.["zaloclaw"],
        dmPolicy: dmPolicy2,
        ...allowFrom ? { allowFrom } : {}
      }
    }
  };
}
async function noteZaloClawHelp(prompter) {
  await prompter.note(
    [
      "ZaloClaw Account login via QR code.",
      "",
      "Prerequisites:",
      "1) zca-js library (bundled with plugin)",
      "2) You'll scan a QR code with your Zalo app",
      "",
      "No CLI binary needed - uses zca-js library directly."
    ].join("\n"),
    "Zalo JS Setup"
  );
}
async function promptZaloClawAllowFrom(params) {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveZaloClawAccountSync({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const parseInput = (raw) => raw.split(/[\n,;]+/g).map((entry) => entry.trim()).filter(Boolean);
  const resolveUserId2 = async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return trimmed;
    try {
      const { getApi: getApi2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
      const api = await getApi2();
      const friends = await api.getAllFriends();
      const friendList = Array.isArray(friends) ? friends : [];
      const match = friendList.find(
        (f) => (f.displayName ?? "").toLowerCase() === trimmed.toLowerCase()
      );
      return match ? String(match.userId) : null;
    } catch {
      return null;
    }
  };
  while (true) {
    const entry = await prompter.text({
      message: "ZaloClaw allowFrom (username or user id)",
      placeholder: "Alice, 123456789",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : void 0,
      validate: (value) => String(value ?? "").trim() ? void 0 : "Required"
    });
    const parts = parseInput(String(entry));
    const results = await Promise.all(parts.map((part) => resolveUserId2(part)));
    const unresolved = parts.filter((_, idx) => !results[idx]);
    if (unresolved.length > 0) {
      await prompter.note(
        `Could not resolve: ${unresolved.join(", ")}. Use numeric user ids or ensure you are logged in.`,
        "Zalo JS allowlist"
      );
      continue;
    }
    const merged = [
      ...existingAllowFrom.map((item) => String(item).trim()).filter(Boolean),
      ...results.filter(Boolean)
    ];
    const unique = [...new Set(merged)];
    if (accountId === DEFAULT_ACCOUNT_ID2) {
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          "zaloclaw": {
            ...cfg.channels?.["zaloclaw"],
            enabled: true,
            dmPolicy: "allowlist",
            allowFrom: unique
          }
        }
      };
    }
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        "zaloclaw": {
          ...cfg.channels?.["zaloclaw"],
          enabled: true,
          accounts: {
            ...cfg.channels?.["zaloclaw"]?.accounts,
            [accountId]: {
              ...cfg.channels?.["zaloclaw"]?.accounts?.[accountId],
              enabled: cfg.channels?.["zaloclaw"]?.accounts?.[accountId]?.enabled ?? true,
              dmPolicy: "allowlist",
              allowFrom: unique
            }
          }
        }
      }
    };
  }
}
function setZaloClawGroupPolicy(cfg, accountId, groupPolicy) {
  if (accountId === DEFAULT_ACCOUNT_ID2) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        "zaloclaw": { ...cfg.channels?.["zaloclaw"], enabled: true, groupPolicy }
      }
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      "zaloclaw": {
        ...cfg.channels?.["zaloclaw"],
        enabled: true,
        accounts: {
          ...cfg.channels?.["zaloclaw"]?.accounts,
          [accountId]: {
            ...cfg.channels?.["zaloclaw"]?.accounts?.[accountId],
            enabled: cfg.channels?.["zaloclaw"]?.accounts?.[accountId]?.enabled ?? true,
            groupPolicy
          }
        }
      }
    }
  };
}
function setZaloClawGroupAllowlist(cfg, accountId, groupKeys) {
  const groups = Object.fromEntries(groupKeys.map((key) => [key, { allow: true }]));
  if (accountId === DEFAULT_ACCOUNT_ID2) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        "zaloclaw": { ...cfg.channels?.["zaloclaw"], enabled: true, groups }
      }
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      "zaloclaw": {
        ...cfg.channels?.["zaloclaw"],
        enabled: true,
        accounts: {
          ...cfg.channels?.["zaloclaw"]?.accounts,
          [accountId]: {
            ...cfg.channels?.["zaloclaw"]?.accounts?.[accountId],
            enabled: cfg.channels?.["zaloclaw"]?.accounts?.[accountId]?.enabled ?? true,
            groups
          }
        }
      }
    }
  };
}
async function resolveZaloClawGroups(params) {
  try {
    const { getApi: getApi2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
    const api = await getApi2();
    const groupsResp = await api.getAllGroups();
    const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});
    let groups = [];
    if (groupIds.length > 0) {
      try {
        const infoResp = await api.getGroupInfo(groupIds);
        const gridInfoMap = infoResp?.gridInfoMap ?? {};
        groups = Object.entries(gridInfoMap).map(([id, info]) => ({
          groupId: id,
          name: info.name ?? ""
        }));
      } catch {
        groups = [];
      }
    }
    const byName = /* @__PURE__ */ new Map();
    for (const group of groups) {
      const name = group.name?.trim().toLowerCase();
      if (!name) continue;
      const list = byName.get(name) ?? [];
      list.push(group);
      byName.set(name, list);
    }
    return params.entries.map((input) => {
      const trimmed = input.trim();
      if (!trimmed) return { input, resolved: false };
      if (/^\d+$/.test(trimmed)) return { input, resolved: true, id: trimmed };
      const matches = byName.get(trimmed.toLowerCase()) ?? [];
      const match = matches[0];
      return match?.groupId ? { input, resolved: true, id: String(match.groupId) } : { input, resolved: false };
    });
  } catch {
    throw new Error("Not authenticated - cannot resolve groups");
  }
}
var dmPolicy = {
  label: "Zalo JS",
  channel,
  policyKey: "channels['zaloclaw'].dmPolicy",
  allowFromKey: "channels['zaloclaw'].allowFrom",
  getCurrent: (cfg, _accountId) => cfg.channels?.["zaloclaw"]?.dmPolicy ?? "open",
  setPolicy: (cfg, policy, _accountId) => setZaloClawDmPolicy(cfg, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id = accountId && normalizeAccountId2(accountId) ? normalizeAccountId2(accountId) ?? DEFAULT_ACCOUNT_ID2 : resolveDefaultZaloClawAccountId(cfg);
    return promptZaloClawAllowFrom({ cfg, prompter, accountId: id });
  }
};
async function performQrLogin(prompter) {
  let qrFilePath = null;
  try {
    await loginWithQR(async (event) => {
      if (event.type === LoginQRCallbackEventType2.QRCodeGenerated) {
        try {
          qrFilePath = await displayQRFromPNG(event.data.image);
        } catch (err) {
          console.log(`Could not display QR: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
    await prompter.note("Login successful!", "Success");
    if (qrFilePath) {
      try {
        fs3.unlinkSync(qrFilePath);
      } catch {
      }
    }
    const wantsRestart = await prompter.confirm({
      message: "Restart gateway now? (Required for certificate to be recognized)",
      initialValue: true
    });
    if (wantsRestart) {
      await prompter.note("To apply the new certificate, run: openclaw gateway restart", "Gateway");
    }
  } catch (err) {
    await prompter.note(
      `Login failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      "Error"
    );
    if (qrFilePath) {
      try {
        fs3.unlinkSync(qrFilePath);
      } catch {
      }
    }
  }
}
var zaloClawOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const configured = hasStoredCredentials();
    return {
      channel,
      configured,
      statusLines: [`Zalo JS: ${configured ? "logged in" : "needs QR login"}`],
      selectionHint: configured ? "recommended \xB7 logged in" : "recommended \xB7 QR login",
      quickstartScore: configured ? 1 : 15
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom
  }) => {
    const zaloClawOverride = accountOverrides["zaloclaw"]?.trim();
    const defaultAccountId = resolveDefaultZaloClawAccountId(cfg);
    let accountId = zaloClawOverride ? normalizeAccountId2(zaloClawOverride) : defaultAccountId;
    if (shouldPromptAccountIds && !zaloClawOverride) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "Zalo JS",
        currentId: accountId,
        listAccountIds: listZaloClawAccountIds,
        defaultAccountId
      });
    }
    let next = cfg;
    const alreadyAuthenticated = hasStoredCredentials();
    if (!alreadyAuthenticated) {
      await noteZaloClawHelp(prompter);
      const wantsLogin = await prompter.confirm({
        message: "Login via QR code now?",
        initialValue: true
      });
      if (wantsLogin) {
        await prompter.note(
          "A QR code will be displayed below.\nScan it with your Zalo app to login.",
          "QR Login"
        );
        await performQrLogin(prompter);
      }
    } else {
      const keepSession = await prompter.confirm({
        message: "Zalo JS already logged in. Keep session?",
        initialValue: true
      });
      if (!keepSession) {
        const { logout: logout2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
        await logout2();
        await prompter.note(
          "A QR code will be displayed below.\nScan it with your Zalo app to login.",
          "QR Login"
        );
        await performQrLogin(prompter);
      }
    }
    if (accountId === DEFAULT_ACCOUNT_ID2) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          "zaloclaw": {
            ...next.channels?.["zaloclaw"],
            enabled: true,
            accounts: {
              ...next.channels?.["zaloclaw"]?.accounts,
              [DEFAULT_ACCOUNT_ID2]: {
                ...next.channels?.["zaloclaw"]?.accounts?.[DEFAULT_ACCOUNT_ID2],
                enabled: true
              }
            }
          }
        }
      };
    } else {
      next = {
        ...next,
        channels: {
          ...next.channels,
          "zaloclaw": {
            ...next.channels?.["zaloclaw"],
            enabled: true,
            accounts: {
              ...next.channels?.["zaloclaw"]?.accounts,
              [accountId]: {
                ...next.channels?.["zaloclaw"]?.accounts?.[accountId],
                enabled: true
              }
            }
          }
        }
      };
    }
    if (forceAllowFrom) {
      next = await promptZaloClawAllowFrom({ cfg: next, prompter, accountId });
    }
    const account = resolveZaloClawAccountSync({ cfg: next, accountId });
    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "Zalo groups",
      currentPolicy: account.config.groupPolicy ?? "open",
      currentEntries: Object.keys(account.config.groups ?? {}),
      placeholder: "Family, Work, 123456789",
      updatePrompt: Boolean(account.config.groups)
    });
    if (accessConfig) {
      if (accessConfig.policy !== "allowlist") {
        next = setZaloClawGroupPolicy(next, accountId, accessConfig.policy);
      } else {
        let keys = accessConfig.entries;
        if (accessConfig.entries.length > 0) {
          try {
            const resolved = await resolveZaloClawGroups({ cfg: next, accountId, entries: accessConfig.entries });
            const resolvedIds = resolved.filter((e) => e.resolved && e.id).map((e) => e.id);
            const unresolved = resolved.filter((e) => !e.resolved).map((e) => e.input);
            keys = [...resolvedIds, ...unresolved.map((e) => e.trim()).filter(Boolean)];
            if (resolvedIds.length > 0 || unresolved.length > 0) {
              await prompter.note(
                [
                  resolvedIds.length > 0 ? `Resolved: ${resolvedIds.join(", ")}` : void 0,
                  unresolved.length > 0 ? `Unresolved (kept as typed): ${unresolved.join(", ")}` : void 0
                ].filter(Boolean).join("\n"),
                "Zalo groups"
              );
            }
          } catch (err) {
            await prompter.note(`Group lookup failed; keeping entries as typed. ${String(err)}`, "Zalo groups");
          }
        }
        next = setZaloClawGroupPolicy(next, accountId, "allowlist");
        next = setZaloClawGroupAllowlist(next, accountId, keys);
      }
    }
    return { cfg: next, accountId };
  }
};

// src/channel/probe.ts
init_zalo_client();
async function probeZaloClaw() {
  try {
    const api = await getApi();
    const uid = getCurrentUid();
    if (!uid) return { ok: false, error: "Not logged in" };
    const userInfo = await api.getUserInfo(uid);
    const profile = userInfo?.changed_profiles?.[uid];
    const displayName = profile?.displayName || profile?.zaloName || uid;
    return { ok: true, uid, displayName };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// src/channel/channel.ts
init_send();
init_group_id_cache();

// src/runtime/status-issues.ts
init_zalo_client();
function collectZaloClawStatusIssues() {
  const issues = [];
  if (!hasStoredCredentials()) {
    issues.push({
      channel: "zaloclaw",
      accountId: "default",
      kind: "auth",
      message: "zaloclaw: not logged in (no credentials \u2014 run: openclaw channels login zaloclaw)"
    });
  }
  return issues;
}

// src/channel/channel.ts
init_zalo_client();
import { LoginQRCallbackEventType as LoginQRCallbackEventType3 } from "zca-js";
import * as fs9 from "fs";
import * as readline from "readline";
var meta = {
  id: "zaloclaw",
  label: "ZaloClaw",
  selectionLabel: "ZaloClaw Account",
  docsPath: "/channels/zaloclaw",
  docsLabel: "zaloclaw",
  blurb: "Zalo personal account via zca-js library (no CLI needed).",
  aliases: ["oz"],
  order: 86,
  quickstartAllowFrom: true
};
function mapUser(params) {
  return {
    kind: "user",
    id: params.id,
    name: params.name ?? void 0,
    avatarUrl: params.avatarUrl ?? void 0,
    raw: params.raw
  };
}
function mapGroup(params) {
  return {
    kind: "group",
    id: params.id,
    name: params.name ?? void 0,
    raw: params.raw
  };
}
function resolveZaloClawGroupRequireMention(params) {
  const account = resolveZaloClawAccountSync({
    cfg: params.cfg,
    accountId: params.accountId ?? void 0
  });
  const groups = account.config.groups ?? {};
  const groupId = params.groupId?.trim();
  const groupChannel = params.groupChannel?.trim();
  const candidates = [groupId, groupChannel, "*"].filter((value) => Boolean(value));
  for (const key of candidates) {
    const entry = groups[key];
    if (entry && typeof entry.requireMention === "boolean") return entry.requireMention;
  }
  return true;
}
function resolveZaloClawGroupToolPolicy(params) {
  const account = resolveZaloClawAccountSync({
    cfg: params.cfg,
    accountId: params.accountId ?? void 0
  });
  const groups = account.config.groups ?? {};
  const groupId = params.groupId?.trim();
  const groupChannel = params.groupChannel?.trim();
  const candidates = [groupId, groupChannel, "*"].filter((value) => Boolean(value));
  for (const key of candidates) {
    const entry = groups[key];
    if (entry?.tools) return entry.tools;
  }
  return void 0;
}
var zaloClawPlugin = {
  id: "zaloclaw",
  meta,
  setupWizard: zaloClawOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true
  },
  reload: { configPrefixes: ["channels['zaloclaw']"] },
  configSchema: ZaloClawChannelConfigSchema,
  config: {
    listAccountIds: (cfg) => listZaloClawAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveZaloClawAccountSync({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultZaloClawAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) => setAccountEnabledInConfigSection({
      cfg,
      sectionKey: "zaloclaw",
      accountId,
      enabled,
      allowTopLevel: true
    }),
    deleteAccount: ({ cfg, accountId }) => deleteAccountFromConfigSection({
      cfg,
      sectionKey: "zaloclaw",
      accountId,
      clearBaseFields: [
        "name",
        "dmPolicy",
        "allowFrom",
        "groupPolicy",
        "groups",
        "messagePrefix"
      ]
    }),
    isConfigured: async () => hasStoredCredentials(),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: hasStoredCredentials()
    }),
    resolveAllowFrom: ({ cfg, accountId }) => (resolveZaloClawAccountSync({ cfg, accountId }).config.allowFrom ?? []).map(
      (entry) => String(entry)
    ),
    formatAllowFrom: ({ allowFrom }) => allowFrom.map((entry) => String(entry).trim()).filter(Boolean).map((entry) => entry.replace(/^(zaloclaw|oz):/i, "")).map((entry) => entry.toLowerCase())
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID3;
      const useAccountPath = Boolean(cfg.channels?.["zaloclaw"]?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath ? `channels['zaloclaw'].accounts.${resolvedAccountId}.` : "channels['zaloclaw'].";
      return {
        policy: account.config.dmPolicy ?? "open",
        allowFrom: account.config.allowFrom ?? ["*"],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("zaloclaw"),
        normalizeEntry: (raw) => raw.replace(/^(zaloclaw|oz):/i, "")
      };
    }
  },
  groups: {
    resolveRequireMention: resolveZaloClawGroupRequireMention,
    resolveToolPolicy: resolveZaloClawGroupToolPolicy
  },
  agentPrompt: {
    messageToolHints: () => [
      "- Zalo group mentions: tag a member by writing `@Name` (single-word name) or `@[Full Name]` (with spaces). The plugin auto-resolves the name to a real Zalo @mention and sends a notification. Unknown or ambiguous names are left as plain text \u2014 never invent a name that is not in the group."
    ]
  },
  threading: {
    resolveReplyToMode: () => "off"
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId3(accountId),
    applyAccountName: ({ cfg, accountId, name }) => applyAccountNameToChannelSection({ cfg, channelKey: "zaloclaw", accountId, name }),
    validateInput: () => null,
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "zaloclaw",
        accountId,
        name: input.name
      });
      const next = accountId !== DEFAULT_ACCOUNT_ID3 ? migrateBaseNameToDefaultAccount({ cfg: namedConfig, channelKey: "zaloclaw" }) : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID3) {
        return {
          ...next,
          channels: {
            ...next.channels,
            "zaloclaw": { ...next.channels?.["zaloclaw"], enabled: true }
          }
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          "zaloclaw": {
            ...next.channels?.["zaloclaw"],
            enabled: true,
            accounts: {
              ...next.channels?.["zaloclaw"]?.accounts,
              [accountId]: {
                ...next.channels?.["zaloclaw"]?.accounts?.[accountId],
                enabled: true
              }
            }
          }
        }
      };
    }
  },
  messaging: {
    normalizeTarget: (raw) => {
      const trimmed = raw?.trim();
      if (!trimmed) return void 0;
      return trimmed.replace(/^(zaloclaw|oz):/i, "");
    },
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        return /^\d{3,}$/.test(trimmed);
      },
      hint: "<threadId>"
    }
  },
  directory: {
    self: async ({ cfg, accountId, runtime: runtime2 }) => {
      try {
        const { getApi: getApi2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
        const api = await getApi2();
        const raw = await api.fetchAccountInfo();
        const info = raw?.profile ?? raw;
        if (!info?.userId) return null;
        return mapUser({
          id: String(info.userId),
          name: info.displayName ?? null,
          avatarUrl: info.avatar ?? null,
          raw: info
        });
      } catch (err) {
        runtime2.error(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const { getApi: getApi2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
      const api = await getApi2();
      const friends = await api.getAllFriends();
      let rows = [];
      if (Array.isArray(friends)) {
        rows = friends.map(
          (f) => mapUser({
            id: String(f.userId),
            name: f.displayName ?? null,
            avatarUrl: f.avatar ?? null,
            raw: f
          })
        );
      }
      const q = query?.trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (r) => (r.name ?? "").toLowerCase().includes(q) || r.id.includes(q)
        );
      }
      return typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const { getApi: getApi2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
      const api = await getApi2();
      const groupsResp = await api.getAllGroups();
      const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});
      let rows = [];
      if (groupIds.length > 0) {
        try {
          const infoResp = await api.getGroupInfo(groupIds);
          const gridInfoMap = infoResp?.gridInfoMap ?? {};
          rows = Object.entries(gridInfoMap).map(
            ([id, info]) => mapGroup({ id, name: info.name ?? null, raw: info })
          );
        } catch {
          rows = groupIds.map((id) => mapGroup({ id, name: null }));
        }
      }
      const q = query?.trim().toLowerCase();
      if (q) {
        rows = rows.filter((g) => (g.name ?? "").toLowerCase().includes(q) || g.id.includes(q));
      }
      return typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;
    },
    listGroupMembers: async ({ cfg, accountId, groupId, limit }) => {
      const { getApi: getApi2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
      const api = await getApi2();
      const infoResp = await api.getGroupInfo(groupId);
      const groupInfo = infoResp?.gridInfoMap?.[groupId];
      let memberIds = groupInfo?.memberIds ?? [];
      if (memberIds.length === 0) {
        const memVerList = groupInfo?.memVerList ?? [];
        memberIds = memVerList.map((entry) => entry.split("_")[0]).filter(Boolean);
      }
      if (memberIds.length === 0) return [];
      try {
        const membersResp = await api.getGroupMembersInfo(memberIds);
        const profiles = membersResp?.profiles ?? {};
        const rows = Object.entries(profiles).map(
          ([id, profile]) => mapUser({
            id,
            name: profile.displayName ?? profile.zaloName ?? null,
            avatarUrl: profile.avatar ?? null,
            raw: profile
          })
        );
        return typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;
      } catch {
        const rows = memberIds.map((id) => mapUser({ id: String(id) }));
        return typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;
      }
    }
  },
  resolver: {
    resolveTargets: async ({ cfg, accountId, inputs, kind, runtime: runtime2 }) => {
      const results = [];
      for (const input of inputs) {
        const trimmed = input.trim();
        if (!trimmed) {
          results.push({ input, resolved: false, note: "empty input" });
          continue;
        }
        if (/^\d+$/.test(trimmed)) {
          results.push({ input, resolved: true, id: trimmed });
          continue;
        }
        try {
          const { getApi: getApi2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
          const api = await getApi2();
          if (kind === "user") {
            const friends = await api.getAllFriends();
            const friendList = Array.isArray(friends) ? friends : [];
            const matches = friendList.filter((f) => (f.displayName ?? "").toLowerCase().includes(trimmed.toLowerCase())).map((f) => ({ id: String(f.userId), name: f.displayName ?? void 0 }));
            const best = matches[0];
            results.push({
              input,
              resolved: Boolean(best?.id),
              id: best?.id,
              name: best?.name,
              note: matches.length > 1 ? "multiple matches; chose first" : void 0
            });
          } else {
            const groupsResp = await api.getAllGroups();
            const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});
            let groups = [];
            if (groupIds.length > 0) {
              try {
                const infoResp = await api.getGroupInfo(groupIds);
                const gridInfoMap = infoResp?.gridInfoMap ?? {};
                groups = Object.entries(gridInfoMap).map(([id, info]) => ({
                  id,
                  name: info.name ?? void 0
                }));
              } catch {
                groups = groupIds.map((id) => ({ id }));
              }
            }
            const matches = groups.filter(
              (g) => (g.name ?? "").toLowerCase().includes(trimmed.toLowerCase())
            );
            const best = matches.find((g) => g.name?.toLowerCase() === trimmed.toLowerCase()) ?? matches[0];
            results.push({
              input,
              resolved: Boolean(best?.id),
              id: best?.id,
              name: best?.name,
              note: matches.length > 1 ? "multiple matches; chose first" : void 0
            });
          }
        } catch (err) {
          runtime2.error?.(`zaloclaw resolve failed: ${String(err)}`);
          results.push({ input, resolved: false, note: "lookup failed" });
        }
      }
      return results;
    }
  },
  pairing: {
    idLabel: "zaloClawUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(zaloclaw|oz):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const authenticated = await checkZaloClawAuthenticated();
      if (!authenticated) throw new Error("ZaloClaw not authenticated");
      await sendMessageZaloClaw(id, "Your pairing request has been approved.");
    }
  },
  auth: {
    login: async ({ cfg, accountId, runtime: runtime2 }) => {
      runtime2.log(`Scan the QR code to link ZaloClaw (account: ${accountId ?? DEFAULT_ACCOUNT_ID3}).`);
      let qrFilePath = null;
      try {
        await loginWithQR(async (event) => {
          if (event.type === LoginQRCallbackEventType3.QRCodeGenerated) {
            try {
              qrFilePath = await displayQRFromPNG(event.data.image);
            } catch (err) {
              console.log(`Could not display QR: ${err instanceof Error ? err.message : String(err)}`);
            }
          } else if (event.type === LoginQRCallbackEventType3.QRCodeScanned) {
            runtime2.log("QR code scanned. Please confirm on your phone.");
          }
        });
        runtime2.log("Login successful!");
        if (qrFilePath) {
          try {
            fs9.unlinkSync(qrFilePath);
          } catch {
          }
        }
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise((resolve7) => {
          rl.question("\nRestart gateway now? (Required for certificate to be recognized) [Y/n]: ", (ans) => {
            rl.close();
            resolve7(ans);
          });
        });
        const shouldRestart = !answer || answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
        if (shouldRestart) {
          runtime2.log("To apply the new certificate, run: openclaw gateway restart");
        } else {
          runtime2.log("Skipped restart. Remember to run 'openclaw gateway restart' later.");
        }
      } catch (err) {
        if (qrFilePath) {
          try {
            fs9.unlinkSync(qrFilePath);
          } catch {
          }
        }
        throw err;
      }
    }
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => {
      if (!text) return [];
      if (limit <= 0 || text.length <= limit) return [text];
      const chunks = [];
      let remaining = text;
      while (remaining.length > limit) {
        const window = remaining.slice(0, limit);
        const lastNewline = window.lastIndexOf("\n");
        const lastSpace = window.lastIndexOf(" ");
        let breakIdx = lastNewline > 0 ? lastNewline : lastSpace;
        if (breakIdx <= 0) breakIdx = limit;
        const rawChunk = remaining.slice(0, breakIdx);
        const chunk = rawChunk.trimEnd();
        if (chunk.length > 0) chunks.push(chunk);
        const brokeOnSeparator = breakIdx < remaining.length && /\s/.test(remaining[breakIdx]);
        const nextStart = Math.min(remaining.length, breakIdx + (brokeOnSeparator ? 1 : 0));
        remaining = remaining.slice(nextStart).trimStart();
      }
      if (remaining.length) chunks.push(remaining);
      return chunks;
    },
    chunkerMode: "markdown",
    textChunkLimit: 2e3,
    sendText: async ({ to, text, accountId, cfg }) => {
      const account = resolveZaloClawAccountSync({ cfg, accountId });
      const isGroup = isKnownGroupId(to);
      const result = await sendMessageZaloClaw(to, text, { isGroup });
      return {
        channel: "zaloclaw",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : void 0
      };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      const account = resolveZaloClawAccountSync({ cfg, accountId });
      const isGroup = isKnownGroupId(to);
      let options = { isGroup };
      if (mediaUrl && isLocalFilePath(mediaUrl) && fs9.existsSync(mediaUrl)) {
        options.localPath = mediaUrl;
        options.caption = text;
      } else if (mediaUrl) {
        options.mediaUrl = mediaUrl;
        options.caption = text;
      }
      const result = await sendMessageZaloClaw(to, text, options);
      return {
        channel: "zaloclaw",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : void 0
      };
    }
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID3,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null
    },
    collectStatusIssues: (_accounts) => collectZaloClawStatusIssues(),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null
    }),
    probeAccount: async ({ account }) => probeZaloClaw(),
    buildAccountSnapshot: async ({ account, runtime: runtime2 }) => {
      const configured = hasStoredCredentials();
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        running: runtime2?.running ?? false,
        lastStartAt: runtime2?.lastStartAt ?? null,
        lastStopAt: runtime2?.lastStopAt ?? null,
        lastError: configured ? runtime2?.lastError ?? null : runtime2?.lastError ?? "not authenticated",
        lastInboundAt: runtime2?.lastInboundAt ?? null,
        lastOutboundAt: runtime2?.lastOutboundAt ?? null,
        dmPolicy: account.config.dmPolicy ?? "open"
      };
    }
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      let userLabel = "";
      try {
        const userInfo = await getZaloClawUserInfo();
        if (userInfo?.displayName) userLabel = ` (${userInfo.displayName})`;
        ctx.setStatus({ accountId: account.accountId, profile: userInfo });
      } catch {
      }
      ctx.log?.info(`[${account.accountId}] starting zaloclaw provider${userLabel}`);
      const { monitorZaloClawProvider: monitorZaloClawProvider2 } = await Promise.resolve().then(() => (init_monitor(), monitor_exports));
      return monitorZaloClawProvider2({
        account,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch })
      });
    },
    loginWithQrStart: async (params) => {
      try {
        let qrDataUrl;
        const loginPromise2 = loginWithQR((event) => {
          if (event.type === LoginQRCallbackEventType3.QRCodeGenerated && event.data) {
            qrDataUrl = `data:image/png;base64,${event.data.image}`;
          }
        });
        await new Promise((resolve7) => setTimeout(resolve7, 3e3));
        if (qrDataUrl) return { qrDataUrl, message: "Scan QR code with Zalo app" };
        await loginPromise2;
        return { message: "Login completed" };
      } catch (err) {
        return { message: err instanceof Error ? err.message : "Failed to start QR login" };
      }
    },
    loginWithQrWait: async (params) => {
      const connected = hasStoredCredentials();
      return { connected, message: connected ? "Login successful" : "Login pending" };
    },
    logoutAccount: async (ctx) => {
      const { logout: logout2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
      await logout2();
      return { cleared: true, loggedOut: true, message: "Logged out and credentials cleared" };
    }
  }
};

// index.ts
init_runtime();

// src/tools/tool.ts
init_zalo_client();
init_msg_id_store();
import { Type } from "@sinclair/typebox";
import {
  ThreadType as ThreadType3,
  Reactions as Reactions2,
  MuteAction,
  MuteDuration
} from "zca-js";

// src/config/config-manager.ts
import { readFileSync as readFileSync6, writeFileSync as writeFileSync6 } from "node:fs";
import { homedir as homedir6 } from "node:os";
import { join as join8 } from "node:path";
var DEFAULT_CONFIG_PATH = join8(homedir6(), ".openclaw", "openclaw.json");
function readOpenClawConfig(configPath = DEFAULT_CONFIG_PATH) {
  try {
    const content = readFileSync6(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to read config: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function writeOpenClawConfig(config, configPath = DEFAULT_CONFIG_PATH) {
  try {
    const content = JSON.stringify(config, null, 2);
    writeFileSync6(configPath, content, "utf-8");
  } catch (err) {
    throw new Error(`Failed to write config: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function getZaloClawConfig(config) {
  return config.channels?.["zaloclaw"] ?? {};
}
function updateZaloClawConfig(config, updates) {
  return {
    ...config,
    channels: {
      ...config.channels,
      "zaloclaw": {
        ...getZaloClawConfig(config),
        ...updates
      }
    }
  };
}
function addToArray(arr, entry) {
  const existing = arr ?? [];
  if (existing.includes(entry)) return existing;
  return [...existing, entry];
}
function removeFromArray(arr, entry) {
  const existing = arr ?? [];
  return existing.filter((item) => item !== entry);
}
function addToDenyFrom(config, userId) {
  const zpConfig = getZaloClawConfig(config);
  const denyFrom = addToArray(zpConfig.denyFrom, userId);
  return updateZaloClawConfig(config, { denyFrom });
}
function removeFromDenyFrom(config, userId) {
  const zpConfig = getZaloClawConfig(config);
  const denyFrom = removeFromArray(zpConfig.denyFrom, userId);
  return updateZaloClawConfig(config, { denyFrom });
}
function addToGroupDenyUsers(config, groupId, userId) {
  const zpConfig = getZaloClawConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId] ?? {};
  const denyUsers = addToArray(groupConfig.denyUsers, userId);
  return updateZaloClawConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, denyUsers } }
  });
}
function removeFromGroupDenyUsers(config, groupId, userId) {
  const zpConfig = getZaloClawConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId];
  if (!groupConfig) return config;
  const denyUsers = removeFromArray(groupConfig.denyUsers, userId);
  return updateZaloClawConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, denyUsers } }
  });
}
function listBlockedUsers(config) {
  return getZaloClawConfig(config).denyFrom ?? [];
}
function listAllowedUsers(config) {
  return getZaloClawConfig(config).allowFrom ?? [];
}
function addToGroupAllowUsers(config, groupId, userId) {
  const zpConfig = getZaloClawConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId] ?? {};
  const allowUsers = addToArray(groupConfig.allowUsers, userId);
  return updateZaloClawConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, allowUsers } }
  });
}
function removeFromGroupAllowUsers(config, groupId, userId) {
  const zpConfig = getZaloClawConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId];
  if (!groupConfig) return config;
  const allowUsers = removeFromArray(groupConfig.allowUsers, userId);
  return updateZaloClawConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, allowUsers } }
  });
}
function listAllowedUsersInGroup(config, groupId) {
  return getZaloClawConfig(config).groups?.[groupId]?.allowUsers ?? [];
}
function listBlockedUsersInGroup(config, groupId) {
  return getZaloClawConfig(config).groups?.[groupId]?.denyUsers ?? [];
}
function setGroupRequireMention(config, groupId, requireMention) {
  const zpConfig = getZaloClawConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId] ?? {};
  return updateZaloClawConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, requireMention } }
  });
}

// src/tools/tool.ts
init_friend_request_store();

// src/safety/thread-sandbox.ts
import * as fs10 from "fs";
import * as path6 from "path";
import * as os5 from "os";
var WORKSPACE_BASE = path6.join(os5.homedir(), ".openclaw", "workspace", "threads");
function validateLocalFilePath(filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("File path is required");
  }
  const resolved = path6.resolve(filePath);
  if (filePath.includes("..")) {
    throw new Error(`Path traversal blocked: ".." not allowed in file paths`);
  }
  const tmpDir = os5.tmpdir();
  const allowedBases = [
    path6.join(os5.homedir(), ".openclaw", "workspace"),
    path6.join(os5.homedir(), ".openclaw", "media"),
    tmpDir,
    // Resolve /tmp symlinks (e.g., macOS /tmp → /private/tmp)
    ...fs10.existsSync(tmpDir) ? [fs10.realpathSync(tmpDir)] : []
  ];
  const isAllowed = allowedBases.some(
    (base) => resolved.startsWith(base + path6.sep) || resolved === base
  );
  if (!isAllowed) {
    throw new Error(
      `Access denied: ${filePath} is outside allowed directories. Only files in ~/.openclaw/workspace/, ~/.openclaw/media/, or system temp are allowed.`
    );
  }
  if (fs10.existsSync(resolved)) {
    const real = fs10.realpathSync(resolved);
    const isRealAllowed = allowedBases.some(
      (base) => real.startsWith(base + path6.sep) || real === base
    );
    if (!isRealAllowed) {
      throw new Error(`Symlink escape blocked: ${filePath} resolves outside allowed directories`);
    }
  }
  return resolved;
}

// src/tools/tool.ts
init_url_validator();
init_mention_parser();
init_passive_collector();
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as nodeOs from "node:os";
import * as nodeCrypto from "node:crypto";
function ok(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    details: data
  };
}
function safeReadConfig() {
  try {
    return readOpenClawConfig();
  } catch (err) {
    throw new Error(
      `Failed to read OpenClaw config: ${err instanceof Error ? err.message : String(err)}. Make sure the config file exists and is valid JSON.`
    );
  }
}
function safeWriteConfig(cfg) {
  try {
    writeOpenClawConfig(cfg);
  } catch (err) {
    throw new Error(
      `Failed to write OpenClaw config: ${err instanceof Error ? err.message : String(err)}. Check file permissions.`
    );
  }
}
async function resolveUserId(nameOrId) {
  if (/^\d+$/.test(nameOrId)) return nameOrId;
  const api = await getApi();
  const friends = await api.getAllFriends();
  const list = Array.isArray(friends) ? friends : [];
  const q = nameOrId.toLowerCase();
  const hit = list.find(
    (f) => (f.displayName ?? "").toLowerCase() === q || (f.zaloName ?? "").toLowerCase() === q
  );
  if (hit) return String(hit.userId);
  throw new Error(`User not found: "${nameOrId}". Use numeric ID or exact display name.`);
}
async function resolveGroupId(nameOrId) {
  if (/^\d+$/.test(nameOrId)) return nameOrId;
  const api = await getApi();
  const resp = await api.getAllGroups();
  const ids = Object.keys(resp?.gridVerMap ?? {});
  if (ids.length === 0) throw new Error("No groups found");
  const info = await api.getGroupInfo(ids);
  const map = info?.gridInfoMap ?? {};
  const q = nameOrId.toLowerCase();
  const hit = Object.entries(map).find(
    ([, g]) => (g.name ?? "").toLowerCase() === q
  );
  if (hit) return hit[0];
  throw new Error(`Group not found: "${nameOrId}". Use numeric group ID or exact name.`);
}
function extractMemberIds(groupInfo) {
  const ids = groupInfo?.memberIds ?? [];
  if (ids.length > 0) return ids;
  const verList = groupInfo?.memVerList ?? [];
  return verList.map((e) => e.split("_")[0]).filter(Boolean);
}
var ACTIONS = [
  // Messaging
  "send",
  "send-styled",
  "send-link",
  "send-image",
  "send-file",
  "send-video",
  "send-voice",
  "send-sticker",
  "send-card",
  "send-bank-card",
  "send-typing",
  "forward-message",
  "delete-message",
  "undo-message",
  // Reactions
  "add-reaction",
  // Contacts
  "friends",
  "find-user",
  "find-user-by-username",
  "send-friend-request",
  "get-friend-requests",
  "accept-friend-request",
  "reject-friend-request",
  "get-sent-requests",
  "undo-friend-request",
  "unfriend",
  "check-friend-status",
  "set-friend-nickname",
  "remove-friend-nickname",
  "get-online-friends",
  "get-close-friends",
  "get-friend-recommendations",
  "get-alias-list",
  "get-related-friend-groups",
  "get-multi-users-by-phones",
  // Groups
  "groups",
  "get-group-info",
  "create-group",
  "add-to-group",
  "remove-from-group",
  "leave-group",
  "rename-group",
  "add-group-admin",
  "remove-group-admin",
  "change-group-owner",
  "disperse-group",
  "update-group-settings",
  "enable-group-link",
  "disable-group-link",
  "get-group-link",
  "get-pending-members",
  "review-pending-members",
  "get-group-blocked",
  "block-group-member",
  "unblock-group-member",
  "get-group-members-info",
  "join-group-link",
  "invite-to-groups",
  "get-group-invites",
  "join-group-invite",
  "delete-group-invite",
  "change-group-avatar",
  "upgrade-group-to-community",
  "get-group-chat-history",
  // Polls
  "create-poll",
  "vote-poll",
  "lock-poll",
  "get-poll-detail",
  "add-poll-options",
  "share-poll",
  // Reminders
  "create-reminder",
  "remove-reminder",
  "edit-reminder",
  "list-reminders",
  // Conversation management
  "mute-conversation",
  "unmute-conversation",
  "pin-conversation",
  "unpin-conversation",
  "delete-chat",
  "hide-conversation",
  "unhide-conversation",
  "get-hidden-conversations",
  "mark-unread",
  "unmark-unread",
  "get-unread-marks",
  "set-auto-delete-chat",
  "get-auto-delete-chats",
  "get-archived-chats",
  "update-archived-chat",
  "get-mute-status",
  "get-pinned-conversations",
  // Quick messages & auto-reply
  "list-quick-messages",
  "add-quick-message",
  "remove-quick-message",
  "update-quick-message",
  "list-auto-replies",
  "create-auto-reply",
  "update-auto-reply",
  "delete-auto-reply",
  // Settings
  "get-settings",
  "update-setting",
  "update-active-status",
  // Profile & account
  "me",
  "status",
  "get-user-info",
  "last-online",
  "get-qr",
  "update-profile",
  "update-profile-bio",
  "change-avatar",
  "delete-avatar",
  "get-avatar-list",
  "reuse-avatar",
  "get-biz-account",
  // Stickers & misc
  "search-stickers",
  "search-sticker-detail",
  "parse-link",
  "send-report",
  // Notes & labels
  "create-note",
  "edit-note",
  "get-boards",
  "get-labels",
  // Catalogs & products
  "create-catalog",
  "update-catalog",
  "delete-catalog",
  "get-catalogs",
  "create-product",
  "update-product",
  "delete-product",
  "get-products",
  // Zalo-level block
  "zalo-block-user",
  "zalo-unblock-user",
  // New APIs
  "get-reminder",
  "get-reminder-responses",
  "get-friend-board",
  "get-full-avatar",
  // Bot config (OpenClaw layer)
  "block-user",
  "unblock-user",
  "block-user-in-group",
  "unblock-user-in-group",
  "list-blocked",
  "list-allowed",
  "allow-user-in-group",
  "unallow-user-in-group",
  "list-allowed-in-group",
  "list-blocked-in-group",
  "group-mention",
  // Stranger messaging
  "send-to-stranger",
  // Passive collector — local JSONL history recall
  "recall-group-history",
  "list-passive-groups",
  // Channel control + self-update
  "stop-channel",
  "start-channel",
  "restart-channel",
  "self-update"
];
function stringEnum(values, opts = {}) {
  return Type.Unsafe({
    type: "string",
    enum: [...values],
    ...opts
  });
}
var ZaloClawToolSchema = Type.Object(
  {
    action: stringEnum(ACTIONS, {
      description: `Action to perform. ${ACTIONS.length} actions available: ${ACTIONS.join(", ")}`
    }),
    // Core identifiers
    threadId: Type.Optional(Type.String({ description: "Thread / chat ID" })),
    message: Type.Optional(Type.String({ description: "Text content. For send-styled, supports **bold**, *italic*, __underline__, ~~strike~~" })),
    isGroup: Type.Optional(Type.Boolean({ description: "Whether the thread is a group" })),
    userId: Type.Optional(Type.String({ description: "User ID or display name" })),
    groupId: Type.Optional(Type.String({ description: "Group ID or name" })),
    query: Type.Optional(Type.String({ description: "Search / filter query" })),
    // Media
    url: Type.Optional(Type.String({ description: "URL for media/link/image" })),
    filePath: Type.Optional(Type.String({ description: "Local file path for send-file (e.g. /path/to/file.md)" })),
    thumbnailUrl: Type.Optional(Type.String({ description: "Thumbnail URL (video)" })),
    voiceUrl: Type.Optional(Type.String({ description: "Voice/audio URL" })),
    // Stickers
    stickerId: Type.Optional(Type.Number({ description: "Sticker ID" })),
    stickerCateId: Type.Optional(Type.Number({ description: "Sticker category ID" })),
    keyword: Type.Optional(Type.String({ description: "Keyword for sticker search / quick messages" })),
    // Friend operations
    phoneNumber: Type.Optional(Type.String({ description: "Phone number (e.g. 0987654321)" })),
    phoneNumbers: Type.Optional(Type.Array(Type.String(), { description: "Array of phone numbers" })),
    requestMessage: Type.Optional(Type.String({ description: "Friend request message" })),
    nickname: Type.Optional(Type.String({ description: "Friend nickname/alias" })),
    username: Type.Optional(Type.String({ description: "Zalo username" })),
    // Group operations
    groupName: Type.Optional(Type.String({ description: "Group name (create/rename)" })),
    memberIds: Type.Optional(Type.Array(Type.String(), { description: "User IDs for group ops" })),
    link: Type.Optional(Type.String({ description: "Group invite link" })),
    groupIds: Type.Optional(Type.Array(Type.String(), { description: "Group IDs for invite-to-groups" })),
    groupSettings: Type.Optional(Type.Object({
      blockName: Type.Optional(Type.Boolean()),
      signAdminMsg: Type.Optional(Type.Boolean()),
      setTopicOnly: Type.Optional(Type.Boolean()),
      enableMsgHistory: Type.Optional(Type.Boolean()),
      joinAppr: Type.Optional(Type.Boolean()),
      lockCreatePost: Type.Optional(Type.Boolean()),
      lockCreatePoll: Type.Optional(Type.Boolean()),
      lockSendMsg: Type.Optional(Type.Boolean()),
      lockViewMember: Type.Optional(Type.Boolean())
    }, { description: "Group settings" })),
    isApprove: Type.Optional(Type.Boolean({ description: "Approve/reject pending members" })),
    blockFutureInvite: Type.Optional(Type.Boolean({ description: "Block future group invites" })),
    // Message operations
    msgId: Type.Optional(Type.String({ description: "Message ID" })),
    cliMsgId: Type.Optional(Type.String({ description: "Client message ID" })),
    onlyMe: Type.Optional(Type.Boolean({ description: "Delete only for me" })),
    threadIds: Type.Optional(Type.Array(Type.String(), { description: "Thread IDs for forwarding" })),
    count: Type.Optional(Type.Number({ description: "Number of items to return" })),
    // Reaction
    icon: Type.Optional(Type.String({ description: "Reaction icon (heart, like, haha, wow, cry, angry)" })),
    urgency: Type.Optional(Type.Number({ description: "Message urgency: 0=default, 1=important (tin quan tr\u1ECDng), 2=urgent" })),
    messageTtl: Type.Optional(Type.Number({ description: "Self-destruct TTL in ms for send/send-styled (e.g. 60000=1min, 3600000=1h). Message auto-deletes after recipient reads." })),
    // Poll
    pollId: Type.Optional(Type.Number({ description: "Poll ID" })),
    title: Type.Optional(Type.String({ description: "Title (polls, reminders, notes)" })),
    options: Type.Optional(Type.Array(Type.String(), { description: "Poll options" })),
    optionId: Type.Optional(Type.Number({ description: "Poll option ID for voting" })),
    allowMultiChoices: Type.Optional(Type.Boolean({ description: "Allow multiple choices in poll" })),
    allowAddNewOption: Type.Optional(Type.Boolean({ description: "Allow members to add poll options" })),
    hideVotePreview: Type.Optional(Type.Boolean({ description: "Hide vote results until user votes" })),
    isAnonymous: Type.Optional(Type.Boolean({ description: "Anonymous poll (hide voters)" })),
    expiredTime: Type.Optional(Type.Number({ description: "Poll expiration time in ms (0=no expiration)" })),
    // Reminder
    emoji: Type.Optional(Type.String({ description: "Reminder emoji" })),
    startTime: Type.Optional(Type.Number({ description: "Start time (ms)" })),
    endTime: Type.Optional(Type.Number({ description: "End time (ms)" })),
    repeat: Type.Optional(Type.Number({ description: "Repeat: 0=none, 1=daily, 2=weekly, 3=monthly" })),
    reminderId: Type.Optional(Type.String({ description: "Reminder ID" })),
    // Conversation
    duration: Type.Optional(Type.Number({ description: "Mute duration seconds (-1=forever)" })),
    ttl: Type.Optional(Type.Number({ description: "Auto-delete TTL (0=off, 86400000=1day)" })),
    isArchived: Type.Optional(Type.Boolean({ description: "Archive/unarchive" })),
    // Quick message / auto-reply
    replyId: Type.Optional(Type.Number({ description: "Auto-reply rule ID" })),
    itemId: Type.Optional(Type.Number({ description: "Quick message item ID" })),
    scope: Type.Optional(Type.Number({ description: "Auto-reply scope (0=Everyone, 1=Stranger, 2=SpecificFriends, 3=FriendsExcept)" })),
    isEnable: Type.Optional(Type.Boolean({ description: "Enable/disable auto-reply rule" })),
    // Settings
    settingKey: Type.Optional(Type.String({ description: "Setting key" })),
    settingValue: Type.Optional(Type.Number({ description: "Setting value (0=off, 1=on)" })),
    active: Type.Optional(Type.Boolean({ description: "Active status toggle" })),
    // Profile
    name: Type.Optional(Type.String({ description: "Display name" })),
    dob: Type.Optional(Type.String({ description: "Date of birth YYYY-MM-DD" })),
    gender: Type.Optional(Type.Number({ description: "Gender: 0=male, 1=female" })),
    bio: Type.Optional(Type.String({ description: "Profile biography" })),
    photoId: Type.Optional(Type.String({ description: "Photo/avatar ID" })),
    // Report
    reason: Type.Optional(Type.Number({ description: "Report reason: 0=other, 1=sensitive, 2=annoy, 3=fraud" })),
    // Notes
    description: Type.Optional(Type.String({ description: "Description for product/note" })),
    pinAct: Type.Optional(Type.Boolean({ description: "Pin note" })),
    topicId: Type.Optional(Type.String({ description: "Topic/note ID" })),
    // Catalogs
    catalogId: Type.Optional(Type.String({ description: "Catalog ID" })),
    productId: Type.Optional(Type.String({ description: "Product ID" })),
    price: Type.Optional(Type.String({ description: "Product price" })),
    // Bank card
    binBank: Type.Optional(Type.String({ description: "Bank BIN code" })),
    numAccBank: Type.Optional(Type.String({ description: "Bank account number" })),
    nameAccBank: Type.Optional(Type.String({ description: "Account holder name" })),
    // Rich text
    styles: Type.Optional(Type.Array(
      Type.Object({
        start: Type.Number({ description: "Start offset" }),
        len: Type.Number({ description: "Length" }),
        st: Type.String({ description: "Style: b=bold, i=italic, u=underline, s=strike, c_HEX=color" })
      }),
      { description: "Text styles for send-styled. Or use markdown in message." }
    )),
    // Bot config
    requireMention: Type.Optional(Type.Boolean({ description: "Require @mention in group" })),
    isBlockFeed: Type.Optional(Type.Boolean({ description: "Block feed from user" }))
  },
  { additionalProperties: false }
);
var REACTION_MAP = {
  heart: Reactions2.HEART,
  love: Reactions2.HEART,
  like: Reactions2.LIKE,
  thumbsup: Reactions2.LIKE,
  haha: Reactions2.HAHA,
  laugh: Reactions2.HAHA,
  wow: Reactions2.WOW,
  surprised: Reactions2.WOW,
  cry: Reactions2.CRY,
  sad: Reactions2.CRY,
  angry: Reactions2.ANGRY,
  none: Reactions2.NONE,
  "\u{1F44D}": Reactions2.LIKE,
  "\u2764\uFE0F": Reactions2.HEART,
  "\u{1F606}": Reactions2.HAHA,
  "\u{1F62E}": Reactions2.WOW,
  "\u{1F622}": Reactions2.CRY,
  "\u{1F620}": Reactions2.ANGRY
};
function resolveReaction(raw) {
  return REACTION_MAP[raw.toLowerCase()] ?? raw;
}
async function handleChannelEnable(enable) {
  try {
    const cfg = safeReadConfig();
    const updated = updateZaloClawConfig(cfg, { enabled: enable });
    safeWriteConfig(updated);
    setTimeout(() => process.kill(process.pid, "SIGUSR1"), 300);
    return ok({ success: true, enabled: enable, message: `ZaloClaw channel ${enable ? "enabled" : "disabled"}. Gateway hot-reloading...` });
  } catch (err) {
    return ok({ error: true, message: `Failed to ${enable ? "enable" : "disable"} channel: ${String(err)}` });
  }
}
async function handleSelfUpdate() {
  try {
    const { execSync } = await import("node:child_process");
    const pluginDir = nodePath.resolve(nodePath.dirname(new URL(import.meta.url).pathname), "..");
    const pull = execSync("git pull origin main 2>&1", { cwd: pluginDir, encoding: "utf-8", timeout: 3e4 });
    if (pull.includes("Already up to date")) {
      return ok({ updated: false, message: "ZaloClaw is already up to date." });
    }
    execSync("npm install --prefer-offline 2>&1", { cwd: pluginDir, encoding: "utf-8", timeout: 12e4 });
    execSync("npm run build 2>&1", { cwd: pluginDir, encoding: "utf-8", timeout: 3e4 });
    setTimeout(() => process.kill(process.pid, "SIGUSR1"), 500);
    return ok({ updated: true, message: "ZaloClaw updated. Gateway hot-reloading...", output: pull.trim() });
  } catch (err) {
    return ok({ error: true, message: `Self-update failed: ${String(err)}` });
  }
}
async function executeZaloClawTool(_callId, p, _signal) {
  try {
    return await dispatch(p);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ok({ error: true, message: msg });
  }
}
async function dispatch(p) {
  const api = async () => getApi();
  switch (p.action) {
    // ── Messaging ──────────────────────────────────────────────────────────
    case "send": {
      if (!p.threadId || !p.message) throw new Error("threadId and message required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      let sendMsg = p.message;
      let sendMentions = [];
      if (p.isGroup) {
        const resolved = await resolveOutboundMentions(p.threadId, p.message);
        sendMsg = resolved.text;
        sendMentions = resolved.mentions;
      }
      const content = { msg: sendMsg };
      if (sendMentions.length > 0) content.mentions = sendMentions;
      if (p.urgency !== void 0) content.urgency = p.urgency;
      if (p.messageTtl !== void 0) content.ttl = p.messageTtl;
      const res = await a.sendMessage(content, p.threadId, type);
      const msgId = res?.message?.msgId;
      if (!msgId) {
        return ok({ success: false, error: "send failed: no msgId returned (likely rate-limited or silently dropped)", raw: res, mentionsResolved: sendMentions.length });
      }
      return ok({ success: true, msgId, mentionsResolved: sendMentions.length });
    }
    case "send-styled": {
      if (!p.threadId || !p.message) throw new Error("threadId and message required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      let msg = p.message;
      let styles = p.styles;
      if (!styles || styles.length === 0) {
        const { markdownToZaloStyles: markdownToZaloStyles2 } = await Promise.resolve().then(() => (init_send(), send_exports));
        const converted = markdownToZaloStyles2(msg);
        msg = converted.text;
        styles = converted.styles;
      }
      let styledMentions = [];
      if (p.isGroup) {
        const resolved = await resolveOutboundMentions(p.threadId, msg);
        msg = resolved.text;
        styledMentions = resolved.mentions;
      }
      const content = { msg };
      if (styles && styles.length > 0) content.styles = styles;
      if (styledMentions.length > 0) content.mentions = styledMentions;
      if (p.urgency !== void 0) content.urgency = p.urgency;
      if (p.messageTtl !== void 0) content.ttl = p.messageTtl;
      const res = await a.sendMessage(content, p.threadId, type);
      const styledMsgId = res?.message?.msgId;
      if (!styledMsgId) {
        return ok({ success: false, error: "send-styled failed: no msgId returned (likely rate-limited or silently dropped)", raw: res, stylesApplied: styles?.length ?? 0, mentionsResolved: styledMentions.length });
      }
      return ok({ success: true, msgId: styledMsgId, stylesApplied: styles?.length ?? 0, mentionsResolved: styledMentions.length });
    }
    case "send-link": {
      if (!p.threadId || !p.url) throw new Error("threadId and url required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.sendLink({ link: p.url }, p.threadId, type);
      const linkMsgId = res?.msgId;
      if (!linkMsgId) {
        return ok({ success: false, error: "send-link failed: no msgId returned (likely rate-limited or silently dropped)", raw: res });
      }
      return ok({ success: true, msgId: linkMsgId });
    }
    case "send-image": {
      if (!p.threadId || !p.url) throw new Error("threadId and url required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      if (/^https?:\/\//i.test(p.url)) {
        const tmpDir = nodeOs.tmpdir();
        const urlHash = nodeCrypto.createHash("sha256").update(p.url).digest("hex").substring(0, 12);
        const resolvedTmpPath = nodePath.join(tmpDir, `zalo-img-${Date.now()}-${urlHash}.jpg`);
        const { buffer } = await safeFetch(p.url, { maxSizeBytes: 20 * 1024 * 1024 });
        nodeFs.writeFileSync(resolvedTmpPath, buffer);
        try {
          const res2 = await a.sendMessage(
            { msg: p.message || "", attachments: [resolvedTmpPath] },
            p.threadId,
            type
          );
          return ok({ success: true, msgId: res2?.message?.msgId });
        } finally {
          try {
            nodeFs.unlinkSync(resolvedTmpPath);
          } catch {
          }
        }
      }
      const validatedPath = validateLocalFilePath(p.url);
      if (!nodeFs.existsSync(validatedPath)) throw new Error(`File not found: ${p.url}`);
      const res = await a.sendMessage(
        { msg: p.message || "", attachments: [validatedPath] },
        p.threadId,
        type
      );
      return ok({ success: true, msgId: res?.message?.msgId });
    }
    case "send-file": {
      if (!p.threadId) throw new Error("threadId required");
      const localFile = p.filePath || p.url;
      if (!localFile) throw new Error("filePath or url required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      let resolvedPath = localFile;
      if (/^https?:\/\//i.test(localFile)) {
        await validateUrlForOutboundFetch(localFile);
        const tmpDir = nodeOs.tmpdir();
        const urlObj = new URL(localFile);
        const urlHash = nodeCrypto.createHash("sha256").update(localFile).digest("hex").substring(0, 12);
        const safeExt = (urlObj.pathname.split("/").pop() || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 50);
        resolvedPath = nodePath.join(tmpDir, `zalo-send-${Date.now()}-${urlHash}-${safeExt}`);
        const { buffer } = await safeFetch(localFile, { maxSizeBytes: 50 * 1024 * 1024 });
        nodeFs.writeFileSync(resolvedPath, buffer);
      } else {
        resolvedPath = validateLocalFilePath(localFile);
      }
      if (!nodeFs.existsSync(resolvedPath)) throw new Error(`File not found: ${resolvedPath}`);
      const res = await a.sendMessage(
        { msg: p.message || "", attachments: [resolvedPath] },
        p.threadId,
        type
      );
      if (/^https?:\/\//i.test(localFile) && resolvedPath !== localFile) {
        try {
          nodeFs.unlinkSync(resolvedPath);
        } catch {
        }
      }
      return ok({ success: true, message: res?.message, attachment: res?.attachment });
    }
    case "send-video": {
      if (!p.threadId || !p.url) throw new Error("threadId and url required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.sendVideo({ videoUrl: p.url, thumbnailUrl: p.thumbnailUrl ?? p.url }, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "send-voice": {
      if (!p.threadId) throw new Error("threadId required");
      const voiceUrl = p.voiceUrl || p.url;
      if (!voiceUrl) throw new Error("voiceUrl or url required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.sendVoice({ voiceUrl }, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "send-sticker": {
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      if (p.stickerId && p.stickerCateId) {
        const detail = { id: p.stickerId, cateId: p.stickerCateId, type: 3 };
        await a.sendSticker(detail, p.threadId, type);
        return ok({ success: true, stickerId: p.stickerId });
      }
      if (p.keyword) {
        const ids = await a.getStickers(p.keyword);
        if (!ids || ids.length === 0) return ok({ error: true, message: "No stickers found" });
        const details = await a.getStickersDetail(ids[0]);
        if (!details || details.length === 0) return ok({ error: true, message: "Sticker detail unavailable" });
        await a.sendSticker(details[0], p.threadId, type);
        return ok({ success: true, sticker: details[0] });
      }
      throw new Error("stickerId+stickerCateId or keyword required");
    }
    case "send-card": {
      if (!p.threadId || !p.userId) throw new Error("threadId and userId required");
      const a = await api();
      const uid = await resolveUserId(p.userId);
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.sendCard({ userId: uid }, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "send-bank-card": {
      if (!p.threadId || !p.binBank || !p.numAccBank || !p.nameAccBank)
        throw new Error("threadId, binBank, numAccBank, nameAccBank required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.sendBankCard(
        { binBank: p.binBank, numAccBank: p.numAccBank, nameAccBank: p.nameAccBank },
        p.threadId,
        type
      );
      return ok({ success: true, result: res });
    }
    case "send-typing": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      await a.sendTypingEvent(p.threadId, type);
      return ok({ success: true, message: "Typing indicator sent" });
    }
    case "forward-message": {
      if (!p.msgId || !p.threadIds?.length) throw new Error("msgId and threadIds required");
      if (!p.message?.trim()) throw new Error("message required \u2014 zaloclaw cannot auto-retrieve message content by msgId; pass the message text you want to forward");
      const a = await api();
      const payload = { message: p.message };
      if (p.messageTtl !== void 0) payload.ttl = p.messageTtl;
      const res = await a.forwardMessage(payload, p.threadIds);
      return ok({ success: true, forwarded: res?.success, failed: res?.fail });
    }
    case "delete-message": {
      if (!p.msgId || !p.threadId) throw new Error("msgId and threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      let cliMsgId = p.cliMsgId;
      if (!cliMsgId) {
        const stored = lookupCliMsgId(p.msgId);
        if (stored) cliMsgId = stored.cliMsgId;
      }
      const uidFrom = getCurrentUid() ?? "";
      const res = await a.deleteMessage(
        { data: { msgId: p.msgId, cliMsgId: cliMsgId ?? p.msgId, uidFrom }, threadId: p.threadId, type },
        Boolean(p.onlyMe)
      );
      return ok({ success: true, result: res });
    }
    case "undo-message": {
      if (!p.msgId) throw new Error("msgId required");
      let undoCliMsgId = p.cliMsgId;
      if (!undoCliMsgId) {
        const stored = lookupCliMsgId(p.msgId);
        if (stored) undoCliMsgId = stored.cliMsgId;
      }
      if (!undoCliMsgId) throw new Error("cliMsgId not found \u2014 message may be too old");
      const a = await api();
      const res = await a.undo({ msgId: p.msgId, cliMsgId: undoCliMsgId });
      return ok({ success: true, result: res });
    }
    // ── Reactions ──────────────────────────────────────────────────────────
    case "add-reaction": {
      if (!p.msgId || !p.icon)
        throw new Error("msgId and icon required");
      let cliMsgId = p.cliMsgId;
      let threadId = p.threadId;
      let isGroup = p.isGroup;
      if (!cliMsgId || !threadId) {
        const stored = lookupCliMsgId(p.msgId);
        if (stored) {
          cliMsgId = cliMsgId || stored.cliMsgId;
          threadId = threadId || stored.threadId;
          isGroup = isGroup ?? stored.isGroup;
        }
      }
      if (!cliMsgId || !threadId)
        throw new Error("cliMsgId/threadId not found \u2014 message may be too old or from before bot started");
      const a = await api();
      const type = isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.addReaction(resolveReaction(p.icon), {
        data: { msgId: p.msgId, cliMsgId },
        threadId,
        type
      });
      return ok({ success: true, result: res });
    }
    // ── Contacts ───────────────────────────────────────────────────────────
    case "friends": {
      const a = await api();
      const raw = await a.getAllFriends();
      let list = Array.isArray(raw) ? raw : [];
      if (p.query?.trim()) {
        const q = p.query.trim().toLowerCase();
        list = list.filter(
          (f) => (f.displayName ?? "").toLowerCase().includes(q) || (f.zaloName ?? "").toLowerCase().includes(q) || String(f.userId).includes(q)
        );
      }
      const friends = list.map((f) => ({
        userId: f.userId,
        displayName: f.displayName,
        zaloName: f.zaloName,
        avatar: f.avatar,
        phoneNumber: f.phoneNumber
      }));
      return ok({ friends, count: friends.length });
    }
    case "find-user": {
      if (!p.phoneNumber) throw new Error("phoneNumber required");
      const clean = p.phoneNumber.replace(/[\s-]/g, "");
      const a = await api();
      const res = await a.findUser(clean);
      if (!res?.uid) return ok({ found: false, phoneNumber: clean });
      return ok({
        found: true,
        user: {
          userId: res.uid,
          displayName: res.display_name || res.zalo_name,
          zaloName: res.zalo_name,
          avatar: res.avatar,
          cover: res.cover,
          gender: res.gender,
          dob: res.dob,
          sdob: res.sdob,
          status: res.status,
          globalId: res.globalId
        }
      });
    }
    case "find-user-by-username": {
      if (!p.username) throw new Error("username required");
      const a = await api();
      const res = await a.findUserByUsername(p.username);
      return ok({ result: res });
    }
    case "send-friend-request": {
      if (!p.userId) throw new Error("userId required (numeric)");
      const uid = await resolveUserId(p.userId);
      const msg = p.requestMessage || "Xin ch\xE0o!";
      const a = await api();
      await a.sendFriendRequest(msg, uid);
      return ok({ success: true, userId: uid });
    }
    case "get-friend-requests": {
      const pending = getPendingRequests();
      return ok({ requests: pending, count: pending.length });
    }
    case "accept-friend-request": {
      if (!p.userId) throw new Error("userId required");
      const a = await api();
      await a.acceptFriendRequest(p.userId);
      removePendingRequest(p.userId);
      return ok({ success: true, userId: p.userId });
    }
    case "reject-friend-request": {
      if (!p.userId) throw new Error("userId required");
      const a = await api();
      await a.rejectFriendRequest(p.userId);
      removePendingRequest(p.userId);
      return ok({ success: true, userId: p.userId });
    }
    case "get-sent-requests": {
      const a = await api();
      const res = await a.getSentFriendRequest();
      const list = Object.entries(res).map(([uid, info]) => ({
        userId: info.userId || uid,
        displayName: info.displayName,
        sentAt: info.fReqInfo?.time
      }));
      return ok({ requests: list, count: list.length });
    }
    case "undo-friend-request": {
      if (!p.userId) throw new Error("userId required");
      const a = await api();
      const uid = await resolveUserId(p.userId);
      await a.undoFriendRequest(uid);
      return ok({ success: true, userId: uid });
    }
    case "unfriend": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      await a.removeFriend(uid);
      return ok({ success: true, userId: uid });
    }
    case "check-friend-status": {
      if (!p.userId) throw new Error("userId required");
      const a = await api();
      const st = await a.getFriendRequestStatus(p.userId);
      return ok({
        userId: p.userId,
        isFriend: st.is_friend === 1,
        isRequested: st.is_requested === 1,
        isRequesting: st.is_requesting === 1
      });
    }
    case "set-friend-nickname": {
      if (!p.userId || !p.nickname) throw new Error("userId and nickname required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      await a.changeFriendAlias(uid, p.nickname);
      return ok({ success: true, userId: uid, nickname: p.nickname });
    }
    case "remove-friend-nickname": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      await a.removeFriendAlias(uid);
      return ok({ success: true, userId: uid });
    }
    case "get-online-friends": {
      const a = await api();
      const res = await a.getFriendOnlines();
      return ok({ onlineFriends: res });
    }
    case "get-close-friends": {
      const a = await api();
      const res = await a.getCloseFriends();
      return ok({ closeFriends: res });
    }
    case "get-friend-recommendations": {
      const a = await api();
      const res = await a.getFriendRecommendations();
      return ok({ recommendations: res });
    }
    case "get-alias-list": {
      const a = await api();
      const res = await a.getAliasList();
      return ok({ aliases: res });
    }
    case "get-related-friend-groups": {
      const uid = p.userId ? await resolveUserId(p.userId) : getCurrentUid() ?? "";
      if (!uid) throw new Error("userId required (or login first)");
      const a = await api();
      const res = await a.getRelatedFriendGroup(uid);
      return ok({ groups: res });
    }
    case "get-multi-users-by-phones": {
      if (!p.phoneNumbers?.length) throw new Error("phoneNumbers required");
      const a = await api();
      const res = await a.getMultiUsersByPhones(p.phoneNumbers);
      return ok({ users: res });
    }
    case "send-to-stranger": {
      if (!p.userId || !p.message) throw new Error("userId and message required");
      const a = await api();
      const res = await a.sendMessage({ msg: p.message }, p.userId, ThreadType3.User);
      return ok({
        success: true,
        msgId: res?.message?.msgId,
        note: "May not be received if stranger doesn't accept messages"
      });
    }
    // ── Groups ─────────────────────────────────────────────────────────────
    case "groups": {
      const a = await api();
      const resp = await a.getAllGroups();
      const ids = Object.keys(resp?.gridVerMap ?? {});
      if (ids.length === 0) return ok({ groups: [], count: 0 });
      try {
        const info = await a.getGroupInfo(ids);
        const map = info?.gridInfoMap ?? {};
        let groups = Object.entries(map).map(([id, g]) => ({
          groupId: id,
          name: g.name,
          desc: g.desc,
          totalMember: g.totalMember,
          creatorId: g.creatorId
        }));
        if (p.query?.trim()) {
          const q = p.query.trim().toLowerCase();
          groups = groups.filter((g) => (g.name ?? "").toLowerCase().includes(q));
        }
        return ok({ groups, count: groups.length });
      } catch {
        return ok({ groups: ids.map((id) => ({ groupId: id })), count: ids.length });
      }
    }
    case "get-group-info": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const info = await a.getGroupInfo([gid]);
      const g = info?.gridInfoMap?.[gid];
      return ok({
        groupId: gid,
        name: g?.name,
        desc: g?.desc,
        totalMember: g?.totalMember,
        memberIds: extractMemberIds(g),
        creatorId: g?.creatorId,
        adminIds: g?.adminIds
      });
    }
    case "create-group": {
      if (!p.groupName || !p.memberIds?.length) throw new Error("groupName and memberIds required");
      const a = await api();
      const ids = await Promise.all(p.memberIds.map(resolveUserId));
      const res = await a.createGroup({ name: p.groupName, members: ids });
      return ok({ success: true, result: res });
    }
    case "add-to-group": {
      if (!p.groupId || !p.memberIds?.length) throw new Error("groupId and memberIds required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const ids = await Promise.all(p.memberIds.map(resolveUserId));
      const res = await a.addUserToGroup(ids, gid);
      return ok({ success: true, result: res });
    }
    case "remove-from-group": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.removeUserFromGroup(uid, gid);
      return ok({ success: true, result: res });
    }
    case "leave-group": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.leaveGroup(gid);
      return ok({ success: true, result: res });
    }
    case "rename-group": {
      if (!p.groupId || !p.groupName) throw new Error("groupId and groupName required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.changeGroupName(gid, p.groupName);
      return ok({ success: true, result: res });
    }
    case "add-group-admin": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.addGroupDeputy(gid, uid);
      return ok({ success: true, result: res });
    }
    case "remove-group-admin": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.removeGroupDeputy(gid, uid);
      return ok({ success: true, result: res });
    }
    case "change-group-owner": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.changeGroupOwner(gid, uid);
      return ok({ success: true, result: res });
    }
    case "disperse-group": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.disperseGroup(gid);
      return ok({ success: true, result: res });
    }
    case "update-group-settings": {
      if (!p.groupId || !p.groupSettings) throw new Error("groupId and groupSettings required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.updateGroupSettings(p.groupSettings, gid);
      return ok({ success: true, result: res });
    }
    case "enable-group-link": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.enableGroupLink(gid);
      return ok({ success: true, result: res });
    }
    case "disable-group-link": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.disableGroupLink(gid);
      return ok({ success: true, result: res });
    }
    case "get-group-link": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.getGroupLinkDetail(gid);
      return ok({ result: res });
    }
    case "get-pending-members": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.getPendingGroupMembers(gid);
      return ok({ result: res });
    }
    case "review-pending-members": {
      if (!p.groupId || !p.memberIds?.length || p.isApprove === void 0)
        throw new Error("groupId, memberIds, and isApprove required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.reviewPendingMemberRequest({ members: p.memberIds, isApprove: p.isApprove }, gid);
      return ok({ success: true, result: res });
    }
    case "get-group-blocked": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.getGroupBlockedMember({}, gid);
      return ok({ result: res });
    }
    case "block-group-member": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.addGroupBlockedMember(uid, gid);
      return ok({ success: true, result: res });
    }
    case "unblock-group-member": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.removeGroupBlockedMember(uid, gid);
      return ok({ success: true, result: res });
    }
    case "get-group-members-info": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const groupInfoResp = await a.getGroupInfo([gid]);
      const groupInfo = groupInfoResp?.gridInfoMap?.[gid];
      const memberIds = extractMemberIds(groupInfo);
      const profiles = {};
      const unchangedsProfile = [];
      const batchSize = 40;
      for (let i = 0; i < memberIds.length; i += batchSize) {
        const batch = memberIds.slice(i, i + batchSize);
        const res = await a.getGroupMembersInfo(batch);
        Object.assign(profiles, res?.profiles ?? {});
        unchangedsProfile.push(...res?.unchangeds_profile ?? []);
      }
      return ok({
        groupId: gid,
        totalMemberIds: memberIds.length,
        result: { profiles, unchangeds_profile: unchangedsProfile }
      });
    }
    case "join-group-link": {
      if (!p.link) throw new Error("link required");
      const a = await api();
      let info = null;
      try {
        info = await a.getGroupLinkInfo(p.link);
      } catch {
      }
      const res = await a.joinGroupLink(p.link);
      return ok({ success: true, groupInfo: info, result: res });
    }
    case "invite-to-groups": {
      if (!p.userId || !p.groupIds?.length) throw new Error("userId and groupIds required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.inviteUserToGroups(uid, p.groupIds);
      return ok({ success: true, result: res });
    }
    case "get-group-invites": {
      const a = await api();
      const res = await a.getGroupInviteBoxList();
      return ok({ invites: res });
    }
    case "join-group-invite": {
      if (!p.groupId) throw new Error("groupId required");
      const a = await api();
      const res = await a.joinGroupInviteBox(p.groupId);
      return ok({ success: true, result: res });
    }
    case "delete-group-invite": {
      if (!p.groupId) throw new Error("groupId required");
      const a = await api();
      const res = await a.deleteGroupInviteBox(p.groupId);
      return ok({ success: true, result: res });
    }
    case "change-group-avatar": {
      if (!p.groupId || !p.url) throw new Error("groupId and url required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      if (/^https?:\/\//i.test(p.url)) {
        const { buffer } = await safeFetch(p.url, { maxSizeBytes: 5 * 1024 * 1024 });
        await a.changeGroupAvatar({ data: buffer, filename: "avatar.jpg", metadata: { totalSize: buffer.length, width: 400, height: 400 } }, gid);
      } else {
        await a.changeGroupAvatar(p.url, gid);
      }
      return ok({ success: true, groupId: gid });
    }
    case "upgrade-group-to-community": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      await a.upgradeGroupToCommunity(gid);
      return ok({ success: true, groupId: gid });
    }
    case "get-group-chat-history": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.getGroupChatHistory(gid, p.count ?? 20);
      return ok({ history: res });
    }
    // ── Polls ──────────────────────────────────────────────────────────────
    case "create-poll": {
      if (!p.threadId || !p.title || !p.options?.length) throw new Error("threadId, title, options required");
      const a = await api();
      const pollOpts = { question: p.title, options: p.options };
      if (p.expiredTime !== void 0) pollOpts.expiredTime = p.expiredTime;
      if (p.allowMultiChoices !== void 0) pollOpts.allowMultiChoices = p.allowMultiChoices;
      if (p.allowAddNewOption !== void 0) pollOpts.allowAddNewOption = p.allowAddNewOption;
      if (p.hideVotePreview !== void 0) pollOpts.hideVotePreview = p.hideVotePreview;
      if (p.isAnonymous !== void 0) pollOpts.isAnonymous = p.isAnonymous;
      const res = await a.createPoll(pollOpts, p.threadId);
      return ok({ success: true, poll: res });
    }
    case "vote-poll": {
      if (!p.pollId || !p.threadId || p.optionId === void 0) throw new Error("pollId, threadId, optionId required");
      const a = await api();
      const res = await a.votePoll(p.pollId, p.optionId);
      return ok({ success: true, result: res });
    }
    case "lock-poll": {
      if (!p.pollId || !p.threadId) throw new Error("pollId and threadId required");
      const a = await api();
      const res = await a.lockPoll(p.pollId);
      return ok({ success: true, result: res });
    }
    case "get-poll-detail": {
      if (!p.pollId || !p.threadId) throw new Error("pollId and threadId required");
      const a = await api();
      const res = await a.getPollDetail(String(p.pollId));
      return ok({ poll: res });
    }
    case "add-poll-options": {
      if (!p.pollId || !p.threadId || !p.options?.length) throw new Error("pollId, threadId, options required");
      const a = await api();
      const res = await a.addPollOptions({ pollId: p.pollId, options: p.options.map((o) => ({ content: o, voted: false })), votedOptionIds: [] });
      return ok({ success: true, result: res });
    }
    case "share-poll": {
      if (!p.pollId || !p.threadId || !p.threadIds?.length) throw new Error("pollId, threadId, threadIds required");
      const a = await api();
      const res = await a.sharePoll(p.pollId);
      return ok({ success: true, result: res });
    }
    // ── Reminders ──────────────────────────────────────────────────────────
    case "create-reminder": {
      if (!p.threadId || !p.title || !p.startTime) throw new Error("threadId, title, startTime required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.createReminder(
        { title: p.title, startTime: p.startTime, emoji: p.emoji, repeat: p.repeat },
        p.threadId,
        type
      );
      return ok({ success: true, result: res });
    }
    case "remove-reminder": {
      if (!p.reminderId || !p.threadId) throw new Error("reminderId and threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.removeReminder(p.reminderId, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "edit-reminder": {
      if (!p.reminderId || !p.threadId) throw new Error("reminderId and threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.editReminder(
        { title: p.title, topicId: p.reminderId, startTime: p.startTime, emoji: p.emoji, repeat: p.repeat },
        p.threadId,
        type
      );
      return ok({ success: true, result: res });
    }
    case "list-reminders": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.getListReminder({}, p.threadId, type);
      return ok({ reminders: res });
    }
    // ── Conversation ───────────────────────────────────────────────────────
    case "mute-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const d = p.duration === -1 ? MuteDuration.FOREVER : p.duration === 3600 ? MuteDuration.ONE_HOUR : p.duration === 14400 ? MuteDuration.FOUR_HOURS : MuteDuration.FOREVER;
      const res = await a.setMute({ action: MuteAction.MUTE, duration: d }, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "unmute-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.setMute({ action: MuteAction.UNMUTE }, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "pin-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.setPinnedConversations(true, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "unpin-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.setPinnedConversations(false, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "delete-chat": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.deleteChat({ ownerId: getCurrentUid() ?? "", cliMsgId: "", globalMsgId: "" }, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "hide-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.setHiddenConversations(true, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "unhide-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.setHiddenConversations(false, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "get-hidden-conversations": {
      const a = await api();
      const res = await a.getHiddenConversations();
      return ok({ conversations: res });
    }
    case "mark-unread": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.addUnreadMark(p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "unmark-unread": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.removeUnreadMark(p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "get-unread-marks": {
      const a = await api();
      const res = await a.getUnreadMark();
      return ok({ marks: res });
    }
    case "set-auto-delete-chat": {
      if (!p.threadId || p.ttl === void 0) throw new Error("threadId and ttl required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.updateAutoDeleteChat(p.ttl, p.threadId, type);
      return ok({ success: true, result: res });
    }
    case "get-auto-delete-chats": {
      const a = await api();
      const res = await a.getAutoDeleteChat();
      return ok({ chats: res });
    }
    case "get-archived-chats": {
      const a = await api();
      const res = await a.getArchivedChatList();
      return ok({ archived: res });
    }
    case "update-archived-chat": {
      if (!p.threadId || p.isArchived === void 0) throw new Error("threadId and isArchived required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.updateArchivedChatList(p.isArchived, { id: p.threadId, type });
      return ok({ success: true, result: res });
    }
    case "get-mute-status": {
      const a = await api();
      const res = await a.getMute();
      return ok({ muted: res });
    }
    case "get-pinned-conversations": {
      const a = await api();
      const res = await a.getPinConversations();
      return ok({ pinned: res });
    }
    // ── Quick messages & auto-reply ────────────────────────────────────────
    case "list-quick-messages": {
      const a = await api();
      const res = await a.getQuickMessageList();
      return ok({ quickMessages: res });
    }
    case "add-quick-message": {
      if (!p.keyword || !p.message) throw new Error("keyword and message required");
      const a = await api();
      const res = await a.addQuickMessage({ keyword: p.keyword, title: p.message });
      return ok({ success: true, result: res });
    }
    case "remove-quick-message": {
      if (p.itemId === void 0) throw new Error("itemId required");
      const a = await api();
      const res = await a.removeQuickMessage(p.itemId);
      return ok({ success: true, result: res });
    }
    case "update-quick-message": {
      if (p.itemId === void 0 || !p.keyword || !p.message) throw new Error("itemId, keyword, message required");
      const a = await api();
      const res = await a.updateQuickMessage({ keyword: p.keyword, title: p.message }, p.itemId);
      return ok({ success: true, result: res });
    }
    case "list-auto-replies": {
      const a = await api();
      const res = await a.getAutoReplyList();
      return ok({ autoReplies: res });
    }
    case "create-auto-reply": {
      if (!p.message || p.startTime === void 0 || p.endTime === void 0) throw new Error("message, startTime, endTime required");
      const a = await api();
      const res = await a.createAutoReply({
        content: p.message,
        isEnable: p.isEnable ?? true,
        startTime: p.startTime,
        endTime: p.endTime,
        scope: p.scope ?? 0,
        uids: p.memberIds
      });
      return ok({ success: true, result: res });
    }
    case "update-auto-reply": {
      if (p.replyId === void 0 || !p.message || p.startTime === void 0 || p.endTime === void 0)
        throw new Error("replyId, message, startTime, endTime required");
      const a = await api();
      const res = await a.updateAutoReply({
        id: p.replyId,
        content: p.message,
        isEnable: p.isEnable ?? true,
        startTime: p.startTime,
        endTime: p.endTime,
        scope: p.scope ?? 0,
        uids: p.memberIds
      });
      return ok({ success: true, result: res });
    }
    case "delete-auto-reply": {
      if (p.replyId === void 0) throw new Error("replyId required");
      const a = await api();
      const res = await a.deleteAutoReply(p.replyId);
      return ok({ success: true, result: res });
    }
    // ── Settings ───────────────────────────────────────────────────────────
    case "get-settings": {
      const a = await api();
      const res = await a.getSettings();
      return ok({ settings: res });
    }
    case "update-setting": {
      if (!p.settingKey || p.settingValue === void 0) throw new Error("settingKey and settingValue required");
      const a = await api();
      const res = await a.updateSettings(p.settingKey, p.settingValue);
      return ok({ success: true, result: res });
    }
    case "update-active-status": {
      if (p.active === void 0) throw new Error("active required (true/false)");
      const a = await api();
      const res = await a.updateActiveStatus(p.active);
      return ok({ success: true, result: res });
    }
    // ── Profile & account ──────────────────────────────────────────────────
    case "me": {
      const a = await api();
      const ownId = a.getOwnId();
      let info = null;
      try {
        info = await a.fetchAccountInfo();
      } catch {
      }
      const profile = info?.profile ?? info;
      return ok({
        userId: profile?.userId ?? ownId,
        username: profile?.username,
        displayName: profile?.displayName,
        zaloName: profile?.zaloName,
        avatar: profile?.avatar,
        bgavatar: profile?.bgavatar,
        cover: profile?.cover,
        phoneNumber: profile?.phoneNumber,
        gender: profile?.gender,
        dob: profile?.dob,
        sdob: profile?.sdob,
        status: profile?.status,
        bio: profile?.bio ?? profile?.description ?? profile?.status,
        globalId: profile?.globalId,
        isActive: profile?.isActive,
        accountStatus: profile?.accountStatus,
        createdTs: profile?.createdTs
      });
    }
    case "status": {
      const { isAuthenticated: isAuthenticated2, hasStoredCredentials: hasStoredCredentials2 } = await Promise.resolve().then(() => (init_zalo_client(), zalo_client_exports));
      return ok({ authenticated: isAuthenticated2(), hasCredentials: hasStoredCredentials2() });
    }
    case "get-user-info": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const info = await a.getUserInfo(uid);
      return ok({ userId: uid, info });
    }
    case "last-online": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.lastOnline(uid);
      return ok({
        userId: uid,
        lastOnline: res?.lastOnline,
        showOnlineStatus: res?.settings?.show_online_status
      });
    }
    case "get-qr": {
      const a = await api();
      const uid = getCurrentUid();
      if (!uid) throw new Error("Not logged in");
      const res = await a.getQR(uid);
      return ok({ qr: res });
    }
    case "update-profile": {
      const a = await api();
      const meInfo = await a.fetchAccountInfo();
      const currentProfile = meInfo?.profile ?? meInfo;
      const res = await a.updateProfile({
        profile: {
          name: p.name ?? currentProfile?.displayName ?? "",
          dob: p.dob ?? currentProfile?.dob ?? "2000-01-01",
          gender: p.gender ?? currentProfile?.gender ?? 0
        }
      });
      return ok({ success: true, result: res });
    }
    case "update-profile-bio": {
      if (!p.bio) throw new Error("bio required");
      const a = await api();
      const res = await a.updateProfileBio(p.bio);
      return ok({ success: true, result: res });
    }
    case "change-avatar": {
      if (!p.url) throw new Error("url required");
      const a = await api();
      let avatarSource = p.url;
      if (/^https?:\/\//i.test(p.url)) {
        const tmpPath = nodePath.join(nodeOs.tmpdir(), `zalo-avatar-${Date.now()}-${nodeCrypto.randomBytes(4).toString("hex")}.jpg`);
        const { buffer } = await safeFetch(p.url, { maxSizeBytes: 5 * 1024 * 1024 });
        nodeFs.writeFileSync(tmpPath, buffer, { mode: 384 });
        try {
          const res2 = await a.changeAccountAvatar(tmpPath);
          return ok({ success: true, result: res2 });
        } finally {
          try {
            nodeFs.unlinkSync(tmpPath);
          } catch {
          }
        }
      }
      const res = await a.changeAccountAvatar(avatarSource);
      return ok({ success: true, result: res });
    }
    case "delete-avatar": {
      if (!p.photoId) throw new Error("photoId required");
      const a = await api();
      const res = await a.deleteAvatar(p.photoId);
      return ok({ success: true, result: res });
    }
    case "get-avatar-list": {
      const a = await api();
      const res = await a.getAvatarList();
      return ok({ avatars: res });
    }
    case "reuse-avatar": {
      if (!p.photoId) throw new Error("photoId required");
      const a = await api();
      const res = await a.reuseAvatar(p.photoId);
      return ok({ success: true, result: res });
    }
    case "get-biz-account": {
      const a = await api();
      const res = await a.getBizAccount();
      return ok({ bizAccount: res });
    }
    // ── Stickers & misc ────────────────────────────────────────────────────
    case "search-stickers": {
      if (!p.keyword) throw new Error("keyword required");
      const a = await api();
      const ids = await a.getStickers(p.keyword);
      return ok({ stickerIds: ids, count: ids?.length ?? 0 });
    }
    case "search-sticker-detail": {
      if (!p.stickerId) throw new Error("stickerId required");
      const a = await api();
      const details = await a.getStickersDetail(p.stickerId);
      return ok({ details });
    }
    case "parse-link": {
      if (!p.url) throw new Error("url required");
      const a = await api();
      const res = await a.parseLink(p.url);
      return ok({ result: res });
    }
    case "send-report": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType3.Group : ThreadType3.User;
      const res = await a.sendReport(
        p.reason && p.reason !== 0 ? { reason: p.reason } : { reason: 0, content: p.message ?? "" },
        p.threadId,
        type
      );
      return ok({ success: true, result: res });
    }
    // ── Notes & labels ─────────────────────────────────────────────────────
    case "create-note": {
      if (!p.threadId || !p.title) throw new Error("threadId and title required");
      const a = await api();
      const res = await a.createNote(
        { title: p.title, pinAct: p.pinAct ?? false },
        p.threadId
      );
      return ok({ success: true, result: res });
    }
    case "edit-note": {
      if (!p.threadId || !p.topicId) throw new Error("threadId and topicId required");
      const a = await api();
      const res = await a.editNote(
        { topicId: p.topicId, title: p.title ?? "" },
        p.threadId
      );
      return ok({ success: true, result: res });
    }
    case "get-boards": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const res = await a.getListBoard({}, p.threadId);
      return ok({ boards: res });
    }
    case "get-labels": {
      const a = await api();
      const res = await a.getLabels();
      return ok({ labels: res });
    }
    // ── Catalogs & products ────────────────────────────────────────────────
    case "create-catalog": {
      if (!p.name) throw new Error("name required");
      const a = await api();
      const res = await a.createCatalog(p.name);
      return ok({ success: true, result: res });
    }
    case "update-catalog": {
      if (!p.catalogId || !p.name) throw new Error("catalogId and name required");
      const a = await api();
      const res = await a.updateCatalog({ catalogId: p.catalogId, catalogName: p.name });
      return ok({ success: true, result: res });
    }
    case "delete-catalog": {
      if (!p.catalogId) throw new Error("catalogId required");
      const a = await api();
      const res = await a.deleteCatalog(p.catalogId);
      return ok({ success: true, result: res });
    }
    case "get-catalogs": {
      const a = await api();
      const res = await a.getCatalogList();
      return ok({ catalogs: res });
    }
    case "create-product": {
      if (!p.name) throw new Error("name required");
      const a = await api();
      const opts = {
        catalogId: p.catalogId ?? "",
        productName: p.name,
        price: p.price ?? "0",
        description: p.description ?? ""
      };
      if (p.url) opts.product_photos = [p.url];
      const res = await a.createProductCatalog(opts);
      return ok({ success: true, result: res });
    }
    case "update-product": {
      if (!p.productId) throw new Error("productId required");
      const a = await api();
      const opts = {
        productId: p.productId,
        catalogId: p.catalogId ?? "",
        productName: p.name ?? "",
        price: p.price ?? "0",
        description: p.description ?? "",
        createTime: Date.now()
      };
      const res = await a.updateProductCatalog(opts);
      return ok({ success: true, result: res });
    }
    case "delete-product": {
      if (!p.productId || !p.catalogId) throw new Error("productId and catalogId required");
      const a = await api();
      const res = await a.deleteProductCatalog({ productIds: p.productId, catalogId: p.catalogId });
      return ok({ success: true, result: res });
    }
    case "get-products": {
      if (!p.catalogId) throw new Error("catalogId required");
      const a = await api();
      const res = await a.getProductCatalogList({ catalogId: p.catalogId });
      return ok({ products: res });
    }
    // ── Bot config (OpenClaw layer) ────────────────────────────────────────
    case "block-user": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const cfg = safeReadConfig();
      safeWriteConfig(addToDenyFrom(cfg, uid));
      return ok({ success: true, userId: uid, note: "Restart gateway for changes to take effect" });
    }
    case "unblock-user": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const cfg = safeReadConfig();
      safeWriteConfig(removeFromDenyFrom(cfg, uid));
      return ok({ success: true, userId: uid, note: "Restart gateway for changes to take effect" });
    }
    case "list-blocked": {
      const cfg = safeReadConfig();
      return ok({ blocked: listBlockedUsers(cfg) });
    }
    case "list-allowed": {
      const cfg = safeReadConfig();
      return ok({ allowed: listAllowedUsers(cfg) });
    }
    case "block-user-in-group": {
      if (!p.userId || !p.groupId) throw new Error("userId and groupId required");
      const uid = await resolveUserId(p.userId);
      const gid = await resolveGroupId(p.groupId);
      const cfg = safeReadConfig();
      safeWriteConfig(addToGroupDenyUsers(cfg, gid, uid));
      return ok({ success: true, userId: uid, groupId: gid, note: "Restart gateway" });
    }
    case "unblock-user-in-group": {
      if (!p.userId || !p.groupId) throw new Error("userId and groupId required");
      const uid = await resolveUserId(p.userId);
      const gid = await resolveGroupId(p.groupId);
      const cfg = safeReadConfig();
      safeWriteConfig(removeFromGroupDenyUsers(cfg, gid, uid));
      return ok({ success: true, userId: uid, groupId: gid, note: "Restart gateway" });
    }
    case "allow-user-in-group": {
      if (!p.userId || !p.groupId) throw new Error("userId and groupId required");
      const uid = await resolveUserId(p.userId);
      const gid = await resolveGroupId(p.groupId);
      const cfg = safeReadConfig();
      safeWriteConfig(addToGroupAllowUsers(cfg, gid, uid));
      return ok({ success: true, userId: uid, groupId: gid, note: "Restart gateway" });
    }
    case "unallow-user-in-group": {
      if (!p.userId || !p.groupId) throw new Error("userId and groupId required");
      const uid = await resolveUserId(p.userId);
      const gid = await resolveGroupId(p.groupId);
      const cfg = safeReadConfig();
      safeWriteConfig(removeFromGroupAllowUsers(cfg, gid, uid));
      return ok({ success: true, userId: uid, groupId: gid, note: "Restart gateway" });
    }
    case "list-allowed-in-group": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const cfg = safeReadConfig();
      return ok({ groupId: gid, allowed: listAllowedUsersInGroup(cfg, gid) });
    }
    case "list-blocked-in-group": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const cfg = safeReadConfig();
      return ok({ groupId: gid, blocked: listBlockedUsersInGroup(cfg, gid) });
    }
    case "group-mention": {
      if (!p.groupId || p.requireMention === void 0) throw new Error("groupId and requireMention (boolean) required \u2014 this sets whether bot requires @mention in this group; to send @mention use send-styled or send");
      const gid = await resolveGroupId(p.groupId);
      const cfg = safeReadConfig();
      safeWriteConfig(setGroupRequireMention(cfg, gid, p.requireMention));
      return ok({
        success: true,
        groupId: gid,
        requireMention: p.requireMention,
        note: "Config updated. Restart gateway for changes to take effect."
      });
    }
    // ── Zalo-level block ───────────────────────────────────────────────────
    case "zalo-block-user": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.blockUser(uid);
      return ok({ success: true, userId: uid, result: res });
    }
    case "zalo-unblock-user": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.unblockUser(uid);
      return ok({ success: true, userId: uid, result: res });
    }
    // ── New APIs ───────────────────────────────────────────────────────────
    case "get-reminder": {
      if (!p.reminderId) throw new Error("reminderId required");
      const a = await api();
      const res = await a.getReminder(p.reminderId);
      return ok({ reminder: res });
    }
    case "get-reminder-responses": {
      if (!p.reminderId) throw new Error("reminderId required");
      const a = await api();
      const res = await a.getReminderResponses(p.reminderId);
      return ok({ reminderId: p.reminderId, acceptMembers: res?.acceptMember, rejectMembers: res?.rejectMember });
    }
    case "get-friend-board": {
      if (!p.threadId) throw new Error("threadId required (conversationId)");
      const a = await api();
      const res = await a.getFriendBoardList(p.threadId);
      return ok({ data: res?.data, version: res?.version });
    }
    case "get-full-avatar": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.getFullAvatar(uid);
      return ok({ userId: uid, fullAvatar: res?.full_avatar, backgroundAvatar: res?.bk_full_avatar });
    }
    case "recall-group-history": {
      const gid = p.groupId ?? p.threadId;
      if (!gid) throw new Error("groupId or threadId required");
      const records = recallGroupHistory({
        groupId: gid,
        limit: typeof p.count === "number" ? p.count : 50,
        query: p.query
      });
      if (records.length === 0) return ok({ groupId: gid, count: 0, messages: [], note: "No passive history found for this group." });
      const messages = records.map((r) => ({
        ts: r.ts,
        sender_name: r.sender_name,
        sender_id: r.sender_id,
        msg: r.msg,
        ...r.msg_id ? { msg_id: r.msg_id } : {}
      }));
      return ok({ groupId: gid, count: messages.length, messages });
    }
    case "list-passive-groups": {
      const groups = listPassiveGroups();
      return ok({ count: groups.length, groups });
    }
    // ── Channel control ────────────────────────────────────────────────────
    case "stop-channel":
      return handleChannelEnable(false);
    case "start-channel":
      return handleChannelEnable(true);
    case "restart-channel": {
      setTimeout(() => process.kill(process.pid, "SIGUSR1"), 300);
      return ok({ success: true, message: "ZaloClaw gateway hot-reloading..." });
    }
    // ── Self-update ────────────────────────────────────────────────────────
    case "self-update":
      return handleSelfUpdate();
    default:
      return ok({ error: true, message: `Unknown action: ${p.action}` });
  }
}

// src/runtime/bridge.ts
function exposeBridgeService() {
  const service = {
    version: 1,
    getStatus(accountId = "default") {
      return { connected: true, accountId, channel: "zaloclaw" };
    },
    listActions(_accountId) {
      return ACTIONS;
    },
    async executeAction(accountId, params) {
      return executeZaloClawTool(accountId, params);
    }
  };
  globalThis.__zaloclawBridgeService = service;
}

// index.ts
var plugin = {
  id: "zaloclaw",
  name: "ZaloClaw",
  description: "Zalo personal account messaging via zca-js library",
  configSchema: emptyPluginConfigSchema(),
  register(api) {
    setZaloClawRuntime(api.runtime);
    api.registerChannel({ plugin: zaloClawPlugin });
    exposeBridgeService();
    api.registerTool({
      name: "zaloclaw",
      label: "ZaloClaw",
      description: "Complete Zalo personal account management via zca-js (153 actions). Messaging: send, image, link, send-to-stranger, send-video, send-voice, send-sticker, send-card, send-bank-card, delete-message, undo-message (recall), forward-message, add-reaction, send-typing. Friend: find-user, send-friend-request, accept/reject-friend-request, get-sent/friend-requests, undo-friend-request, unfriend, check-friend-status, set/remove-friend-nickname, get-online-friends, get-friend-recommendations, get-alias-list, get-related-friend-groups. Groups: list/search-groups, get-group-info, create-group, add/remove-to/from-group, leave-group, rename-group, add/remove-group-admin, change-group-owner, disperse-group, update-group-settings, enable/disable/get-group-link, get/review-pending-members, get-group-blocked, block/unblock-group-member, get-group-members-info, join-group-link, invite-to-groups, get-group-invites, join/delete-group-invite. Polls: create-poll, vote-poll, lock-poll, get-poll-detail, add-poll-options, share-poll. Reminders: create/remove/edit-reminder, list-reminders. Conversation: mute/unmute/pin/unpin-conversation, delete-chat, hide/unhide-conversation, get-hidden-conversations, mark/unmark-unread, get-unread-marks, set-auto-delete-chat, get-auto-delete-chats, get-archived-chats. Quick Messages: list/add/remove/update-quick-message. Auto-Reply: list/create/update/delete-auto-reply. Profile: me, get-user-info, last-online, get-qr, update-profile, change-avatar, delete-avatar, get-avatar-list, reuse-avatar. Settings: get-settings, update-setting, update-active-status. Notes: create-note, edit-note, get-boards, get-labels. Catalogs: create/update/delete-catalog, get-catalogs, create/update/delete-product, get-products. Block: block/unblock-user (OpenClaw), zalo-block/unblock-user (Zalo-level), block-view-feed. Misc: search-stickers, parse-link, send-report, get-biz-account. Channel: stop-channel, start-channel, restart-channel, self-update. Names are auto-resolved to IDs.",
      parameters: ZaloClawToolSchema,
      execute: executeZaloClawTool
    });
  }
};
var index_default = plugin;
export {
  index_default as default
};
