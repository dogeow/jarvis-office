import {
  MAX_NAME_LENGTH,
  MAX_DETAIL_LENGTH,
  MAX_JOIN_KEY_LENGTH,
  MAX_HISTORY_LIMIT,
  DEFAULT_HISTORY_LIMIT,
  OFFLINE_AFTER_SECONDS,
  MAIN_AGENT_TEMPLATE,
  VALID_STATES,
  STATE_ALIASES,
} from "./config.js";
import { loadJson, saveJson, nowIso } from "./db.js";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, "..");
const STATE_FILE = resolve(PROJECT_DIR, "state.json");
const AGENTS_STATE_FILE = resolve(PROJECT_DIR, "agents-state.json");
const HISTORY_FILE = resolve(PROJECT_DIR, "agents-history.json");
const JOIN_KEYS_FILE = resolve(PROJECT_DIR, "join-keys.json");

// --- Config helpers ---

// 标准化状态值，别名映射 + 合法校验
export function normalizeState(raw, { allowOffline = false } = {}) {
  let value = (raw || "").trim().toLowerCase();
  if (allowOffline && value === "offline") return "offline";
  value = STATE_ALIASES[value] || value;
  if (VALID_STATES.has(value)) return value;
  return "idle";
}

// 字符串长度校验，返回裁剪后值和错误信息
export function validateStr(value, maxLength, fieldName) {
  const trimmed = String(value || "").trim();
  if (trimmed.length > maxLength) {
    return { value: trimmed, error: `${fieldName} 不能超过 ${maxLength} 个字符` };
  }
  return { value: trimmed, error: null };
}

// --- CEO state ---

async function loadState() {
  const state = await loadJson(STATE_FILE, {
    state: "idle",
    detail: "待命中",
    updated_at: nowIso(),
  });
  return {
    state: normalizeState(state.state),
    detail: String(state.detail || ""),
    updated_at: String(state.updated_at || nowIso()),
  };
}

function buildMainAgent(state) {
  return { ...MAIN_AGENT_TEMPLATE, state: state.state, detail: state.detail, updated_at: state.updated_at };
}

// 设置 CEO 状态，写入 state.json 并同步 agents-state.json
export async function setMainState({ state, detail }) {
  const stateValue = normalizeState(state);
  const { value: detailVal, error } = validateStr(detail, MAX_DETAIL_LENGTH, "detail");
  if (error) return { error };

  const current = await loadState();
  const changed = current.state !== stateValue || current.detail !== detailVal;
  const updatedAt = changed ? nowIso() : current.updated_at;
  const nextState = { state: stateValue, detail: detailVal, updated_at: updatedAt };

  await saveJson(STATE_FILE, nextState);
  await saveAgents(await mergeMainAgent(await loadAgentsRaw(), nextState));

  return { nextState, changed, error: null };
}

// --- Guest agents ---

async function loadAgentsRaw() {
  return await loadJson(AGENTS_STATE_FILE, []);
}

function mergeMainAgent(agents, state) {
  const main = buildMainAgent(state);
  const merged = [];
  let foundMain = false;
  for (const agent of agents) {
    if (agent.isMain || (agent.name === "CEO" && agent.agentId === "ceo")) {
      merged.push({ ...main });
      foundMain = true;
    } else {
      merged.push({ ...agent });
    }
  }
  if (!foundMain) merged.unshift(main);
  return merged;
}

// 持久化 agents 到文件
export async function saveAgents(agents) {
  await saveJson(AGENTS_STATE_FILE, agents);
}

function agentAgeSeconds(agent) {
  const timestamp = agent.lastPushAt || agent.updated_at;
  if (!timestamp) return null;
  try {
    return (Date.now() - new Date(timestamp).getTime()) / 1000;
  } catch {
    return null;
  }
}

async function cleanupGuestAgents(agents) {
  let changed = false;
  for (const agent of agents) {
    if (agent.isMain) continue;
    const normalized = { ...agent };
    const age = agentAgeSeconds(normalized);
    if (age !== null && age > OFFLINE_AFTER_SECONDS) {
      if (normalized.state !== "offline" || normalized.authStatus !== "offline") {
        normalized.state = "offline";
        normalized.authStatus = "offline";
        changed = true;
      }
    }
  }
  return { cleaned: agents, changed };
}

// 获取所有 Agent（含 CEO 合并、超时清理、lastSeen 字段）
export async function getAllAgents() {
  const state = await loadState();
  let agents = await mergeMainAgent(await loadAgentsRaw(), state);
  const { cleaned, changed } = await cleanupGuestAgents(agents);
  if (changed) await saveAgents(cleaned);
  return cleaned.map((a) => ({ ...a, lastSeen: a.lastPushAt || a.updated_at }));
}

