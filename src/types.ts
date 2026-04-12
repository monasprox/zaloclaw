export type ZaloPersonalAccountConfig = {
  enabled?: boolean;
  name?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: Array<string | number>;
  denyFrom?: Array<string | number>;
  groupPolicy?: "open" | "allowlist" | "disabled";
  groups?: Record<
    string,
    {
      allow?: boolean;
      enabled?: boolean;
      requireMention?: boolean;
      allowUsers?: Array<string | number>;
      denyUsers?: Array<string | number>;
      tools?: { allow?: string[]; deny?: string[] };
    }
  >;
  messagePrefix?: string;
  responsePrefix?: string;
};

export type ZaloPersonalConfig = {
  enabled?: boolean;
  name?: string;
  defaultAccount?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: Array<string | number>;
  denyFrom?: Array<string | number>;
  groupPolicy?: "open" | "allowlist" | "disabled";
  groups?: Record<
    string,
    {
      allow?: boolean;
      enabled?: boolean;
      requireMention?: boolean;
      allowUsers?: Array<string | number>;
      denyUsers?: Array<string | number>;
      tools?: { allow?: string[]; deny?: string[] };
    }
  >;
  messagePrefix?: string;
  responsePrefix?: string;
  accounts?: Record<string, ZaloPersonalAccountConfig>;
};

export type ResolvedZaloPersonalAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  authenticated: boolean;
  config: ZaloPersonalAccountConfig;
};

export type ZaloPersonalUserInfo = {
  userId: string;
  displayName: string;
  avatar?: string;
};

export type ZaloPersonalFriend = {
  userId: string;
  displayName: string;
  avatar?: string;
};

export type ZaloPersonalGroup = {
  groupId: string;
  name: string;
  memberCount?: number;
};

export type ZaloPersonalMessage = {
  threadId: string;
  msgId?: string;
  cliMsgId?: string;
  type: number;
  content: string;
  mediaUrls?: string[];
  mediaTypes?: string[];
  mentions?: Array<{ uid: string; pos: number; len: number; type: 0 | 1 }>;
  timestamp: number;
  metadata?: {
    isGroup: boolean;
    groupId?: string;
    senderName?: string;
    fromId?: string;
  };
};
