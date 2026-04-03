// 全局配置常量

// 允许的 Agent 状态值
export const VALID_STATES = new Set([
  "idle",
  "writing",
  "researching",
  "executing",
  "syncing",
  "error",
]);

// 状态别名映射（兼容多种写法）
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

// 各类长度限制和超时配置
export const MAX_HISTORY_LIMIT = 100;        // 历史记录最大条数
export const DEFAULT_HISTORY_LIMIT = 50;      // 默认返回条数
export const OFFLINE_AFTER_SECONDS = 300;     // 超过此时间无推送视为离线
export const MAX_NAME_LENGTH = 40;             // Agent 名称最大长度
export const MAX_DETAIL_LENGTH = 200;          // detail 最大长度
export const MAX_JOIN_KEY_LENGTH = 128;       // join key 最大长度

// CEO Agent 默认模板
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
