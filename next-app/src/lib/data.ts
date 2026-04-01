import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

export const PROJECT_DIR = "/root/.openclaw/workspace-ceo/jarvis-office";
export const STATE_FILE = path.join(PROJECT_DIR, "state.json");
export const AGENTS_STATE_FILE = path.join(PROJECT_DIR, "agents-state.json");
export const HISTORY_FILE = path.join(PROJECT_DIR, "agents-history.json");
export const JOIN_KEYS_FILE = path.join(PROJECT_DIR, "join-keys.json");

const VALID_STATES = new Set(["idle", "writing", "researching", "executing", "syncing", "error"]);

const STATE_ALIASES: Record<string, string> = {
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

const MAX_HISTORY_LIMIT = 100;
const DEFAULT_HISTORY_LIMIT = 50;
const OFFLINE_AFTER_SECONDS = 300;

const MAIN_AGENT_TEMPLATE = {
  agentId: "ceo",
  name: "CEO",
  isMain: true,
  state: "idle",
  detail: "待命中",
  updated_at: new Date().toISOString(),
  source: "local" as const,
  joinKey: null,
  authStatus: "approved" as const,
  authApprovedAt: null,
  authExpiresAt: null,
  lastPushAt: null,
};

export function nowISO(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

export function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export async function loadJSON<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    if (existsSync(filePath)) {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // ignore
  }
  return deepCopy(defaultValue);
}

export async function saveJSON(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

export function normalizeState(raw: string | null | undefined, allowOffline = false): string {
  const value = (raw || "").trim().toLowerCase();
  if (allowOffline && value === "offline") return "offline";
  const mapped = STATE_ALIASES[value] ?? value;
  if (VALID_STATES.has(mapped)) return mapped;
  return "idle";
}

export async function loadState(): Promise<{ state: string; detail: string; updated_at: string }> {
  const state = await loadJSON<{ state?: string; detail?: string; updated_at?: string }>(STATE_FILE, {
    state: "idle",
    detail: "待命中",
    updated_at: nowISO(),
  });
  return {
    state: normalizeState(state.state),
    detail: String(state.detail || ""),
    updated_at: String(state.updated_at || nowISO()),
  };
}

function buildMainAgent(state?: { state: string; detail: string; updated_at: string }) {
  const agent = deepCopy(MAIN_AGENT_TEMPLATE);
  if (state) {
    agent.state = state.state;
    agent.detail = state.detail;
    agent.updated_at = state.updated_at;
  }
  return agent;
}

export async function loadAgentsRaw(): Promise<unknown[]> {
  return loadJSON<unknown[]>(AGENTS_STATE_FILE, []);
}

export function mergeMainAgent(
  agents: unknown[],
  state?: { state: string; detail: string; updated_at: string }
): unknown[] {
  const main = buildMainAgent(state);
  const merged: unknown[] = [];
  let foundMain = false;

  for (const agent of agents) {
    const a = agent as Record<string, unknown>;
    if (a.isMain || (a.name === "CEO" && a.agentId === "ceo")) {
      merged.push(main);
      foundMain = true;
    } else {
      merged.push(agent);
    }
  }

  if (!foundMain) {
    merged.unshift(main);
  }
  return merged;
}

export async function saveAgents(agents: unknown[]): Promise<void> {
  await saveJSON(AGENTS_STATE_FILE, agents);
}

function agentAgeSeconds(agent: Record<string, unknown>): number | null {
  const timestamp = (agent.lastPushAt as string | null) || (agent.updated_at as string | null);
  if (!timestamp) return null;
  try {
    return (Date.now() - new Date(timestamp).getTime()) / 1000;
  } catch {
    return null;
  }
}

async function cleanupGuestAgents(agents: unknown[]): Promise<{ agents: unknown[]; changed: boolean }> {
  let changed = false;
  const cleaned: unknown[] = [];

  for (const agent of agents) {
    const a = agent as Record<string, unknown>;
    if (a.isMain) {
      cleaned.push(agent);
      continue;
    }

    const normalized = deepCopy(agent) as Record<string, unknown>;
    const age = agentAgeSeconds(normalized);
    if (age !== null && age > OFFLINE_AFTER_SECONDS) {
      if (normalized.state !== "offline" || normalized.authStatus !== "offline") {
        normalized.state = "offline";
        normalized.authStatus = "offline";
        changed = true;
      }
    }
    cleaned.push(normalized);
  }

  return { agents: cleaned, changed };
}

export async function loadAgents(): Promise<Record<string, unknown>[]> {
  const state = await loadState();
  let agents = (await loadAgentsRaw()) as Record<string, unknown>[];
  agents = mergeMainAgent(agents, state) as Record<string, unknown>[];
  const { agents: cleaned, changed } = await cleanupGuestAgents(agents);
  if (changed) {
    await saveAgents(cleaned);
  }
  return cleaned as Record<string, unknown>[];
}

export async function loadHistoryStore(): Promise<Record<string, unknown[]>> {
  return loadJSON<Record<string, unknown[]>>(HISTORY_FILE, {});
}

export async function saveHistoryStore(store: Record<string, unknown[]>): Promise<void> {
  await saveJSON(HISTORY_FILE, store);
}

export async function recordHistory(
  name: string,
  state: string,
  detail: string,
  updatedAt?: string
): Promise<void> {
  const timestamp = updatedAt || nowISO();
  const store = await loadHistoryStore();
  const entries = [...(store[name] || [])] as { state: string; detail: string; updated_at: string }[];

  if (entries.length > 0 && entries[0].state === state && entries[0].detail === detail) {
    return;
  }

  entries.unshift({ state, detail, updated_at: timestamp });
  store[name] = entries.slice(0, MAX_HISTORY_LIMIT);
  await saveHistoryStore(store);
}

export async function getHistory(name: string): Promise<unknown[]> {
  const store = await loadHistoryStore();
  return (store[name] || []) as unknown[];
}

export function annotateHistory(
  entries: { updated_at: string; state: string; detail: string }[]
): { updated_at: string; state: string; detail: string; duration: string | null }[] {
  return entries.map((entry, index) => {
    let duration: string | null = null;
    try {
      const current = new Date(entry.updated_at);
      if (index + 1 < entries.length) {
        const previous = new Date(entries[index + 1].updated_at);
        const seconds = Math.max(0, Math.floor((current.getTime() - previous.getTime()) / 1000));
        if (seconds >= 3600) {
          duration = `${Math.floor(seconds / 3600)}h`;
        } else if (seconds >= 60) {
          duration = `${Math.floor(seconds / 60)}m`;
        } else {
          duration = `${seconds}s`;
        }
      } else {
        const seconds = Math.max(0, Math.floor((Date.now() - current.getTime()) / 1000));
        if (seconds >= 3600) {
          duration = `${Math.floor(seconds / 3600)}h`;
        } else if (seconds >= 60) {
          duration = `${Math.floor(seconds / 60)}m`;
        } else {
          duration = `${seconds}s`;
        }
      }
    } catch {
      duration = null;
    }
    return { ...entry, duration };
  });
}

export async function loadJoinKeys(): Promise<{ keys: unknown[] }> {
  return loadJSON<{ keys: unknown[] }>(JOIN_KEYS_FILE, { keys: [] });
}

export async function findJoinKey(keyValue: string): Promise<Record<string, unknown> | null> {
  const data = await loadJoinKeys();
  const keys = data.keys as Record<string, unknown>[];
  return keys.find((k) => k.key === keyValue) || null;
}

export function keyIsExpired(keyItem: Record<string, unknown>): boolean {
  const expiresAt = keyItem.expiresAt as string | null;
  if (!expiresAt) return false;
  try {
    return new Date() > new Date(expiresAt);
  } catch {
    return false;
  }
}

export function countActiveAgentsForKey(
  agents: Record<string, unknown>[],
  joinKey: string,
  excludeAgentId?: string
): number {
  let active = 0;
  for (const agent of agents) {
    if (agent.isMain) continue;
    if (agent.joinKey !== joinKey) continue;
    if (excludeAgentId && agent.agentId === excludeAgentId) continue;
    const age = agentAgeSeconds(agent);
    if (age === null || age <= OFFLINE_AFTER_SECONDS) {
      active++;
    }
  }
  return active;
}

export function keyAllowsJoin(
  keyItem: Record<string, unknown>,
  existingAgentId?: string
): { allowed: boolean; error?: string } {
  if (keyIsExpired(keyItem)) {
    return { allowed: false, error: "join key 已过期" };
  }

  const reusable = keyItem.reusable !== false;
  const used = keyItem.used === true;
  const usedByAgentId = String(keyItem.usedByAgentId || "");

  if (!reusable && used && usedByAgentId && usedByAgentId !== (existingAgentId || "")) {
    return { allowed: false, error: "join key 已被占用" };
  }

  return { allowed: true };
}

export function generateAgentId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function payloadAgents(agents: Record<string, unknown>[]): Record<string, unknown>[] {
  return agents.map((agent) => {
    const item = { ...agent };
    item.lastSeen = (agent.lastPushAt as string | null) || (agent.updated_at as string | null);
    return item;
  });
}

export function payloadSignature(payload: Record<string, unknown>[]): string {
  return JSON.stringify(payload, null, 0);
}

export async function updateMainAgent(
  stateValue: string,
  detail: string
): Promise<{ state: string; detail: string; updated_at: string }> {
  const current = await loadState();
  const changed = current.state !== stateValue || current.detail !== detail;
  const updatedAt = changed ? nowISO() : current.updated_at;
  const nextState = { state: stateValue, detail, updated_at: updatedAt };

  const agents = mergeMainAgent(await loadAgentsRaw(), nextState);
  await saveAgents(agents);
  await saveJSON(STATE_FILE, nextState);

  if (changed) {
    await recordHistory("CEO", stateValue, detail, updatedAt);
  }

  return nextState;
}

export async function updateGuest(
  agent: Record<string, unknown>,
  stateValue: string,
  detail: string
): Promise<Record<string, unknown>> {
  const changed =
    agent.state !== stateValue || agent.detail !== detail || agent.authStatus !== "approved";
  if (changed) {
    agent.updated_at = nowISO();
    await recordHistory(String(agent.name || ""), stateValue, detail, String(agent.updated_at));
  }
  agent.state = stateValue;
  agent.detail = detail;
  agent.authStatus = "approved";
  agent.lastPushAt = nowISO();
  return agent;
}

export { MAX_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT };
