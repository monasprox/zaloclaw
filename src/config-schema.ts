/**
 * OpenClaw Zalo channel config schema — built on OpenClaw SDK primitives (Zod 4).
 *
 * Mirrors the Telegram channel's pattern: per-account config with DM/group
 * policies, access lists, markdown rendering, and per-group tool policies.
 *
 * Uses SDK-provided schemas (AllowFromListSchema, DmPolicySchema, etc.) so
 * the control UI can render proper form fields via toJSONSchema().
 */
import {
  AllowFromListSchema,
  buildCatchallMultiAccountChannelSchema,
  buildChannelConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
} from "openclaw/plugin-sdk/channel-config-primitives";
import { ToolPolicySchema } from "openclaw/plugin-sdk/agent-config-primitives";
import { z } from "zod";

// --- Per-group settings (same shape Telegram uses for its groups record) ---

const ZaloGroupConfigSchema = z.object({
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
  tools: ToolPolicySchema,
});

// --- Per-account config ---

const OpclawZaloAccountSchema = z.object({
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
});

// --- Full channel schema (account + multi-account) ---

/** The top-level OpenClaw Zalo config Zod schema (Zod 4, has toJSONSchema). */
export const OpclawZaloConfigSchema =
  buildCatchallMultiAccountChannelSchema(OpclawZaloAccountSchema);

// --- UI-aware config schema for the control panel ---

/** Pre-built config schema with uiHints for the OpenClaw control UI. */
export const OpclawZaloChannelConfigSchema = buildChannelConfigSchema(
  OpclawZaloConfigSchema,
  {
    uiHints: {
      "": {
        label: "OpenClaw Zalo",
        help: "Channel status and configuration.",
      },
      dmPolicy: {
        label: "DM Policy",
        help:
          'Controls who can message the bot in DMs. "pairing" requires a code exchange, ' +
          '"allowlist" only allows entries in allowFrom, "open" accepts all, "disabled" blocks DMs.',
      },
      groupPolicy: {
        label: "Group Policy",
        help:
          'Controls which groups the bot responds in. "open" = all groups, ' +
          '"allowlist" = only groups listed under groups, "disabled" = ignore all groups.',
      },
      allowFrom: {
        label: "Allow From",
        help: "Users allowed to interact in DMs. Use Zalo user IDs or display names. Wildcard: *",
      },
      denyFrom: {
        label: "Deny From",
        help: "Users denied from interacting. Checked before allowFrom.",
      },
      "markdown.tables": {
        label: "Markdown Tables",
        help: 'How to render markdown tables: "code" = code block, "bullets" = bullet list, "off" = strip.',
      },
      messagePrefix: {
        label: "Message Prefix",
        help: "Text prepended to every outbound message (e.g. bot name tag).",
      },
      responsePrefix: {
        label: "Response Prefix",
        help: "Text prepended to agent responses.",
      },
      groups: {
        label: "Groups",
        help: "Per-group overrides. Key = group ID, name, or * for default.",
      },
      "groups.*.requireMention": {
        label: "Require @Mention",
        help: "If true, bot only responds when @mentioned in this group.",
      },
      "groups.*.allowUsers": {
        label: "Group Allow Users",
        help: "Only these users can trigger the bot in this group.",
      },
      "groups.*.denyUsers": {
        label: "Group Deny Users",
        help: "Block specific users in this group.",
      },
      "groups.*.tools": {
        label: "Group Tool Policy",
        help: "Override tool execution permissions for this group.",
      },
    },
  },
);
