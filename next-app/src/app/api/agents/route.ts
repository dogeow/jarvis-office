import { NextResponse } from "next/server";
import { loadAgents, payloadAgents } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const agents = await loadAgents();
  const payload = payloadAgents(agents);
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
