// Constants
export const VALID_STATES = new Set([
  "idle",
  "writing",
  "researching",
  "executing",
  "syncing",
  "error",
]);

export const STATE_ALIASES = {
  working: "writing",
  busy: "writing",
  write: "writing",
  research: "researching",
  search: "researching",
  run: "executing",
  running: "executing",
  execute: "executing",
  exec: "executing",
  sync: "syncing",
};

export const MAX_HISTORY_LIMIT = 100;
export const DEFAULT_HISTORY_LIMIT = 50;
export const OFFLINE_AFTER_SECONDS = 300;
export const MAX_NAME_LENGTH = 40;
export const MAX_DETAIL_LENGTH = 200;
export const MAX_JOIN_KEY_LENGTH = 128;

export const MAIN_AGENT_TEMPLATE = {
  agentId: "ceo",
  name: "CEO",
  isMain: true,
  state: "idle",
  detail: "待命中",
  updated_at: "2026-01-01T00:00:00",
  source: "local",
  joinKey: null,
  authStatus: "approved",
  authApprovedAt: null,
  authExpiresAt: null,
  lastPushAt: null,
};
