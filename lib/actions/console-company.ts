"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { notify } from "@/lib/live";
import { topics } from "@/lib/topics";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const slug = z.string().regex(/^[a-z0-9-]{3,60}$/);

// A2: an ARM Hub expert has looked over the shortlist. Shows as "Expert check" on P5.
export async function markShortlistReviewed(input: unknown): Promise<Result> {
  const parsed = z.object({ slug, companyId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const staff = await requireStaff();
  const event = await getEventBySlug(parsed.data.slug);
  if (!event) return { ok: false, error: "Event not found" };
  const db = await getDb();
  const ok = await db.tx(async (q) => {
    const c = await q.one("select id from companies where id = $1 and event_id = $2", [parsed.data.companyId, event.id]);
    if (!c) return false;
    const r = await q.one<{ id: string }>("insert into shortlist_reviews (company_id, staff_id) values ($1, $2) returning id", [
      parsed.data.companyId,
      staff.id,
    ]);
    await audit(q, { eventId: event.id, actor: { type: "staff", id: staff.id }, action: "review_shortlist", entity: "shortlist_reviews", entityId: r!.id, diff: { company_id: parsed.data.companyId } });
    return true;
  });
  if (!ok) return { ok: false, error: "Company not found" };
  await notify([topics.company(parsed.data.companyId), topics.activity(event.id)]);
  revalidatePath(`/console/${event.slug}/company/${parsed.data.companyId}`);
  return { ok: true, message: "Marked as expert reviewed." };
}

// A2 (admin): merge a duplicate company into this one. The duplicate is removed.
export async function mergeCompanies(input: unknown): Promise<Result> {
  const parsed = z.object({ slug, targetId: z.string().uuid(), sourceId: z.string().uuid() }).safeParse(input);
  if (!parsed.success || parsed.data.targetId === parsed.data.sourceId) return { ok: false, error: "Pick a different company." };
  const staff = await requireStaff("admin");
  const event = await getEventBySlug(parsed.data.slug);
  if (!event) return { ok: false, error: "Event not found" };
  const { targetId, sourceId } = parsed.data;
  const db = await getDb();
  const summary = await db.tx(async (q) => {
    const both = await q.query<{ id: string; name: string }>("select id, name from companies where id = any($1::uuid[]) and event_id = $2", [
      [targetId, sourceId],
      event.id,
    ]);
    if (both.length !== 2) throw new Error("Both companies must belong to this event.");
    const source = both.find((c) => c.id === sourceId)!;
    // Fill blank details on the target from the duplicate.
    await q.query(
      `update companies t set website = coalesce(t.website, s.website), sector = coalesce(t.sector, s.sector),
         size_band = coalesce(t.size_band, s.size_band), state = coalesce(t.state, s.state),
         table_id = coalesce(t.table_id, s.table_id), golden_problem_id = coalesce(t.golden_problem_id, s.golden_problem_id),
         shortlist_confirmed_at = coalesce(t.shortlist_confirmed_at, s.shortlist_confirmed_at),
         last_activity_at = greatest(t.last_activity_at, s.last_activity_at),
         hubspot_company_id = coalesce(t.hubspot_company_id, s.hubspot_company_id)
       from companies s where t.id = $1 and s.id = $2`,
      [targetId, sourceId],
    );
    const people = await q.query("update people set company_id = $1 where company_id = $2 returning id", [targetId, sourceId]);
    const maxPos = await q.one<{ n: number }>("select coalesce(max(position), 0) as n from problems where company_id = $1", [targetId]);
    const problems = await q.query("update problems set company_id = $1, position = position + $3 where company_id = $2 returning id", [
      targetId,
      sourceId,
      maxPos!.n,
    ]);
    await q.query("update golden_drafts set company_id = $1 where company_id = $2", [targetId, sourceId]);
    await q.query("update shortlist_reviews set company_id = $1 where company_id = $2", [targetId, sourceId]);
    await q.query("update ai_suggestions set company_id = $1 where company_id = $2", [targetId, sourceId]);
    // One next steps row and one notes row per company: keep the target's, else take the duplicate's.
    await q.query(
      "update next_steps set company_id = $1 where company_id = $2 and not exists (select 1 from next_steps where company_id = $1)",
      [targetId, sourceId],
    );
    await q.query(
      `update facilitator_notes t set notes = concat_ws(E'\\n\\n', t.notes, 'Merged from ' || $3 || ': ' || s.notes)
         from facilitator_notes s where t.company_id = $1 and s.company_id = $2 and s.notes is not null`,
      [targetId, sourceId, source.name],
    );
    await q.query(
      "update facilitator_notes set company_id = $1 where company_id = $2 and not exists (select 1 from facilitator_notes where company_id = $1)",
      [targetId, sourceId],
    );
    await q.query(
      "update final_plans set company_id = $1 where company_id = $2 and not exists (select 1 from final_plans where company_id = $1)",
      [targetId, sourceId],
    );
    await q.query("delete from companies where id = $1", [sourceId]);
    const diff = { merged_from: sourceId, merged_name: source.name, people: people.length, problems: problems.length };
    await audit(q, { eventId: event.id, actor: { type: "staff", id: staff.id }, action: "merge", entity: "companies", entityId: targetId, diff });
    return diff;
  });
  await notify([topics.company(targetId), topics.company(sourceId), topics.activity(event.id)]);
  revalidatePath(`/console/${event.slug}`, "layout");
  return { ok: true, message: `Merged ${summary.merged_name}: moved ${summary.people} people and ${summary.problems} problems.` };
}
