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

function buildIndex(members: Array<{ uid: string; name: string }>): GroupMemberIndex {
  const cleaned = members.filter((m) => m.uid && m.name && m.name.trim().length > 0);
  const counts = new Map<string, number>();
  for (const m of cleaned) {
    const key = m.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const uniqueNameToUid = new Map<string, string>();
  for (const m of cleaned) {
    const key = m.name.toLowerCase();
    if (counts.get(key) === 1) uniqueNameToUid.set(key, m.uid);
  }
  const byNameLower = cleaned
    .map((m) => ({ nameLower: m.name.toLowerCase(), nameOriginal: m.name, uid: m.uid }))
    .sort((a, b) => b.nameLower.length - a.nameLower.length);
  return { byNameLower, uniqueNameToUid };
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

  const profilesResp = await api.getGroupMembersInfo(memberIds);
  const profiles = profilesResp?.profiles ?? {};
  const members = Object.entries(profiles).map(([uid, p]: [string, any]) => ({
    uid,
    name: String(p.displayName ?? p.dName ?? p.zaloName ?? "").trim(),
  }));
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
