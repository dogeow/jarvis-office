export type AgentState = "idle" | "writing" | "researching" | "executing" | "syncing" | "error" | "offline";

export interface Agent {
  agentId: string;
  name: string;
  isMain: boolean;
  state: AgentState;
  detail: string;
  updated_at: string;
  source: "local" | "remote";
  joinKey: string | null;
  authStatus: "approved" | "offline";
  authApprovedAt: string | null;
  authExpiresAt: string | null;
  lastPushAt: string | null;
  lastSeen?: string;
  area?: string;
  avatar?: string;
}

export interface StateData {
  state: string;
  detail: string;
  updated_at: string;
}

export interface HistoryEntry {
  state: string;
  detail: string;
  updated_at: string;
  duration?: string | null;
}

export interface JoinKeyItem {
  key: string;
  expiresAt?: string;
  reusable?: boolean;
  used?: boolean;
  usedBy?: string;
  usedByAgentId?: string;
  usedAt?: string;
  maxConcurrent?: number;
}

export interface JoinKeysData {
  keys: JoinKeyItem[];
}
