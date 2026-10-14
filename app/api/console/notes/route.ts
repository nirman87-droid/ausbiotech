import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getStaff } from "@/lib/staff";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/live";
import { topics } from "@/lib/topics";

// Autosave for facilitator notes (A2). Staff only. Notes are never shown to participants
// and never copied into the final plan.

const text = (max: number) => z.string().max(max).nullable().transform((v) => (v === "" ? null : v));
const fields = {
  decision_maker: z.enum(["yes", "no", "unsure"]).nullable(),
  lead_rating: z.enum(["hot", "warm", "cold"]).nullable(),
  funding_fit: text(300),
  signals: text(2000),
  notes: text(5000),
  next_action: text(500),
  action_owner: text(120),
  action_due: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable().transform((v) => v || null),
} as const;

const opSchema = z.object({
  kind: z.literal("notes.set"),
  companyId: z.string().uuid(),
  field: z.enum(Object.keys(fields) as [keyof typeof fields, ...(keyof typeof fields)[]]),
  value: z.unknown(),
});
const bodySchema = z.object({ ops: z.array(z.unknown()).min(1).max(50) });

export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  const results: { ok: boolean; error?: string; permanent?: boolean }[] = [];
  const touched = new Map<string, string>();
  for (const raw of body.data.ops) {
    const op = opSchema.safeParse(raw);
    if (!op.success) {
      results.push({ ok: false, error: "Invalid change", permanent: true });
      continue;
    }
    const value = fields[op.data.field].safeParse(op.data.value);
    if (!value.success) {
      results.push({ ok: false, error: "Invalid value", permanent: true });
      continue;
    }
    const company = await db.one<{ event_id: string }>("select event_id from companies where id = $1", [op.data.companyId]);
    if (!company) {
      results.push({ ok: false, error: "Company not found", permanent: true });
      continue;
    }
    const f = op.data.field;
    await db.tx(async (q) => {
      await q.query(
        `insert into facilitator_notes (company_id, ${f}, updated_by) values ($1, $2, $3)
         on conflict (company_id) do update set ${f} = excluded.${f}, updated_by = excluded.updated_by`,
        [op.data.companyId, value.data, staff.id],
      );
      await audit(q, {
        eventId: company.event_id,
        actor: { type: "staff", id: staff.id },
        action: "update",
        entity: "facilitator_notes",
        entityId: op.data.companyId,
        diff: { [f]: value.data },
      });
    });
    touched.set(op.data.companyId, company.event_id);
    results.push({ ok: true });
  }
  // Only staff screens listen to these topics' note changes; participants never receive note data.
  for (const [, eventId] of touched) await notify([topics.activity(eventId)]);
  return NextResponse.json({ results });
}
