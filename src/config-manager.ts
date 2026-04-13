import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ZaloPersonalConfig } from "./types.js";

const DEFAULT_CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");

export type OpenClawConfig = {
  channels?: {
    "opclaw-zalo"?: ZaloPersonalConfig;
    [key: string]: any;
  };
  [key: string]: any;
};

export function readOpenClawConfig(configPath = DEFAULT_CONFIG_PATH): OpenClawConfig {
  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to read config: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function writeOpenClawConfig(config: OpenClawConfig, configPath = DEFAULT_CONFIG_PATH): void {
  try {
    const content = JSON.stringify(config, null, 2);
    writeFileSync(configPath, content, "utf-8");
  } catch (err) {
    throw new Error(`Failed to write config: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function getZaloPersonalConfig(config: OpenClawConfig): ZaloPersonalConfig {
  return config.channels?.["opclaw-zalo"] ?? {};
}

export function updateZaloPersonalConfig(
  config: OpenClawConfig,
  updates: Partial<ZaloPersonalConfig>,
): OpenClawConfig {
  return {
    ...config,
    channels: {
      ...config.channels,
      "opclaw-zalo": {
        ...getZaloPersonalConfig(config),
        ...updates,
      },
    },
  };
}

function addToArray<T>(arr: T[] | undefined, entry: T): T[] {
  const existing = arr ?? [];
  if (existing.includes(entry)) return existing;
  return [...existing, entry];
}

function removeFromArray<T>(arr: T[] | undefined, entry: T): T[] {
  const existing = arr ?? [];
  return existing.filter((item) => item !== entry);
}

export function addToDenyFrom(config: OpenClawConfig, userId: string): OpenClawConfig {
  const zpConfig = getZaloPersonalConfig(config);
  const denyFrom = addToArray(zpConfig.denyFrom, userId);
  return updateZaloPersonalConfig(config, { denyFrom });
}

export function removeFromDenyFrom(config: OpenClawConfig, userId: string): OpenClawConfig {
  const zpConfig = getZaloPersonalConfig(config);
  const denyFrom = removeFromArray(zpConfig.denyFrom, userId);
  return updateZaloPersonalConfig(config, { denyFrom });
}

export function addToGroupDenyUsers(
  config: OpenClawConfig,
  groupId: string,
  userId: string,
): OpenClawConfig {
  const zpConfig = getZaloPersonalConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId] ?? {};
  const denyUsers = addToArray(groupConfig.denyUsers, userId);
  return updateZaloPersonalConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, denyUsers } },
  });
}

export function removeFromGroupDenyUsers(
  config: OpenClawConfig,
  groupId: string,
  userId: string,
): OpenClawConfig {
  const zpConfig = getZaloPersonalConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId];
  if (!groupConfig) return config;
  const denyUsers = removeFromArray(groupConfig.denyUsers, userId);
  return updateZaloPersonalConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, denyUsers } },
  });
}

export function listBlockedUsers(config: OpenClawConfig): Array<string | number> {
  return getZaloPersonalConfig(config).denyFrom ?? [];
}

export function listAllowedUsers(config: OpenClawConfig): Array<string | number> {
  return getZaloPersonalConfig(config).allowFrom ?? [];
}

export function addToGroupAllowUsers(
  config: OpenClawConfig,
  groupId: string,
  userId: string,
): OpenClawConfig {
  const zpConfig = getZaloPersonalConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId] ?? {};
  const allowUsers = addToArray(groupConfig.allowUsers, userId);
  return updateZaloPersonalConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, allowUsers } },
  });
}

export function removeFromGroupAllowUsers(
  config: OpenClawConfig,
  groupId: string,
  userId: string,
): OpenClawConfig {
  const zpConfig = getZaloPersonalConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId];
  if (!groupConfig) return config;
  const allowUsers = removeFromArray(groupConfig.allowUsers, userId);
  return updateZaloPersonalConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, allowUsers } },
  });
}

export function listAllowedUsersInGroup(config: OpenClawConfig, groupId: string): Array<string | number> {
  return getZaloPersonalConfig(config).groups?.[groupId]?.allowUsers ?? [];
}

export function listBlockedUsersInGroup(config: OpenClawConfig, groupId: string): Array<string | number> {
  return getZaloPersonalConfig(config).groups?.[groupId]?.denyUsers ?? [];
}

export function setGroupRequireMention(
  config: OpenClawConfig,
  groupId: string,
  requireMention: boolean,
): OpenClawConfig {
  const zpConfig = getZaloPersonalConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId] ?? {};
  return updateZaloPersonalConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, requireMention } },
  });
}

export function getGroupRequireMention(
  config: OpenClawConfig,
  groupId: string,
): boolean | undefined {
  const zpConfig = getZaloPersonalConfig(config);
  const groups = zpConfig.groups ?? {};
  const direct = groups[groupId];
  if (direct && typeof direct.requireMention === "boolean") return direct.requireMention;
  const wildcard = groups["*"];
  if (wildcard && typeof wildcard.requireMention === "boolean") return wildcard.requireMention;
  return undefined;
}
