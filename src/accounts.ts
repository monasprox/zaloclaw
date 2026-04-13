import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-plugin-common";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/channel-plugin-common";
import type { ResolvedOpclawZaloAccount, OpclawZaloAccountConfig, OpclawZaloConfig } from "./types.js";
import { hasStoredCredentials } from "./zalo-client.js";

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = (cfg.channels?.['opclaw-zalo'] as OpclawZaloConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}

export function listOpclawZaloAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultOpclawZaloAccountId(cfg: OpenClawConfig): string {
  const opclawZaloConfig = cfg.channels?.['opclaw-zalo'] as OpclawZaloConfig | undefined;
  if (opclawZaloConfig?.defaultAccount?.trim()) return opclawZaloConfig.defaultAccount.trim();
  const ids = listOpclawZaloAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): OpclawZaloAccountConfig | undefined {
  const accounts = (cfg.channels?.['opclaw-zalo'] as OpclawZaloConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  return accounts[accountId] as OpclawZaloAccountConfig | undefined;
}

function mergeOpclawZaloAccountConfig(cfg: OpenClawConfig, accountId: string): OpclawZaloAccountConfig {
  const raw = (cfg.channels?.['opclaw-zalo'] ?? {}) as OpclawZaloConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export async function checkOpclawZaloAuthenticated(): Promise<boolean> {
  return hasStoredCredentials();
}

export async function resolveOpclawZaloAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): Promise<ResolvedOpclawZaloAccount> {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.['opclaw-zalo'] as OpclawZaloConfig | undefined)?.enabled !== false;
  const merged = mergeOpclawZaloAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const authenticated = await checkOpclawZaloAuthenticated();
  return { accountId, name: merged.name?.trim() || undefined, enabled, authenticated, config: merged };
}

export function resolveOpclawZaloAccountSync(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedOpclawZaloAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.['opclaw-zalo'] as OpclawZaloConfig | undefined)?.enabled !== false;
  const merged = mergeOpclawZaloAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  return { accountId, name: merged.name?.trim() || undefined, enabled, authenticated: false, config: merged };
}

export async function listEnabledOpclawZaloAccounts(
  cfg: OpenClawConfig,
): Promise<ResolvedOpclawZaloAccount[]> {
  const ids = listOpclawZaloAccountIds(cfg);
  const accounts = await Promise.all(
    ids.map((accountId) => resolveOpclawZaloAccount({ cfg, accountId })),
  );
  return accounts.filter((account) => account.enabled);
}

export async function getOpclawZaloUserInfo(): Promise<{ userId?: string; displayName?: string } | null> {
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

export type { ResolvedOpclawZaloAccount } from "./types.js";
