import { NextRequest, NextResponse } from "next/server";
import { normalizeState, updateMainAgent } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const stateValue = normalizeState(body.state);
    const detail = String(body.detail || "");
    const result = await updateMainAgent(stateValue, detail);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, msg: String(err) }, { status: 500 });
  }
}
