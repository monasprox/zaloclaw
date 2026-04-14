import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OpclawZaloConfig } from "../runtime/types.js";

const DEFAULT_CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");

export type OpenClawConfig = {
  channels?: {
    "opclaw-zalo"?: OpclawZaloConfig;
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

export function getOpclawZaloConfig(config: OpenClawConfig): OpclawZaloConfig {
  return config.channels?.["opclaw-zalo"] ?? {};
}

export function updateOpclawZaloConfig(
  config: OpenClawConfig,
  updates: Partial<OpclawZaloConfig>,
): OpenClawConfig {
  return {
    ...config,
    channels: {
      ...config.channels,
      "opclaw-zalo": {
        ...getOpclawZaloConfig(config),
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
  const zpConfig = getOpclawZaloConfig(config);
  const denyFrom = addToArray(zpConfig.denyFrom, userId);
  return updateOpclawZaloConfig(config, { denyFrom });
}

export function removeFromDenyFrom(config: OpenClawConfig, userId: string): OpenClawConfig {
  const zpConfig = getOpclawZaloConfig(config);
  const denyFrom = removeFromArray(zpConfig.denyFrom, userId);
  return updateOpclawZaloConfig(config, { denyFrom });
}

export function addToGroupDenyUsers(
  config: OpenClawConfig,
  groupId: string,
  userId: string,
): OpenClawConfig {
  const zpConfig = getOpclawZaloConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId] ?? {};
  const denyUsers = addToArray(groupConfig.denyUsers, userId);
  return updateOpclawZaloConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, denyUsers } },
  });
}

export function removeFromGroupDenyUsers(
  config: OpenClawConfig,
  groupId: string,
  userId: string,
): OpenClawConfig {
  const zpConfig = getOpclawZaloConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId];
  if (!groupConfig) return config;
  const denyUsers = removeFromArray(groupConfig.denyUsers, userId);
  return updateOpclawZaloConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, denyUsers } },
  });
}

export function listBlockedUsers(config: OpenClawConfig): Array<string | number> {
  return getOpclawZaloConfig(config).denyFrom ?? [];
}

export function listAllowedUsers(config: OpenClawConfig): Array<string | number> {
  return getOpclawZaloConfig(config).allowFrom ?? [];
}

export function addToGroupAllowUsers(
  config: OpenClawConfig,
  groupId: string,
  userId: string,
): OpenClawConfig {
  const zpConfig = getOpclawZaloConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId] ?? {};
  const allowUsers = addToArray(groupConfig.allowUsers, userId);
  return updateOpclawZaloConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, allowUsers } },
  });
}

export function removeFromGroupAllowUsers(
  config: OpenClawConfig,
  groupId: string,
  userId: string,
): OpenClawConfig {
  const zpConfig = getOpclawZaloConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId];
  if (!groupConfig) return config;
  const allowUsers = removeFromArray(groupConfig.allowUsers, userId);
  return updateOpclawZaloConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, allowUsers } },
  });
}

export function listAllowedUsersInGroup(config: OpenClawConfig, groupId: string): Array<string | number> {
  return getOpclawZaloConfig(config).groups?.[groupId]?.allowUsers ?? [];
}

export function listBlockedUsersInGroup(config: OpenClawConfig, groupId: string): Array<string | number> {
  return getOpclawZaloConfig(config).groups?.[groupId]?.denyUsers ?? [];
}

export function setGroupRequireMention(
  config: OpenClawConfig,
  groupId: string,
  requireMention: boolean,
): OpenClawConfig {
  const zpConfig = getOpclawZaloConfig(config);
  const groups = zpConfig.groups ?? {};
  const groupConfig = groups[groupId] ?? {};
  return updateOpclawZaloConfig(config, {
    groups: { ...groups, [groupId]: { ...groupConfig, requireMention } },
  });
}

export function getGroupRequireMention(
  config: OpenClawConfig,
  groupId: string,
): boolean | undefined {
  const zpConfig = getOpclawZaloConfig(config);
  const groups = zpConfig.groups ?? {};
  const direct = groups[groupId];
  if (direct && typeof direct.requireMention === "boolean") return direct.requireMention;
  const wildcard = groups["*"];
  if (wildcard && typeof wildcard.requireMention === "boolean") return wildcard.requireMention;
  return undefined;
}
