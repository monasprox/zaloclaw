import type { Mention } from "zca-js";
import { getApi } from "../client/zalo-client.js";

const MEMBER_CACHE_TTL_MS = 5 * 60 * 1000;
const MEMBER_CACHE_MAX = 50;

type GroupMemberIndex = {
  byNameLower: Array<{ nameLower: string; nameOriginal: string; uid: string }>;
  uniqueNameToUid: Map<string, string>;
};

type CachedGroupMembers = {
  index: GroupMemberIndex;
  cachedAt: number;
};

const groupMemberCache = new Map<string, CachedGroupMembers>();

function normalizeName(name: string): string {
  return name.trim().normalize("NFC");
}

function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

function profileName(profile: any): string {
  return normalizeName(
    String(
      profile?.displayName ??
      profile?.display_name ??
      profile?.dName ??
      profile?.zaloName ??
      profile?.zalo_name ??
      profile?.name ??
      "",
    ),
  );
}

function buildIndex(members: Array<{ uid: string; name: string }>): GroupMemberIndex {
  const cleaned = members
    .map((m) => ({ uid: m.uid, name: normalizeName(m.name) }))
    .filter((m) => m.uid && m.name.length > 0);
  const counts = new Map<string, number>();
  for (const m of cleaned) {
    const key = nameKey(m.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const uniqueNameToUid = new Map<string, string>();
  for (const m of cleaned) {
    const key = nameKey(m.name);
    if (counts.get(key) === 1) uniqueNameToUid.set(key, m.uid);
  }
  const byNameLower = cleaned
    .map((m) => ({ nameLower: nameKey(m.name), nameOriginal: m.name, uid: m.uid }))
    .sort((a, b) => b.nameLower.length - a.nameLower.length);
  return { byNameLower, uniqueNameToUid };
}

function upsertMembersFromProfiles(
  membersByUid: Map<string, { uid: string; name: string }>,
  profiles: Record<string, any>,
): void {
  for (const [uid, p] of Object.entries(profiles)) {
    const name = profileName(p);
    if (name) membersByUid.set(uid, { uid, name });
  }
}

async function fetchUserInfoProfiles(api: any, memberIds: string[]): Promise<Record<string, any>> {
  if (memberIds.length === 0) return {};
  try {
    const userInfoResp = await api.getUserInfo(memberIds);
    return (userInfoResp as any)?.changed_profiles ?? {};
  } catch {
    return {};
  }
}

async function loadGroupMemberIndex(groupId: string): Promise<GroupMemberIndex> {
  const cached = groupMemberCache.get(groupId);
  if (cached && Date.now() - cached.cachedAt < MEMBER_CACHE_TTL_MS) return cached.index;

  const api = await getApi();
  const groupResp = await api.getGroupInfo([groupId]);
  const info: any = groupResp?.gridInfoMap?.[groupId];
  if (!info) return buildIndex([]);

  let memberIds: string[] = info.memberIds ?? [];
  if (memberIds.length === 0) {
    const memVerList: string[] = info.memVerList ?? [];
    memberIds = memVerList.map((entry: string) => entry.split("_")[0]).filter(Boolean);
  }
  if (memberIds.length === 0) return buildIndex([]);

  const membersByUid = new Map<string, { uid: string; name: string }>();
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

  // Fallback: getGroupMembersInfo can return empty or partial profiles in some groups.
  // Supplement only the missing member IDs via getUserInfo.
  let missingMemberIds = memberIds.filter((uid) => !membersByUid.has(uid));
  if (missingMemberIds.length > 0) {
    const changedProfiles = await fetchUserInfoProfiles(api, missingMemberIds);
    upsertMembersFromProfiles(membersByUid, changedProfiles);
  }

  // Last-resort fallback: fetch missing members individually if batch getUserInfo failed or was partial.
  missingMemberIds = memberIds.filter((uid) => !membersByUid.has(uid));
  if (missingMemberIds.length > 0) {
    const settled = await Promise.allSettled(
      missingMemberIds.map((uid) => api.getUserInfo(uid)),
    );
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const changedProfiles: Record<string, any> = (result.value as any)?.changed_profiles ?? {};
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

export function primeGroupMemberCacheForTesting(
  groupId: string,
  members: Array<{ uid: string; name: string }>,
): void {
  groupMemberCache.set(groupId, { index: buildIndex(members), cachedAt: Date.now() });
}

export function clearGroupMemberCache(): void {
  groupMemberCache.clear();
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[\p{L}\p{N}_]/u.test(ch);
}

function longestNamePrefixMatch(rest: string, index: GroupMemberIndex): string | null {
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

export type ParseOutboundMentionsResult = {
  text: string;
  mentions: Mention[];
  stripIndices: number[];
};

export function parseOutboundMentions(
  input: string,
  index: GroupMemberIndex,
): ParseOutboundMentionsResult {
  if (!input || index.byNameLower.length === 0) {
    return { text: input, mentions: [], stripIndices: [] };
  }

  let output = "";
  const mentions: Mention[] = [];
  const stripIndices: number[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (ch === "@") {
      const prev = i > 0 ? input[i - 1] : undefined;
      if (isWordChar(prev)) {
        output += ch;
        i++;
        continue;
      }

      // Form 1: @[Display Name]
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

      // Form 2: bare @<longest member name>
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

export async function resolveOutboundMentions(
  groupId: string,
  text: string,
): Promise<ParseOutboundMentionsResult> {
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
