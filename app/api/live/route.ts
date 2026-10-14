import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { TOPIC_PATTERN } from "@/lib/topics";

// Polling fallback for realtime: returns the current version of each requested topic.
// Versions are plain counters and reveal nothing about the data behind them.
export async function GET(request: Request) {
  const list = (new URL(request.url).searchParams.get("t") ?? "")
    .split(",")
    .filter((t) => TOPIC_PATTERN.test(t))
    .slice(0, 10);
  if (list.length === 0) return NextResponse.json({ v: {} });
  const db = await getDb();
  const rows = await db.query<{ topic: string; version: number }>(
    "select topic, version from live_versions where topic = any($1::text[])",
    [list],
  );
  const v: Record<string, number> = Object.fromEntries(list.map((t) => [t, 0]));
  for (const r of rows) v[r.topic] = Number(r.version);
  return NextResponse.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
