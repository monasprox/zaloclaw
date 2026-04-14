import type {
  ChannelSetupWizardAdapter,
  ChannelSetupDmPolicy,
} from "openclaw/plugin-sdk/setup";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { WizardPrompter } from "openclaw/plugin-sdk/setup";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
} from "openclaw/plugin-sdk/channel-plugin-common";
import {
  addWildcardAllowFrom,
  promptAccountId,
  promptChannelAccessConfig,
} from "openclaw/plugin-sdk/setup";
import * as fs from "fs";
import {
  listOpclawZaloAccountIds,
  resolveDefaultOpclawZaloAccountId,
  resolveOpclawZaloAccountSync,
  checkOpclawZaloAuthenticated,
} from "../client/accounts.js";
import { hasStoredCredentials, loginWithQR } from "../client/zalo-client.js";
import { LoginQRCallbackEventType } from "zca-js";
import { displayQRFromPNG } from "../client/qr-display.js";

const channel = "opclaw-zalo" as const;

function setOpclawZaloDmPolicy(
  cfg: OpenClawConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
): OpenClawConfig {
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(cfg.channels?.['opclaw-zalo']?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      'opclaw-zalo': {
        ...cfg.channels?.['opclaw-zalo'],
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  } as OpenClawConfig;
}

async function noteOpclawZaloHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "OpenClaw Zalo Account login via QR code.",
      "",
      "Prerequisites:",
      "1) zca-js library (bundled with plugin)",
      "2) You'll scan a QR code with your Zalo app",
      "",
      "No CLI binary needed - uses zca-js library directly.",
    ].join("\n"),
    "Zalo JS Setup",
  );
}

async function promptOpclawZaloAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<OpenClawConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveOpclawZaloAccountSync({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const parseInput = (raw: string) =>
    raw.split(/[\n,;]+/g).map((entry) => entry.trim()).filter(Boolean);

  const resolveUserId = async (input: string): Promise<string | null> => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return trimmed;
    try {
      const { getApi } = await import("../client/zalo-client.js");
      const api = await getApi();
      const friends = await api.getAllFriends();
      const friendList = Array.isArray(friends) ? friends : [];
      const match = friendList.find(
        (f: any) => (f.displayName ?? "").toLowerCase() === trimmed.toLowerCase(),
      );
      return match ? String(match.userId) : null;
    } catch {
      return null;
    }
  };

  while (true) {
    const entry = await prompter.text({
      message: "OpclawZalo allowFrom (username or user id)",
      placeholder: "Alice, 123456789",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
    });
    const parts = parseInput(String(entry));
    const results = await Promise.all(parts.map((part) => resolveUserId(part)));
    const unresolved = parts.filter((_, idx) => !results[idx]);
    if (unresolved.length > 0) {
      await prompter.note(
        `Could not resolve: ${unresolved.join(", ")}. Use numeric user ids or ensure you are logged in.`,
        "Zalo JS allowlist",
      );
      continue;
    }
    const merged = [
      ...existingAllowFrom.map((item) => String(item).trim()).filter(Boolean),
      ...(results.filter(Boolean) as string[]),
    ];
    const unique = [...new Set(merged)];
    if (accountId === DEFAULT_ACCOUNT_ID) {
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          'opclaw-zalo': {
            ...cfg.channels?.['opclaw-zalo'],
            enabled: true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      } as OpenClawConfig;
    }
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        'opclaw-zalo': {
          ...cfg.channels?.['opclaw-zalo'],
          enabled: true,
          accounts: {
            ...cfg.channels?.['opclaw-zalo']?.accounts,
            [accountId]: {
              ...cfg.channels?.['opclaw-zalo']?.accounts?.[accountId],
              enabled: cfg.channels?.['opclaw-zalo']?.accounts?.[accountId]?.enabled ?? true,
              dmPolicy: "allowlist",
              allowFrom: unique,
            },
          },
        },
      },
    } as OpenClawConfig;
  }
}

