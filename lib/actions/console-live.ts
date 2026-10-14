"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { STAGES } from "@/lib/copy";
import { nextStage } from "@/lib/rules";
import { notify } from "@/lib/live";
import { topics } from "@/lib/topics";

// A1 admin controls: stage, timer and poll. Admin only. Every change is audited and
// pushed to every participant screen through the event topic.

const slug = z.string().regex(/^[a-z0-9-]{3,60}$/);
const controlSchema = z.discriminatedUnion("action", [
  z.object({ slug, action: z.literal("set_stage"), stage: z.enum(STAGES) }),
  z.object({ slug, action: z.literal("next_stage") }),
  z.object({ slug, action: z.literal("timer_start"), minutes: z.number().int().min(1).max(180) }),
  z.object({ slug, action: z.literal("timer_pause") }),
  z.object({ slug, action: z.literal("timer_resume") }),
  z.object({ slug, action: z.literal("timer_add"), minutes: z.number().int().min(1).max(60) }),
  z.object({ slug, action: z.literal("timer_clear") }),
  z.object({ slug, action: z.literal("poll_open"), open: z.boolean() }),
]);

export type ControlResult = { ok: true } | { ok: false; error: string };

export async function eventControl(input: unknown): Promise<ControlResult> {
  const staff = await requireStaff("admin");
  const parsed = controlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const c = parsed.data;
  const event = await getEventBySlug(c.slug);
  if (!event) return { ok: false, error: "Event not found" };
  const db = await getDb();

  let sql = "";
  let params: unknown[] = [event.id];
  switch (c.action) {
    case "set_stage":
      sql = "update events set current_stage = $2 where id = $1";
      params.push(c.stage);
      break;
    case "next_stage":
      sql = "update events set current_stage = $2 where id = $1";
      params.push(nextStage(event.current_stage));
      break;
    case "timer_start":
      sql = "update events set timer_ends_at = now() + make_interval(mins => $2), timer_paused_remaining_s = null where id = $1";
      params.push(c.minutes);
      break;
    case "timer_pause":
      sql = `update events set timer_paused_remaining_s = greatest(0, extract(epoch from (timer_ends_at - now()))::int),
             timer_ends_at = null where id = $1 and timer_ends_at is not null`;
      break;
    case "timer_resume":
      sql = `update events set timer_ends_at = now() + make_interval(secs => timer_paused_remaining_s),
             timer_paused_remaining_s = null where id = $1 and timer_paused_remaining_s is not null`;
      break;
    case "timer_add":
      sql = `update events set
               timer_ends_at = case when timer_ends_at is not null then timer_ends_at + make_interval(mins => $2) end,
               timer_paused_remaining_s = case when timer_paused_remaining_s is not null then timer_paused_remaining_s + $2 * 60 end
             where id = $1`;
      params.push(c.minutes);
      break;
    case "timer_clear":
      sql = "update events set timer_ends_at = null, timer_paused_remaining_s = null where id = $1";
      break;
    case "poll_open":
      sql = "update events set poll_open = $2 where id = $1";
      params.push(c.open);
      break;
  }
  await db.tx(async (q) => {
    await q.query(sql, params);
    const { slug: _s, ...detail } = c;
    await audit(q, { eventId: event.id, actor: { type: "staff", id: staff.id }, action: c.action, entity: "events", entityId: event.id, diff: detail });
  });
  await notify([topics.event(event.id), topics.activity(event.id), topics.poll(event.id)]);
  revalidatePath(`/console/${event.slug}`, "layout");
  return { ok: true };
}
