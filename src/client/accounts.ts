import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/channel-plugin-common";
import type { ResolvedZaloClawAccount, ZaloClawAccountConfig, ZaloClawConfig } from "../runtime/types.js";
import { hasStoredCredentials } from "./zalo-client.js";

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = (cfg.channels?.['zaloclaw'] as ZaloClawConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}

export function listZaloClawAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultZaloClawAccountId(cfg: OpenClawConfig): string {
  const zaloClawConfig = cfg.channels?.['zaloclaw'] as ZaloClawConfig | undefined;
  if (zaloClawConfig?.defaultAccount?.trim()) return zaloClawConfig.defaultAccount.trim();
  const ids = listZaloClawAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): ZaloClawAccountConfig | undefined {
  const accounts = (cfg.channels?.['zaloclaw'] as ZaloClawConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  return accounts[accountId] as ZaloClawAccountConfig | undefined;
}

function mergeZaloClawAccountConfig(cfg: OpenClawConfig, accountId: string): ZaloClawAccountConfig {
  const raw = (cfg.channels?.['zaloclaw'] ?? {}) as ZaloClawConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export async function checkZaloClawAuthenticated(): Promise<boolean> {
  return hasStoredCredentials();
}

export async function resolveZaloClawAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): Promise<ResolvedZaloClawAccount> {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.['zaloclaw'] as ZaloClawConfig | undefined)?.enabled !== false;
  const merged = mergeZaloClawAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const authenticated = await checkZaloClawAuthenticated();
  return { accountId, name: merged.name?.trim() || undefined, enabled, authenticated, config: merged };
}

export function resolveZaloClawAccountSync(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedZaloClawAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.['zaloclaw'] as ZaloClawConfig | undefined)?.enabled !== false;
  const merged = mergeZaloClawAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  return { accountId, name: merged.name?.trim() || undefined, enabled, authenticated: false, config: merged };
}

export async function listEnabledZaloClawAccounts(
  cfg: OpenClawConfig,
): Promise<ResolvedZaloClawAccount[]> {
  const ids = listZaloClawAccountIds(cfg);
  const accounts = await Promise.all(
    ids.map((accountId) => resolveZaloClawAccount({ cfg, accountId })),
  );
  return accounts.filter((account) => account.enabled);
}

export async function getZaloClawUserInfo(): Promise<{ userId?: string; displayName?: string } | null> {
  try {
    const { getApi } = await import("./zalo-client.js");
    const api = await getApi();
    const raw = await api.fetchAccountInfo();
    const info = (raw as any)?.profile ?? raw;
    return info ? { userId: info.userId, displayName: info.displayName } : null;
  } catch {
    return null;
  }
}

export type { ResolvedZaloClawAccount } from "../runtime/types.js";