// 获取 CEO 状态（getAllAgents 的第一个元素）
export async function getMainState() {
  const agents = await getAllAgents();
  return agents[0] || {};
}

// 生成 SSE 签名，用于判断是否需要推送
export function payloadSignature(payload) {
  return JSON.stringify(payload, null, 0);
}

// 生成唯一 Agent ID
export function generateAgentId() {
  return `agent_${Date.now()}`;
}

// --- Join keys ---

async function loadJoinKeys() {
  return await loadJson(JOIN_KEYS_FILE, { keys: [] });
}

// 持久化 join keys 到文件
export async function saveJoinKeys(joinKeys) {
  await saveJson(JOIN_KEYS_FILE, joinKeys);
}

// 在 keys 列表中查找指定 key
export function findJoinKey(joinKeys, keyValue) {
  return joinKeys.keys.find((item) => item.key === keyValue) || null;
}

// 检查 join key 是否已过期
export function keyIsExpired(keyItem) {
  if (!keyItem.expiresAt) return false;
  try {
    return Date.now() > new Date(keyItem.expiresAt).getTime();
  } catch {
    return false;
  }
}

function countActiveAgentsForKey(agents, joinKey, excludeAgentId) {
  let active = 0;
  for (const agent of agents) {
    if (agent.isMain) continue;
    if (agent.joinKey !== joinKey) continue;
    if (excludeAgentId && agent.agentId === excludeAgentId) continue;
    const age = agentAgeSeconds(agent);
    if (age === null || age <= OFFLINE_AFTER_SECONDS) active++;
  }
  return active;
}

function allowsJoin(keyItem, existingAgentId = null) {
  if (keyIsExpired(keyItem)) return { allowed: false, error: "join key 已过期" };
  const reusable = keyItem.reusable !== false;
  const used = !!keyItem.used;
  const usedByAgentId = String(keyItem.usedByAgentId || "");
  if (!reusable && used && usedByAgentId && usedByAgentId !== (existingAgentId || "")) {
    return { allowed: false, error: "join key 已被占用" };
  }
  return { allowed: true, error: null };
}

// --- History ---

async function loadHistoryStore() {
  return await loadJson(HISTORY_FILE, {});
}

async function saveHistoryStore(store) {
  await saveJson(HISTORY_FILE, store);
}

// 记录一条历史（去重：相同 state + detail 不重复记录）
export async function recordHistory(name, state, detail, updatedAt) {
  const store = await loadHistoryStore();
  const entries = store[name] || [];
  if (entries.length > 0 && entries[0].state === state && entries[0].detail === detail) return;
  entries.unshift({ state, detail, updated_at: updatedAt });
  store[name] = entries.slice(0, MAX_HISTORY_LIMIT);
  await saveHistoryStore(store);
}

// 获取指定 Agent 的历史记录，支持 limit 参数
export async function getAgentHistory(name, rawLimit) {
  const store = await loadHistoryStore();
  const entries = store[name] || [];
  let limit = DEFAULT_HISTORY_LIMIT;
  if (rawLimit) {
    const parsed = parseInt(rawLimit, 10);
    if (!isNaN(parsed)) limit = Math.max(1, Math.min(parsed, MAX_HISTORY_LIMIT));
  }
  return entries.slice(0, limit);
}

// 为历史条目补充 duration 字段（上一条到当前条的时间差）
export function annotateHistory(entries) {
  return entries.map((entry, index) => {
    let duration = null;
    try {
      const current = new Date(entry.updated_at).getTime();
      const seconds =
        index + 1 < entries.length
          ? Math.max(0, (current - new Date(entries[index + 1].updated_at).getTime()) / 1000)
          : Math.max(0, (Date.now() - current) / 1000);
      if (seconds >= 3600) duration = `${Math.floor(seconds / 3600)}h`;
      else if (seconds >= 60) duration = `${Math.floor(seconds / 60)}m`;
      else duration = `${Math.floor(seconds)}s`;
    } catch {}
    return { ...entry, duration };
  });
}

// --- Join agent service ---

