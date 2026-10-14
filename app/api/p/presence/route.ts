import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getParticipant } from "@/lib/session";
import { notify } from "@/lib/live";
import { topics } from "@/lib/topics";

// Records which field this person is editing, so teammates can see a small marker.
const schema = z.object({ field: z.string().max(120).regex(/^[a-z_.:0-9-]+$/).nullable() });

export async function POST(request: Request) {
  const ctx = await getParticipant();
  if (!ctx) return NextResponse.json({ error: "No session" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  if (body.data.field) {
    const prev = await db.one<{ field_key: string; fresh: boolean }>(
      "select field_key, updated_at > now() - interval '20 seconds' as fresh from editing_markers where person_id = $1 and company_id = $2",
      [ctx.person.id, ctx.company.id],
    );
    await db.query(
      `insert into editing_markers (company_id, person_id, field_key) values ($1, $2, $3)
       on conflict (company_id, person_id) do update set field_key = excluded.field_key, updated_at = now()`,
      [ctx.company.id, ctx.person.id, body.data.field],
    );
    // Only wake teammates when the marker actually moved or had expired.
    if (!prev || prev.field_key !== body.data.field || !prev.fresh) await notify([topics.company(ctx.company.id)]);
  } else {
    const removed = await db.query("delete from editing_markers where person_id = $1 and company_id = $2 returning id", [
      ctx.person.id,
      ctx.company.id,
    ]);
    if (removed.length) await notify([topics.company(ctx.company.id)]);
  }
  return NextResponse.json({ ok: true });
}
