import type {
  ChannelAccountSnapshot,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelStatusIssue,
} from "openclaw/plugin-sdk/channel-contract";
import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-plugin-common";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { GroupToolPolicyConfig } from "openclaw/plugin-sdk/channel-policy";
import {
  applyAccountNameToChannelSection,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
} from "openclaw/plugin-sdk/channel-plugin-common";
import type { ZaloClawFriend, ZaloClawGroup, ZaloClawUserInfo } from "../runtime/types.js";
import {
  listZaloClawAccountIds,
  resolveDefaultZaloClawAccountId,
  resolveZaloClawAccountSync,
  getZaloClawUserInfo,
  checkZaloClawAuthenticated,
  type ResolvedZaloClawAccount,
} from "../client/accounts.js";
import { ZaloClawConfigSchema, ZaloClawChannelConfigSchema } from "../config/config-schema.js";
import { zaloClawOnboardingAdapter } from "./onboarding.js";
import { probeZaloClaw } from "./probe.js";
import { sendMessageZaloClaw, isLocalFilePath } from "./send.js";
import { collectZaloClawStatusIssues } from "../runtime/status-issues.js";
import { hasStoredCredentials, loginWithQR } from "../client/zalo-client.js";
import { LoginQRCallbackEventType } from "zca-js";
import { displayQRFromPNG } from "../client/qr-display.js";
import * as fs from "fs";
import * as readline from "readline";

const meta = {
  id: "zaloclaw",
  label: "ZaloClaw",
  selectionLabel: "ZaloClaw Account",
  docsPath: "/channels/zaloclaw",
  docsLabel: "zaloclaw",
  blurb: "Zalo personal account via zca-js library (no CLI needed).",
  aliases: ["oz"],
  order: 86,
  quickstartAllowFrom: true,
};

function mapUser(params: {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
  raw?: unknown;
}): ChannelDirectoryEntry {
  return {
    kind: "user",
    id: params.id,
    name: params.name ?? undefined,
    avatarUrl: params.avatarUrl ?? undefined,
    raw: params.raw,
  };
}

function mapGroup(params: {
  id: string;
  name?: string | null;
  raw?: unknown;
}): ChannelDirectoryEntry {
  return {
    kind: "group",
    id: params.id,
    name: params.name ?? undefined,
    raw: params.raw,
  };
}

function resolveZaloClawGroupRequireMention(params: ChannelGroupContext): boolean {
  const account = resolveZaloClawAccountSync({
    cfg: params.cfg,
    accountId: params.accountId ?? undefined,
  });
  const groups = account.config.groups ?? {};
  const groupId = params.groupId?.trim();
  const groupChannel = params.groupChannel?.trim();
  const candidates = [groupId, groupChannel, "*"].filter((value): value is string => Boolean(value));
  for (const key of candidates) {
    const entry = groups[key];
    if (entry && typeof entry.requireMention === "boolean") return entry.requireMention;
  }
  return true;
}

function resolveZaloClawGroupToolPolicy(
  params: ChannelGroupContext,
): GroupToolPolicyConfig | undefined {
  const account = resolveZaloClawAccountSync({
    cfg: params.cfg,
    accountId: params.accountId ?? undefined,
  });
  const groups = account.config.groups ?? {};
  const groupId = params.groupId?.trim();
  const groupChannel = params.groupChannel?.trim();
  const candidates = [groupId, groupChannel, "*"].filter((value): value is string => Boolean(value));
  for (const key of candidates) {
    const entry = groups[key];
    if (entry?.tools) return entry.tools;
  }
  return undefined;
}


