import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "jarvis-office-"));
process.env.JARVIS_OFFICE_DATA_DIR = dataDir;

const {
  joinAgent,
  pushAgent,
  leaveAgent,
  getAllAgents,
  getMainState,
} = await import(new URL("../agents.js", import.meta.url));

function isoAt(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-") + `T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

async function writeJson(filename, value) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, filename), JSON.stringify(value, null, 2), "utf-8");
}

async function readJson(filename) {
  return JSON.parse(await readFile(join(dataDir, filename), "utf-8"));
}

async function resetDataDir() {
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });
}

test.beforeEach(async () => {
  await resetDataDir();
});

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

test("join/push/leave lifecycle keeps state and keys consistent", async () => {
  await writeJson("join-keys.json", {
    keys: [{ key: "alpha", used: false, reusable: true, maxConcurrent: 3 }],
  });

  const joined = await joinAgent({
    name: "Fullstack Dev",
    joinKey: "alpha",
    detail: "刚刚加入",
    state: "idle",
  });
  assert.equal(joined.ok, true);
  assert.match(joined.agentId, /^agent_/);

  const pushed = await pushAgent({
    agentId: joined.agentId,
    name: "Fullstack Dev",
    joinKey: "alpha",
    detail: "正在修复 join 链路",
    state: "writing",
  });
  assert.deepEqual(
    { ok: pushed.ok, agentId: pushed.agentId, state: pushed.state },
    { ok: true, agentId: joined.agentId, state: "writing" },
  );

  const beforeLeaveAgents = await readJson("agents-state.json");
  const guest = beforeLeaveAgents.find((agent) => agent.name === "Fullstack Dev");
  assert.equal(guest.state, "writing");
  assert.equal(guest.joinKey, "alpha");

  const history = await readJson("agents-history.json");
  assert.equal(history["Fullstack Dev"].length, 2);
  assert.equal(history["Fullstack Dev"][0].detail, "正在修复 join 链路");

  const left = await leaveAgent({ agentId: joined.agentId });
  assert.deepEqual(left, { ok: true });

  const joinKeys = await readJson("join-keys.json");
  assert.equal(joinKeys.keys[0].used, false);
  assert.equal(joinKeys.keys[0].usedByAgentId, null);

  const afterLeaveAgents = await readJson("agents-state.json");
  assert.equal(afterLeaveAgents.some((agent) => agent.name === "Fullstack Dev"), false);
  assert.equal(afterLeaveAgents[0].name, "CEO");
});

test("getAllAgents marks stale guests offline and persists the cleanup", async () => {
  const staleAt = isoAt(new Date(Date.now() - 10 * 60 * 1000));

  await writeJson("state.json", {
    state: "idle",
    detail: "待命中",
    updated_at: isoAt(new Date()),
  });
  await writeJson("agents-state.json", [
    {
      agentId: "agent_stale",
      name: "QA Engineer",
      isMain: false,
      state: "writing",
      detail: "长时间未汇报",
      updated_at: staleAt,
      source: "remote",
      joinKey: "alpha",
      authStatus: "approved",
      authApprovedAt: staleAt,
      authExpiresAt: null,
      lastPushAt: staleAt,
    },
  ]);

  const agents = await getAllAgents();
  const guest = agents.find((agent) => agent.name === "QA Engineer");

  assert.equal(guest.state, "offline");
  assert.equal(guest.authStatus, "offline");
  assert.equal(guest.lastSeen, staleAt);

  const persisted = await readJson("agents-state.json");
  assert.equal(persisted[1].state, "offline");
  assert.equal(persisted[1].authStatus, "offline");
});

test("getMainState always returns the merged CEO record", async () => {
  await writeJson("state.json", {
    state: "executing",
    detail: "正在处理全局任务",
    updated_at: "2026-04-03T12:00:00",
  });
  await writeJson("agents-state.json", [
    {
      agentId: "agent_guest",
      name: "Web Designer",
      isMain: false,
      state: "writing",
      detail: "在改布局",
      updated_at: "2026-04-03T11:50:00",
      source: "remote",
      joinKey: "alpha",
      authStatus: "approved",
      authApprovedAt: "2026-04-03T11:50:00",
      authExpiresAt: null,
      lastPushAt: "2026-04-03T11:50:00",
    },
    {
      agentId: "ceo",
      name: "CEO",
      isMain: true,
      state: "idle",
      detail: "旧状态",
      updated_at: "2026-04-03T11:00:00",
      source: "local",
      joinKey: null,
      authStatus: "approved",
      authApprovedAt: null,
      authExpiresAt: null,
      lastPushAt: null,
    },
  ]);

  const main = await getMainState();
  assert.equal(main.name, "CEO");
  assert.equal(main.state, "executing");
  assert.equal(main.detail, "正在处理全局任务");
});

test("rejoining with a new key rebinds the agent and releases the old key", async () => {
  await writeJson("join-keys.json", {
    keys: [
      { key: "alpha", used: false, reusable: true, maxConcurrent: 3 },
      { key: "beta", used: false, reusable: true, maxConcurrent: 3 },
    ],
  });

  const firstJoin = await joinAgent({
    name: "Security Auditor",
    joinKey: "alpha",
    detail: "第一次加入",
    state: "idle",
  });
  const secondJoin = await joinAgent({
    name: "Security Auditor",
    joinKey: "beta",
    detail: "换了新 key",
    state: "researching",
  });

  assert.equal(firstJoin.ok, true);
  assert.equal(secondJoin.ok, true);
  assert.equal(secondJoin.agentId, firstJoin.agentId);

  const agents = await readJson("agents-state.json");
  const guest = agents.find((agent) => agent.name === "Security Auditor");
  assert.equal(guest.joinKey, "beta");
  assert.equal(guest.state, "researching");

  const joinKeys = await readJson("join-keys.json");
  const alpha = joinKeys.keys.find((item) => item.key === "alpha");
  const beta = joinKeys.keys.find((item) => item.key === "beta");
  assert.equal(alpha.used, false);
  assert.equal(alpha.usedByAgentId, null);
  assert.equal(beta.used, true);
  assert.equal(beta.usedByAgentId, firstJoin.agentId);
});
