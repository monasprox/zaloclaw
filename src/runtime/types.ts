export type OpclawZaloAccountConfig = {
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

export type OpclawZaloConfig = {
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
  accounts?: Record<string, OpclawZaloAccountConfig>;
};

export type ResolvedOpclawZaloAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  authenticated: boolean;
  config: OpclawZaloAccountConfig;
};

export type OpclawZaloUserInfo = {
  userId: string;
  displayName: string;
  avatar?: string;
};

export type OpclawZaloFriend = {
  userId: string;
  displayName: string;
  avatar?: string;
};

export type OpclawZaloGroup = {
  groupId: string;
  name: string;
  memberCount?: number;
};

export type OpclawZaloMessage = {
  threadId: string;
  msgId?: string;
  cliMsgId?: string;
  type: number;
  content: string;
  mediaUrls?: string[];
  mediaTypes?: string[];
  mentions?: Array<{ uid: string; pos: number; len: number; type: 0 | 1 }>;
  timestamp: number;
  quote?: {
    msg?: string;
    fromId?: string;
    fromName?: string;
    msgId?: string;
    ts?: number;
  };
  metadata?: {
    isGroup: boolean;
    groupId?: string;
    senderName?: string;
    fromId?: string;
  };
};