function setOpclawZaloGroupPolicy(
  cfg: OpenClawConfig,
  accountId: string,
  groupPolicy: "open" | "allowlist" | "disabled",
): OpenClawConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        'opclaw-zalo': { ...cfg.channels?.['opclaw-zalo'], enabled: true, groupPolicy },
      },
    } as OpenClawConfig;
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      'opclaw-zalo': {
        ...cfg.channels?.['opclaw-zalo'],
        enabled: true,
        accounts: {
          ...cfg.channels?.['opclaw-zalo']?.accounts,
          [accountId]: {
            ...cfg.channels?.['opclaw-zalo']?.accounts?.[accountId],
            enabled: cfg.channels?.['opclaw-zalo']?.accounts?.[accountId]?.enabled ?? true,
            groupPolicy,
          },
        },
      },
    },
  } as OpenClawConfig;
}

function setOpclawZaloGroupAllowlist(
  cfg: OpenClawConfig,
  accountId: string,
  groupKeys: string[],
): OpenClawConfig {
  const groups = Object.fromEntries(groupKeys.map((key) => [key, { allow: true }]));
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        'opclaw-zalo': { ...cfg.channels?.['opclaw-zalo'], enabled: true, groups },
      },
    } as OpenClawConfig;
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      'opclaw-zalo': {
        ...cfg.channels?.['opclaw-zalo'],
        enabled: true,
        accounts: {
          ...cfg.channels?.['opclaw-zalo']?.accounts,
          [accountId]: {
            ...cfg.channels?.['opclaw-zalo']?.accounts?.[accountId],
            enabled: cfg.channels?.['opclaw-zalo']?.accounts?.[accountId]?.enabled ?? true,
            groups,
          },
        },
      },
    },
  } as OpenClawConfig;
}

async function resolveOpclawZaloGroups(params: {
  cfg: OpenClawConfig;
  accountId: string;
  entries: string[];
}): Promise<Array<{ input: string; resolved: boolean; id?: string }>> {
  try {
    const { getApi } = await import("../client/zalo-client.js");
    const api = await getApi();
    const groupsResp = await api.getAllGroups();
    const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});
    let groups: Array<{ groupId: string; name: string }> = [];
    if (groupIds.length > 0) {
      try {
        const infoResp = await api.getGroupInfo(groupIds);
        const gridInfoMap = infoResp?.gridInfoMap ?? {};
        groups = Object.entries(gridInfoMap).map(([id, info]: [string, any]) => ({
          groupId: id,
          name: info.name ?? "",
        }));
      } catch {
        groups = [];
      }
    }
    const byName = new Map<string, typeof groups>();
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
      return match?.groupId
        ? { input, resolved: true, id: String(match.groupId) }
        : { input, resolved: false };
    });
  } catch {
    throw new Error("Not authenticated - cannot resolve groups");
  }
}

const dmPolicy: ChannelSetupDmPolicy = {
  label: "Zalo JS",
  channel,
  policyKey: "channels['opclaw-zalo'].dmPolicy",
  allowFromKey: "channels['opclaw-zalo'].allowFrom",
  getCurrent: (cfg, _accountId?) => (cfg.channels?.['opclaw-zalo']?.dmPolicy ?? "open") as "open",
  setPolicy: (cfg, policy, _accountId?) => setOpclawZaloDmPolicy(cfg, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id =
      accountId && normalizeAccountId(accountId)
        ? (normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID)
        : resolveDefaultOpclawZaloAccountId(cfg);
    return promptOpclawZaloAllowFrom({ cfg, prompter, accountId: id });
  },
};

