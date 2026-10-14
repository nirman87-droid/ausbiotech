import { NextResponse } from "next/server";
import { getParticipant } from "@/lib/session";
import { applyOps, batchSchema } from "@/lib/participant-ops";
import { notify } from "@/lib/live";
import { topics } from "@/lib/topics";

// Autosave endpoint for participant screens. Accepts a batch of field changes.
export async function POST(request: Request) {
  const ctx = await getParticipant();
  if (!ctx) return NextResponse.json({ error: "Your session has ended. Scan the table code again." }, { status: 401 });
  const body = batchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { results, touchedPoll } = await applyOps(ctx, body.data.ops);
  if (results.some((r) => r.ok)) {
    const list = [topics.company(ctx.company.id), topics.activity(ctx.event.id)];
    if (touchedPoll) list.push(topics.poll(ctx.event.id));
    await notify(list);
  }
  return NextResponse.json({ results });
}
