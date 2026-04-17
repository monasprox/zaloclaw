/**
 * Tests for mention-parser: parseOutboundMentions and the getUserInfo fallback
 * when getGroupMembersInfo returns empty profiles.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseOutboundMentions,
  resolveOutboundMentions,
  primeGroupMemberCacheForTesting,
  clearGroupMemberCache,
} from "../src/parsing/mention-parser.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeIndex(members: Array<{ uid: string; name: string }>) {
  // Leverage primeGroupMemberCacheForTesting to build the same index structure
  // that loadGroupMemberIndex would produce, then call parseOutboundMentions directly.
  const gid = "__test__";
  primeGroupMemberCacheForTesting(gid, members);
  // Return a tagged group ID so resolveOutboundMentions can find the cache.
  return gid;
}

// ── parseOutboundMentions ─────────────────────────────────────────────────────

describe("parseOutboundMentions (via primed cache)", () => {
  beforeEach(() => clearGroupMemberCache());

  it("resolves @[Name] bracket form to mention with correct position and length", async () => {
    primeGroupMemberCacheForTesting("grp1", [{ uid: "u1", name: "Văn Hoá" }]);
    const result = await resolveOutboundMentions("grp1", "Xin chào @[Văn Hoá] bạn khỏe không?");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].uid).toBe("u1");
    expect(result.mentions[0].pos).toBe("Xin chào @".length - 1); // '@' is at pos 9
    expect(result.text).toContain("@Văn Hoá");
    // Brackets should be stripped from output text
    expect(result.text).not.toContain("[");
    expect(result.text).not.toContain("]");
  });

  it("resolves bare @Name form", async () => {
    primeGroupMemberCacheForTesting("grp2", [{ uid: "u2", name: "Linh" }]);
    const result = await resolveOutboundMentions("grp2", "Hey @Linh bạn ổn không?");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].uid).toBe("u2");
  });

  it("returns empty mentions when name not in index", async () => {
    primeGroupMemberCacheForTesting("grp3", [{ uid: "u3", name: "Alice" }]);
    const result = await resolveOutboundMentions("grp3", "Hey @Bob bạn ổn không?");
    expect(result.mentions).toHaveLength(0);
    expect(result.text).toBe("Hey @Bob bạn ổn không?");
  });

  it("returns empty mentions when text has no @", async () => {
    primeGroupMemberCacheForTesting("grp4", [{ uid: "u4", name: "Alice" }]);
    const result = await resolveOutboundMentions("grp4", "Xin chào mọi người");
    expect(result.mentions).toHaveLength(0);
  });

  it("resolves multiple @[Name] in one message", async () => {
    primeGroupMemberCacheForTesting("grp5", [
      { uid: "u5a", name: "An" },
      { uid: "u5b", name: "Bình" },
    ]);
    const result = await resolveOutboundMentions("grp5", "@[An] và @[Bình] ơi vào họp nào");
    expect(result.mentions).toHaveLength(2);
    const uids = result.mentions.map((m) => m.uid).sort();
    expect(uids).toEqual(["u5a", "u5b"].sort());
  });

  it("does not resolve name with ambiguous duplicates", async () => {
    // Two members share the same name — uniqueNameToUid should not include them
    primeGroupMemberCacheForTesting("grp6", [
      { uid: "u6a", name: "Minh" },
      { uid: "u6b", name: "Minh" },
    ]);
    const result = await resolveOutboundMentions("grp6", "@[Minh] ơi");
    expect(result.mentions).toHaveLength(0);
  });
});

// ── getUserInfo fallback ──────────────────────────────────────────────────────

vi.mock("../src/client/zalo-client.js", () => ({
  getApi: vi.fn(),
}));

import { getApi } from "../src/client/zalo-client.js";

describe("resolveOutboundMentions — getUserInfo fallback when getGroupMembersInfo is empty", () => {
  beforeEach(() => {
    clearGroupMemberCache();
    vi.resetAllMocks();
  });

  it("falls back to batch getUserInfo when getGroupMembersInfo returns empty profiles", async () => {
    const mockApi = {
      getGroupInfo: vi.fn().mockResolvedValue({
        gridInfoMap: { grp_fb1: { memberIds: ["uid_vhoa"] } },
      }),
      getGroupMembersInfo: vi.fn().mockResolvedValue({ profiles: {}, unchangeds_profile: ["grp_fb1"] }),
      getUserInfo: vi.fn().mockResolvedValue({
        changed_profiles: { uid_vhoa: { displayName: "Văn Hoá", zaloName: "van-hoa" } },
        unchanged_profiles: {},
        phonebook_version: 1,
      }),
    };
    vi.mocked(getApi).mockResolvedValue(mockApi as any);

    const result = await resolveOutboundMentions("grp_fb1", "Xin chào @[Văn Hoá]");
    expect(mockApi.getUserInfo).toHaveBeenCalled();
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].uid).toBe("uid_vhoa");
    expect(result.text).toBe("Xin chào @Văn Hoá");
  });

  it("falls back to per-member getUserInfo when batch getUserInfo also returns empty", async () => {
    const mockApi = {
      getGroupInfo: vi.fn().mockResolvedValue({
        gridInfoMap: { grp_fb2: { memberIds: ["uid_linh"] } },
      }),
      getGroupMembersInfo: vi.fn().mockResolvedValue({ profiles: {}, unchangeds_profile: [] }),
      getUserInfo: vi.fn()
        .mockResolvedValueOnce({ changed_profiles: {}, unchanged_profiles: {}, phonebook_version: 1 }) // batch returns empty
        .mockResolvedValueOnce({ changed_profiles: { uid_linh: { displayName: "Linh", zaloName: "linh" } }, unchanged_profiles: {}, phonebook_version: 1 }), // per-member returns data
    };
    vi.mocked(getApi).mockResolvedValue(mockApi as any);

    const result = await resolveOutboundMentions("grp_fb2", "Hey @[Linh]");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].uid).toBe("uid_linh");
  });

  it("returns empty mentions gracefully when all fallbacks fail", async () => {
    const mockApi = {
      getGroupInfo: vi.fn().mockResolvedValue({
        gridInfoMap: { grp_fb3: { memberIds: ["uid_x"] } },
      }),
      getGroupMembersInfo: vi.fn().mockResolvedValue({ profiles: {}, unchangeds_profile: [] }),
      getUserInfo: vi.fn().mockRejectedValue(new Error("network error")),
    };
    vi.mocked(getApi).mockResolvedValue(mockApi as any);

    const result = await resolveOutboundMentions("grp_fb3", "Hey @[Unknown]");
    expect(result.mentions).toHaveLength(0);
    expect(result.text).toBe("Hey @[Unknown]");
  });

  it("uses getGroupMembersInfo result when profiles are non-empty (no fallback needed)", async () => {
    const mockApi = {
      getGroupInfo: vi.fn().mockResolvedValue({
        gridInfoMap: { grp_fb4: { memberIds: ["uid_tuan"] } },
      }),
      getGroupMembersInfo: vi.fn().mockResolvedValue({
        profiles: { uid_tuan: { displayName: "Tuấn", zaloName: "tuan", avatar: "", accountStatus: 1, type: 0, lastUpdateTime: 0, globalId: "", id: "uid_tuan" } },
        unchangeds_profile: [],
      }),
      getUserInfo: vi.fn(),
    };
    vi.mocked(getApi).mockResolvedValue(mockApi as any);

    const result = await resolveOutboundMentions("grp_fb4", "@[Tuấn] ơi");
    expect(mockApi.getUserInfo).not.toHaveBeenCalled();
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].uid).toBe("uid_tuan");
  });

  it("supports display_name field from UserBasic shape in getUserInfo response", async () => {
    const mockApi = {
      getGroupInfo: vi.fn().mockResolvedValue({
        gridInfoMap: { grp_fb5: { memberIds: ["uid_lan"] } },
      }),
      getGroupMembersInfo: vi.fn().mockResolvedValue({ profiles: {}, unchangeds_profile: [] }),
      getUserInfo: vi.fn().mockResolvedValue({
        changed_profiles: { uid_lan: { display_name: "Lan", zalo_name: "lan" } },
        unchanged_profiles: {},
        phonebook_version: 1,
      }),
    };
    vi.mocked(getApi).mockResolvedValue(mockApi as any);

    const result = await resolveOutboundMentions("grp_fb5", "@[Lan] vào họp");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].uid).toBe("uid_lan");
  });
});