async function performQrLogin(prompter: WizardPrompter): Promise<void> {
  let qrFilePath: string | null = null;
  try {
    await loginWithQR(async (event) => {
      if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
        try {
          qrFilePath = await displayQRFromPNG(event.data.image);
        } catch (err) {
          console.log(`Could not display QR: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
    await prompter.note("Login successful!", "Success");
    if (qrFilePath) {
      try { fs.unlinkSync(qrFilePath); } catch {}
    }
    const wantsRestart = await prompter.confirm({
      message: "Restart gateway now? (Required for certificate to be recognized)",
      initialValue: true,
    });
    if (wantsRestart) {
      await prompter.note("To apply the new certificate, run: openclaw gateway restart", "Gateway");
    }
  } catch (err) {
    await prompter.note(
      `Login failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      "Error",
    );
    if (qrFilePath) {
      try { fs.unlinkSync(qrFilePath); } catch {}
    }
  }
}

export const opclawZaloOnboardingAdapter: ChannelSetupWizardAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const configured = hasStoredCredentials();
    return {
      channel,
      configured,
      statusLines: [`Zalo JS: ${configured ? "logged in" : "needs QR login"}`],
      selectionHint: configured ? "recommended · logged in" : "recommended · QR login",
      quickstartScore: configured ? 1 : 15,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const opclawZaloOverride = accountOverrides['opclaw-zalo']?.trim();
    const defaultAccountId = resolveDefaultOpclawZaloAccountId(cfg);
    let accountId = opclawZaloOverride ? normalizeAccountId(opclawZaloOverride) : defaultAccountId;

    if (shouldPromptAccountIds && !opclawZaloOverride) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "Zalo JS",
        currentId: accountId,
        listAccountIds: listOpclawZaloAccountIds,
        defaultAccountId,
      });
    }

    let next = cfg;
    const alreadyAuthenticated = hasStoredCredentials();

    if (!alreadyAuthenticated) {
      await noteOpclawZaloHelp(prompter);
      const wantsLogin = await prompter.confirm({
        message: "Login via QR code now?",
        initialValue: true,
      });
      if (wantsLogin) {
        await prompter.note(
          "A QR code will be displayed below.\nScan it with your Zalo app to login.",
          "QR Login",
        );
        await performQrLogin(prompter);
      }
    } else {
      const keepSession = await prompter.confirm({
        message: "Zalo JS already logged in. Keep session?",
        initialValue: true,
      });
      if (!keepSession) {
        const { logout } = await import("../client/zalo-client.js");
        await logout();
        await prompter.note(
          "A QR code will be displayed below.\nScan it with your Zalo app to login.",
          "QR Login",
        );
        await performQrLogin(prompter);
      }
    }

    // FIX: Always ensure accounts.default entry exists (PR review issue #2)
    if (accountId === DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          'opclaw-zalo': {
            ...next.channels?.['opclaw-zalo'],
            enabled: true,
            accounts: {
              ...next.channels?.['opclaw-zalo']?.accounts,
              [DEFAULT_ACCOUNT_ID]: {
                ...next.channels?.['opclaw-zalo']?.accounts?.[DEFAULT_ACCOUNT_ID],
                enabled: true,
              },
            },
          },
        },
      } as OpenClawConfig;
    } else {
      next = {
        ...next,
        channels: {
          ...next.channels,
          'opclaw-zalo': {
            ...next.channels?.['opclaw-zalo'],
            enabled: true,
            accounts: {
              ...next.channels?.['opclaw-zalo']?.accounts,
              [accountId]: {
                ...next.channels?.['opclaw-zalo']?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      } as OpenClawConfig;
    }

    if (forceAllowFrom) {
      next = await promptOpclawZaloAllowFrom({ cfg: next, prompter, accountId });
    }

    const account = resolveOpclawZaloAccountSync({ cfg: next, accountId });
    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "Zalo groups",
      currentPolicy: account.config.groupPolicy ?? "open",
      currentEntries: Object.keys(account.config.groups ?? {}),
      placeholder: "Family, Work, 123456789",
      updatePrompt: Boolean(account.config.groups),
    });
    if (accessConfig) {
      if (accessConfig.policy !== "allowlist") {
        next = setOpclawZaloGroupPolicy(next, accountId, accessConfig.policy);
      } else {
        let keys = accessConfig.entries;
        if (accessConfig.entries.length > 0) {
          try {
            const resolved = await resolveOpclawZaloGroups({ cfg: next, accountId, entries: accessConfig.entries });
            const resolvedIds = resolved.filter((e) => e.resolved && e.id).map((e) => e.id as string);
            const unresolved = resolved.filter((e) => !e.resolved).map((e) => e.input);
            keys = [...resolvedIds, ...unresolved.map((e) => e.trim()).filter(Boolean)];
            if (resolvedIds.length > 0 || unresolved.length > 0) {
              await prompter.note(
                [
                  resolvedIds.length > 0 ? `Resolved: ${resolvedIds.join(", ")}` : undefined,
                  unresolved.length > 0 ? `Unresolved (kept as typed): ${unresolved.join(", ")}` : undefined,
                ].filter(Boolean).join("\n"),
                "Zalo groups",
              );
            }
          } catch (err) {
            await prompter.note(`Group lookup failed; keeping entries as typed. ${String(err)}`, "Zalo groups");
          }
        }
        next = setOpclawZaloGroupPolicy(next, accountId, "allowlist");
        next = setOpclawZaloGroupAllowlist(next, accountId, keys);
      }
    }

    return { cfg: next, accountId };
  },
};
