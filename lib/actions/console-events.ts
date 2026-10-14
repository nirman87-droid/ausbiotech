"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/staff";
import { DEFAULT_POLL, RESERVED_SLUGS } from "@/lib/copy";
import { fromLocalInput } from "@/lib/format";

export type CreateEventState = { errors?: Record<string, string> };

const schema = z.object({
  name: z.string().trim().min(3, "Enter a name.").max(150),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,60}$/, "Use 3 to 60 lowercase letters, numbers or hyphens.")
    .refine((s) => !RESERVED_SLUGS.includes(s), "That address is reserved."),
  starts_at: z.string().min(1, "Choose a start time."),
});

// Admin: create a new workshop event. Everything else is set on the setup page.
export async function createEvent(_prev: CreateEventState, form: FormData): Promise<CreateEventState> {
  const staff = await requireStaff("admin");
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const db = await getDb();
  const startsAt = fromLocalInput(parsed.data.starts_at);
  try {
    await db.tx(async (q) => {
      const ev = await q.one<{ id: string }>(
        `insert into events (slug, name, starts_at, access_opens_at, access_closes_at)
         values ($1, $2, $3, $3::timestamptz - interval '1 hour', $3::timestamptz + interval '9 hours') returning id`,
        [parsed.data.slug, parsed.data.name, startsAt],
      );
      for (const [i, pq] of DEFAULT_POLL.entries()) {
        await q.query(
          "insert into poll_questions (event_id, position, text, type, options) values ($1, $2, $3, $4, $5::jsonb)",
          [ev!.id, i + 1, pq.text, pq.type, JSON.stringify(pq.options)],
        );
      }
      await audit(q, {
        eventId: ev!.id,
        actor: { type: "staff", id: staff.id },
        action: "create",
        entity: "events",
        entityId: ev!.id,
        diff: parsed.data,
      });
    });
  } catch (err: any) {
    if (err?.code === "23505") return { errors: { slug: "That address is already used by another event." } };
    throw err;
  }
  redirect(`/console/${parsed.data.slug}/setup`);
}
