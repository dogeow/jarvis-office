import { NextRequest, NextResponse } from "next/server";
import {
  loadAgentsRaw,
  loadJoinKeys,
  mergeMainAgent,
  saveAgents,
  saveJSON,
  JOIN_KEYS_FILE,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const agentId = String(body.agentId || "").trim();
    const name = String(body.name || "").trim();

    if (!agentId && !name) {
      return NextResponse.json({ ok: false, msg: "agentId 或 name 必填" }, { status: 400 });
    }

    const joinKeys = await loadJoinKeys();
    let agents = (await loadAgentsRaw()) as Record<string, unknown>[];
    agents = mergeMainAgent(agents) as Record<string, unknown>[];

    const target = agents.find(
      (a) =>
        !a.isMain &&
        ((agentId && a.agentId === agentId) || (name && a.name === name))
    ) as Record<string, unknown> | undefined;

    if (!target) {
      return NextResponse.json({ ok: false, msg: "agent 不存在" }, { status: 404 });
    }

    agents = agents.filter((a) => a.agentId !== target.agentId);

    for (const keyItem of joinKeys.keys as Record<string, unknown>[]) {
      if (keyItem.usedByAgentId === target.agentId) {
        keyItem.used = false;
        keyItem.usedBy = null;
        keyItem.usedByAgentId = null;
        keyItem.usedAt = null;
        break;
      }
    }

    await saveJSON(JOIN_KEYS_FILE, joinKeys);
    await saveAgents(agents);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, msg: String(err) }, { status: 500 });
  }
}
