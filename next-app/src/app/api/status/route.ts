import { NextResponse } from "next/server";
import { loadState } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await loadState();
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
