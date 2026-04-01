import { NextRequest, NextResponse } from "next/server";
import { getHistory, annotateHistory, MAX_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const url = _request.nextUrl;
  const rawLimit = url.searchParams.get("limit") || "";
  let limit = DEFAULT_HISTORY_LIMIT;
  if (rawLimit) {
    const parsed = parseInt(rawLimit, 10);
    if (!isNaN(parsed)) {
      limit = Math.max(1, Math.min(parsed, MAX_HISTORY_LIMIT));
    }
  }

  const entries = await getHistory(decodeURIComponent(name));
  const limited = entries.slice(0, limit);
  const annotated = annotateHistory(limited as { updated_at: string; state: string; detail: string }[]);

  return NextResponse.json(annotated, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