export const zaloClawPlugin: ChannelPlugin<ResolvedZaloClawAccount> = {
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
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels['zaloclaw']"] },
  configSchema: ZaloClawChannelConfigSchema,
  config: {
    listAccountIds: (cfg) => listZaloClawAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveZaloClawAccountSync({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultZaloClawAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "zaloclaw",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "zaloclaw",
        accountId,
        clearBaseFields: [
          "name",
          "dmPolicy",
          "allowFrom",
          "groupPolicy",
          "groups",
          "messagePrefix",
        ],
      }),
    isConfigured: async () => hasStoredCredentials(),
    describeAccount: (account): ChannelAccountSnapshot => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: hasStoredCredentials(),
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveZaloClawAccountSync({ cfg, accountId }).config.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(zaloclaw|oz):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.['zaloclaw']?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels['zaloclaw'].accounts.${resolvedAccountId}.`
        : "channels['zaloclaw'].";
      return {
        policy: account.config.dmPolicy ?? "open",
        allowFrom: account.config.allowFrom ?? ["*"],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("zaloclaw"),
        normalizeEntry: (raw) => raw.replace(/^(zaloclaw|oz):/i, ""),
      };
    },
  },
  groups: {
    resolveRequireMention: resolveZaloClawGroupRequireMention,
    resolveToolPolicy: resolveZaloClawGroupToolPolicy,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- Zalo group mentions: tag a member by writing `@Name` (single-word name) or `@[Full Name]` (with spaces). The plugin auto-resolves the name to a real Zalo @mention and sends a notification. Unknown or ambiguous names are left as plain text — never invent a name that is not in the group.",
    ],
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({ cfg, channelKey: "zaloclaw", accountId, name }),
    validateInput: () => null,
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "zaloclaw",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({ cfg: namedConfig, channelKey: "zaloclaw" })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            'zaloclaw': { ...next.channels?.['zaloclaw'], enabled: true },
          },
        } as OpenClawConfig;
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          'zaloclaw': {
            ...next.channels?.['zaloclaw'],
            enabled: true,
            accounts: {
              ...next.channels?.['zaloclaw']?.accounts,
              [accountId]: {
                ...next.channels?.['zaloclaw']?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      } as OpenClawConfig;
    },
  },
  messaging: {
    normalizeTarget: (raw) => {
      const trimmed = raw?.trim();
      if (!trimmed) return undefined;
      return trimmed.replace(/^(zaloclaw|oz):/i, "");
    },
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        return /^\d{3,}$/.test(trimmed);
      },
      hint: "<threadId>",
    },
  },
  directory: {
    self: async ({ cfg, accountId, runtime }) => {
      try {
        const { getApi } = await import("../client/zalo-client.js");
        const api = await getApi();
        const raw = await api.fetchAccountInfo();
        const info = (raw as any)?.profile ?? raw;
        if (!info?.userId) return null;
        return mapUser({
          id: String(info.userId),
          name: info.displayName ?? null,
          avatarUrl: info.avatar ?? null,
          raw: info,
        });
      } catch (err) {
        runtime.error(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const { getApi } = await import("../client/zalo-client.js");
      const api = await getApi();
      const friends = await api.getAllFriends();
      let rows: ChannelDirectoryEntry[] = [];
      if (Array.isArray(friends)) {
        rows = friends.map((f: any) =>
          mapUser({
            id: String(f.userId),
            name: f.displayName ?? null,
            avatarUrl: f.avatar ?? null,
            raw: f,
          }),
        );
      }
      const q = query?.trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (r) => (r.name ?? "").toLowerCase().includes(q) || r.id.includes(q),
        );
      }
      return typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const { getApi } = await import("../client/zalo-client.js");
      const api = await getApi();
      const groupsResp = await api.getAllGroups();
      const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});
      let rows: ChannelDirectoryEntry[] = [];
      if (groupIds.length > 0) {
        try {
          const infoResp = await api.getGroupInfo(groupIds);
          const gridInfoMap = infoResp?.gridInfoMap ?? {};
          rows = Object.entries(gridInfoMap).map(([id, info]: [string, any]) =>
            mapGroup({ id, name: info.name ?? null, raw: info }),
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
      const { getApi } = await import("../client/zalo-client.js");
      const api = await getApi();
      const infoResp = await api.getGroupInfo(groupId);
      const groupInfo = infoResp?.gridInfoMap?.[groupId];
      let memberIds: string[] = groupInfo?.memberIds ?? [];
      if (memberIds.length === 0) {
        const memVerList: string[] = (groupInfo as any)?.memVerList ?? [];
        memberIds = memVerList.map((entry: string) => entry.split("_")[0]).filter(Boolean);
      }
      if (memberIds.length === 0) return [];
      try {
        const membersResp = await api.getGroupMembersInfo(memberIds);
        const profiles = membersResp?.profiles ?? {};
        const rows = Object.entries(profiles).map(([id, profile]: [string, any]) =>
          mapUser({
            id,
            name: profile.displayName ?? profile.zaloName ?? null,
            avatarUrl: profile.avatar ?? null,
            raw: profile,
          }),
        );
        return typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;
      } catch {
        const rows = memberIds.map((id: string) => mapUser({ id: String(id) }));
        return typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;
      }
    },
  },
  resolver: {
    resolveTargets: async ({ cfg, accountId, inputs, kind, runtime }) => {
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
          const { getApi } = await import("../client/zalo-client.js");
          const api = await getApi();
          if (kind === "user") {
            const friends = await api.getAllFriends();
            const friendList = Array.isArray(friends) ? friends : [];
            const matches = friendList
              .filter((f: any) => (f.displayName ?? "").toLowerCase().includes(trimmed.toLowerCase()))
              .map((f: any) => ({ id: String(f.userId), name: f.displayName ?? undefined }));
            const best = matches[0];
            results.push({
              input,
              resolved: Boolean(best?.id),
              id: best?.id,
              name: best?.name,
              note: matches.length > 1 ? "multiple matches; chose first" : undefined,
            });
          } else {
            const groupsResp = await api.getAllGroups();
            const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});
            let groups: Array<{ id: string; name?: string }> = [];
            if (groupIds.length > 0) {
              try {
                const infoResp = await api.getGroupInfo(groupIds);
                const gridInfoMap = infoResp?.gridInfoMap ?? {};
                groups = Object.entries(gridInfoMap).map(([id, info]: [string, any]) => ({
                  id,
                  name: info.name ?? undefined,
                }));
              } catch {
                groups = groupIds.map((id) => ({ id }));
              }
            }
            const matches = groups.filter(
              (g) => (g.name ?? "").toLowerCase().includes(trimmed.toLowerCase()),
            );
            const best =
              matches.find((g) => g.name?.toLowerCase() === trimmed.toLowerCase()) ?? matches[0];
            results.push({
              input,
              resolved: Boolean(best?.id),
              id: best?.id,
              name: best?.name,
              note: matches.length > 1 ? "multiple matches; chose first" : undefined,
            });
          }
        } catch (err) {
          runtime.error?.(`zaloclaw resolve failed: ${String(err)}`);
          results.push({ input, resolved: false, note: "lookup failed" });
        }
      }
      return results;
    },
  },
  pairing: {
    idLabel: "zaloClawUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(zaloclaw|oz):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const authenticated = await checkZaloClawAuthenticated();
      if (!authenticated) throw new Error("ZaloClaw not authenticated");
      await sendMessageZaloClaw(id, "Your pairing request has been approved.");
    },
  },
  auth: {
    login: async ({ cfg, accountId, runtime }) => {
      runtime.log(`Scan the QR code to link ZaloClaw (account: ${accountId ?? DEFAULT_ACCOUNT_ID}).`);
      let qrFilePath: string | null = null;
      try {
        await loginWithQR(async (event) => {
          if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
            try {
              qrFilePath = await displayQRFromPNG(event.data.image);
            } catch (err) {
              console.log(`Could not display QR: ${err instanceof Error ? err.message : String(err)}`);
            }
          } else if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
            runtime.log("QR code scanned. Please confirm on your phone.");
          }
        });
        runtime.log("Login successful!");
        if (qrFilePath) {
          try { fs.unlinkSync(qrFilePath); } catch {}
        }
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) => {
          rl.question("\nRestart gateway now? (Required for certificate to be recognized) [Y/n]: ", (ans) => {
            rl.close();
            resolve(ans);
          });
        });
        const shouldRestart = !answer || answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
        if (shouldRestart) {
          runtime.log("To apply the new certificate, run: openclaw gateway restart");
        } else {
          runtime.log("Skipped restart. Remember to run 'openclaw gateway restart' later.");
        }
      } catch (err) {
        if (qrFilePath) {
          try { fs.unlinkSync(qrFilePath); } catch {}
        }
        throw err;
      }
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => {
      if (!text) return [];
      if (limit <= 0 || text.length <= limit) return [text];
      const chunks: string[] = [];
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
    textChunkLimit: 2000,
    sendText: async ({ to, text, accountId, cfg }) => {
      const account = resolveZaloClawAccountSync({ cfg, accountId });
      const result = await sendMessageZaloClaw(to, text);
      return {
        channel: "zaloclaw",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      const account = resolveZaloClawAccountSync({ cfg, accountId });
      let options: any = {};
      if (mediaUrl && isLocalFilePath(mediaUrl) && fs.existsSync(mediaUrl)) {
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
        error: result.error ? new Error(result.error) : undefined,
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (_accounts) => collectZaloClawStatusIssues(),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account }) => probeZaloClaw(),
    buildAccountSnapshot: async ({ account, runtime }) => {
      const configured = hasStoredCredentials();
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: configured
          ? (runtime?.lastError ?? null)
          : (runtime?.lastError ?? "not authenticated"),
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        dmPolicy: account.config.dmPolicy ?? "open",
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      let userLabel = "";
      try {
        const userInfo = await getZaloClawUserInfo();
        if (userInfo?.displayName) userLabel = ` (${userInfo.displayName})`;
        ctx.setStatus({ accountId: account.accountId, profile: userInfo });
      } catch {}
      ctx.log?.info(`[${account.accountId}] starting zaloclaw provider${userLabel}`);
      const { monitorZaloClawProvider } = await import("./monitor.js");
      return monitorZaloClawProvider({
        account,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
    loginWithQrStart: async (params) => {
      try {
        let qrDataUrl: string | undefined;
        const loginPromise = loginWithQR((event) => {
          if (event.type === LoginQRCallbackEventType.QRCodeGenerated && event.data) {
            qrDataUrl = `data:image/png;base64,${event.data.image}`;
          }
        });
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (qrDataUrl) return { qrDataUrl, message: "Scan QR code with Zalo app" };
        await loginPromise;
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
      const { logout } = await import("../client/zalo-client.js");
      await logout();
      return { cleared: true, loggedOut: true, message: "Logged out and credentials cleared" };
    },
  },
};

export type { ResolvedZaloClawAccount };
