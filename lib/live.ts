import "server-only";
import { getDb } from "./db";
import { env } from "./env";

// Tells open screens that something changed.
// 1. Bumps a version counter per topic in the database. Browsers poll these as a fallback.
// 2. If Supabase is configured, sends a realtime broadcast so screens update at once.
// Call this after the transaction that made the change has committed.
export async function notify(topicList: string[]) {
  const unique = [...new Set(topicList)];
  if (unique.length === 0) return;
  const db = await getDb();
  const rows = await db.query<{ topic: string; version: string }>(
    `insert into live_versions (topic, version)
       select unnest($1::text[]), 1
     on conflict (topic) do update set version = live_versions.version + 1
     returning topic, version`,
    [unique],
  );
  if (env.supabaseUrl && env.supabaseServiceKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    try {
      await fetch(`${env.supabaseUrl}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: env.supabaseServiceKey,
          Authorization: `Bearer ${env.supabaseServiceKey}`,
        },
        body: JSON.stringify({
          messages: rows.map((r) => ({ topic: r.topic, event: "bump", payload: { v: Number(r.version) } })),
        }),
        signal: controller.signal,
      });
    } catch {
      // Polling picks the change up a few seconds later, so a failed broadcast is not fatal.
    } finally {
      clearTimeout(timeout);
    }
  }
}
