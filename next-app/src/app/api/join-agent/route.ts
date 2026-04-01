import { NextRequest, NextResponse } from "next/server";
import {
  loadAgents,
  loadAgentsRaw,
  loadJoinKeys,
  mergeMainAgent,
  saveAgents,
  saveJSON,
  JOIN_KEYS_FILE,
  normalizeState,
  nowISO,
  generateAgentId,
  updateGuest,
  recordHistory,
  keyAllowsJoin,
  countActiveAgentsForKey,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const joinKey = String(body.joinKey || "").trim();
    const detail = String(body.detail || "");
    const stateValue = normalizeState(body.state);

    if (!name || !joinKey) {
      return NextResponse.json({ ok: false, msg: "name 和 joinKey 必填" }, { status: 400 });
    }

    const joinKeys = await loadJoinKeys();
    const keys = (joinKeys.keys || []) as Record<string, unknown>[];
    const keyItem = keys.find((k) => k.key === joinKey);

    if (!keyItem) {
      return NextResponse.json({ ok: false, msg: "join key 无效" }, { status: 403 });
    }

    let agents = (await loadAgentsRaw()) as Record<string, unknown>[];
    agents = mergeMainAgent(agents) as Record<string, unknown>[];

    const existing = agents.find(
      (a) => !a.isMain && a.name === name
    ) as Record<string, unknown> | undefined;

    const { allowed, error } = keyAllowsJoin(
      keyItem,
      existing ? String(existing.agentId) : undefined
    );
    if (!allowed) {
      return NextResponse.json({ ok: false, msg: error }, { status: 403 });
    }

    const activeCount = countActiveAgentsForKey(
      agents,
      joinKey,
      existing ? String(existing.agentId) : undefined
    );
    const maxConcurrent = parseInt(String(keyItem.maxConcurrent || 3), 10);
    if (activeCount >= maxConcurrent) {
      return NextResponse.json(
        { ok: false, msg: `并发已达上限（${maxConcurrent}）` },
        { status: 429 }
      );
    }

    let agent: Record<string, unknown>;

    if (existing) {
      agent = await updateGuest(existing, stateValue, detail);
    } else {
      agent = {
        agentId: generateAgentId(),
        name,
        isMain: false,
        state: stateValue,
        detail,
        updated_at: nowISO(),
        source: String(body.source || "remote"),
        joinKey,
        authStatus: "approved",
        authApprovedAt: nowISO(),
        authExpiresAt: null,
        lastPushAt: nowISO(),
      };
      agents.push(agent);
      await recordHistory(name, stateValue, detail, String(agent.updated_at));
    }

    keyItem.used = true;
    keyItem.usedBy = name;
    keyItem.usedByAgentId = agent.agentId;
    keyItem.usedAt = nowISO();

    await saveJSON(JOIN_KEYS_FILE, joinKeys);
    await saveAgents(agents);

    return NextResponse.json({ ok: true, agentId: agent.agentId, authStatus: "approved" });
  } catch (err) {
    return NextResponse.json({ ok: false, msg: String(err) }, { status: 500 });
  }
}
