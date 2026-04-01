import { NextResponse } from "next/server";
import { loadAgents, nowISO, payloadAgents } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const agents = await loadAgents();
  const payload = payloadAgents(agents);
  return NextResponse.json(
    {
      status: "ok",
      service: "jarvis-office-clean",
      timestamp: nowISO(),
      agentCount: payload.length,
    },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    }
  );
}