// Agent 加入：校验 key、检测重入、更新或创建 Agent 记录
export async function joinAgent({ name, joinKey, detail, state, source }) {
  const { value: nameVal, error: nameErr } = validateStr(name, MAX_NAME_LENGTH, "name");
  const { value: joinKeyVal, error: keyErr } = validateStr(joinKey, MAX_JOIN_KEY_LENGTH, "joinKey");
  const { value: detailVal, error: detailErr } = validateStr(detail, MAX_DETAIL_LENGTH, "detail");
  if (!nameVal || !joinKeyVal) return { error: "name 和 joinKey 必填", status: 400 };
  if (nameErr) return { error: nameErr, status: 400 };
  if (keyErr) return { error: keyErr, status: 400 };
  if (detailErr) return { error: detailErr, status: 400 };

  const stateValue = normalizeState(state);
  const joinKeys = await loadJoinKeys();
  const keyItem = findJoinKey(joinKeys, joinKeyVal);
  if (!keyItem) return { error: "join key 无效", status: 403 };

  const agents = await mergeMainAgent(await loadAgentsRaw());
  const existing = agents.find((item) => !item.isMain && item.name === nameVal) || null;
  const existingAgentId = existing ? String(existing.agentId) : null;

  const { allowed, error } = allowsJoin(keyItem, existingAgentId);
  if (!allowed) return { error, status: 403 };

  const activeCount = countActiveAgentsForKey(agents, joinKeyVal, existingAgentId);
  const maxConcurrent = parseInt(keyItem.maxConcurrent || 3, 10);
  if (activeCount >= maxConcurrent) return { error: `并发已达上限（${maxConcurrent}）`, status: 429 };

  const updatedAt = nowIso();
  let agent;
  if (existing) {
    existing.state = stateValue;
    existing.detail = detailVal;
    existing.authStatus = "approved";
    existing.lastPushAt = updatedAt;
    existing.updated_at = updatedAt;
    agent = existing;
  } else {
    agent = {
      agentId: generateAgentId(),
      name: nameVal,
      isMain: false,
      state: stateValue,
      detail: detailVal,
      updated_at: updatedAt,
      source: String(source || "remote"),
      joinKey: joinKeyVal,
      authStatus: "approved",
      authApprovedAt: updatedAt,
      authExpiresAt: null,
      lastPushAt: updatedAt,
    };
    agents.push(agent);
    await recordHistory(nameVal, stateValue, detailVal, updatedAt);
  }

  keyItem.used = true;
  keyItem.usedBy = nameVal;
  keyItem.usedByAgentId = agent.agentId;
  keyItem.usedAt = updatedAt;

  await saveJoinKeys(joinKeys);
  await saveAgents(agents);

  return { ok: true, agentId: agent.agentId, authStatus: "approved" };
}

// --- Agent push service ---

// Agent 状态推送：校验 key、更新已有 Agent 的状态
export async function pushAgent({ joinKey, name, agentId, detail, state }) {
  const joinKeyVal = String(joinKey || "").trim();
  const nameVal = String(name || "").trim();
  const agentIdVal = String(agentId || "").trim();

  const { value: detailVal, error } = validateStr(detail, MAX_DETAIL_LENGTH, "detail");
  if (!joinKeyVal) return { error: "joinKey 必填", status: 400 };
  if (error) return { error, status: 400 };

  const keyItem = findJoinKey(await loadJoinKeys(), joinKeyVal);
  if (!keyItem) return { error: "join key 无效", status: 403 };
  if (keyIsExpired(keyItem)) return { error: "join key 已过期", status: 403 };

  const agents = await mergeMainAgent(await loadAgentsRaw());
  const agent = agents.find(
    (item) =>
      !item.isMain &&
      ((agentIdVal && item.agentId === agentIdVal) || (nameVal && item.name === nameVal)),
  );

  if (!agent) return { error: "agent 不存在，请先 join", status: 404 };
  if (agent.joinKey !== joinKeyVal) return { error: "join key 不匹配", status: 403 };

  const updatedAt = nowIso();
  agent.state = normalizeState(state);
  agent.detail = detailVal;
  agent.authStatus = "approved";
  agent.lastPushAt = updatedAt;
  agent.updated_at = updatedAt;
  await recordHistory(agent.name, agent.state, detailVal, updatedAt);

  await saveAgents(agents);
  return { ok: true, agentId: agent.agentId, state: agent.state };
}

// --- Leave agent service ---

// Agent 离开：移除 Agent 并释放 join key
export async function leaveAgent({ agentId, name }) {
  const agentIdVal = String(agentId || "").trim();
  const nameVal = String(name || "").trim();
  if (!agentIdVal && !nameVal) return { error: "agentId 或 name 必填", status: 400 };

  const joinKeys = await loadJoinKeys();
  let agents = await mergeMainAgent(await loadAgentsRaw());
  const target = agents.find(
    (item) =>
      !item.isMain &&
      ((agentIdVal && item.agentId === agentIdVal) || (nameVal && item.name === nameVal)),
  );

  if (!target) return { error: "agent 不存在", status: 404 };

  agents = agents.filter((item) => item.agentId !== target.agentId);

  for (const keyItem of joinKeys.keys || []) {
    if (keyItem.usedByAgentId === target.agentId) {
      keyItem.used = false;
      keyItem.usedBy = null;
      keyItem.usedByAgentId = null;
      keyItem.usedAt = null;
      break;
    }
  }

  await saveJoinKeys(joinKeys);
  await saveAgents(agents);
  return { ok: true };
}
