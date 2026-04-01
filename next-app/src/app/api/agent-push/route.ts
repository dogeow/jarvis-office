import { NextRequest, NextResponse } from "next/server";
import {
  loadAgentsRaw,
  mergeMainAgent,
  saveAgents,
  normalizeState,
  nowISO,
  findJoinKey,
  keyIsExpired,
  updateGuest,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const joinKey = String(body.joinKey || "").trim();
    const name = String(body.name || "").trim();
    const agentId = String(body.agentId || "").trim();
    const detail = String(body.detail || "");
    const stateValue = normalizeState(body.state);

    if (!joinKey) {
      return NextResponse.json({ ok: false, msg: "joinKey 必填" }, { status: 400 });
    }

    const keyItem = await findJoinKey(joinKey);
    if (!keyItem) {
      return NextResponse.json({ ok: false, msg: "join key 无效" }, { status: 403 });
    }
    if (keyIsExpired(keyItem)) {
      return NextResponse.json({ ok: false, msg: "join key 已过期" }, { status: 403 });
    }

    let agents = (await loadAgentsRaw()) as Record<string, unknown>[];
    agents = mergeMainAgent(agents) as Record<string, unknown>[];

    const agent = agents.find(
      (a) =>
        !a.isMain &&
        ((agentId && a.agentId === agentId) || (name && a.name === name))
    ) as Record<string, unknown> | undefined;

    if (!agent) {
      return NextResponse.json({ ok: false, msg: "agent 不存在，请先 join" }, { status: 404 });
    }
    if (agent.joinKey !== joinKey) {
      return NextResponse.json({ ok: false, msg: "join key 不匹配" }, { status: 403 });
    }

    updateGuest(agent, stateValue, detail);
    await saveAgents(agents);

    return NextResponse.json({ ok: true, agentId: agent.agentId, state: stateValue });
  } catch (err) {
    return NextResponse.json({ ok: false, msg: String(err) }, { status: 500 });
  }
}
