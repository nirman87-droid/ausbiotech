"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { SECTORS, SIZE_BANDS, STATES } from "@/lib/copy";
import { requireTableAccess } from "@/lib/table-access";
import { isEditingLocked } from "@/lib/rules";
import { notify } from "@/lib/live";
import { topics } from "@/lib/topics";

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  name: z.string().trim().min(2, "Enter your organisation name.").max(120),
  sector: z.enum(SECTORS, { message: "Choose a sector." }),
  size_band: z.enum(SIZE_BANDS, { message: "Choose a size." }),
  state: z.enum(STATES, { message: "Choose a state." }),
});

export type AddCompanyState = { errors?: Record<string, string>; values?: Record<string, string> };

// Walk-in: adds a company at the scanned table, then goes to P2 to add the person.
export async function addWalkInCompany(_prev: AddCompanyState, form: FormData): Promise<AddCompanyState> {
  const values = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }
  const input = parsed.data;
  const { event, table } = await requireTableAccess(input.slug);
  if (isEditingLocked(event)) return { errors: { name: "The workshop is closed to new organisations." }, values };

  const db = await getDb();
  const existing = await db.one<{ id: string }>("select id from companies where event_id = $1 and lower(name) = lower($2)", [
    event.id,
    input.name,
  ]);
  let companyId = existing?.id;
  if (!companyId) {
    companyId = await db.tx(async (q) => {
      const row = await q.one<{ id: string }>(
        `insert into companies (event_id, table_id, name, sector, size_band, state, is_walk_in)
         values ($1, $2, $3, $4, $5, $6, true) returning id`,
        [event.id, table?.id ?? null, input.name, input.sector, input.size_band, input.state],
      );
      await audit(q, {
        eventId: event.id,
        actor: { type: "participant", id: null },
        action: "create_walk_in",
        entity: "companies",
        entityId: row!.id,
        diff: input,
      });
      return row!.id;
    });
    await notify([topics.activity(event.id)]);
  }
  redirect(`/${event.slug}/c/${companyId}/who?add=1`);
}
