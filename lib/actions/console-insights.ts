"use server";

import { z } from "zod";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { buildPreview, runSync, type SyncPreview, type SyncResult } from "@/lib/hubspot";
import { AiUnavailable, commonThemes, type Themes } from "@/lib/ai";
import { PROBLEM_TYPE_INFO, type ProblemType } from "@/lib/copy";

const slug = z.string().regex(/^[a-z0-9-]{3,60}$/);

export async function hubspotPreview(input: unknown): Promise<{ ok: true; logId: string; preview: SyncPreview } | { ok: false; error: string }> {
  const staff = await requireStaff("admin");
  const parsed = z.object({ slug }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const event = await getEventBySlug(parsed.data.slug);
  if (!event) return { ok: false, error: "Event not found" };
  const preview = await buildPreview(event.id);
  const db = await getDb();
  const row = await db.one<{ id: string }>("insert into hubspot_sync_log (event_id, run_by, preview) values ($1, $2, $3::jsonb) returning id", [
    event.id,
    staff.id,
    JSON.stringify(preview),
  ]);
  return { ok: true, logId: row!.id, preview };
}

// Runs the sync for a preview the admin has just looked at. Never runs on its own.
export async function hubspotConfirm(input: unknown): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string }> {
  const staff = await requireStaff("admin");
  const parsed = z.object({ slug, logId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const event = await getEventBySlug(parsed.data.slug);
  if (!event) return { ok: false, error: "Event not found" };
  const db = await getDb();
  const log = await db.one<{ id: string; result: unknown; at: Date }>(
    "select id, result, at from hubspot_sync_log where id = $1 and event_id = $2",
    [parsed.data.logId, event.id],
  );
  if (!log) return { ok: false, error: "Preview not found. Make a new preview." };
  if (log.result) return { ok: false, error: "This preview has already been run. Make a new preview." };
  if (Date.now() - new Date(log.at).getTime() > 30 * 60_000) return { ok: false, error: "This preview is over 30 minutes old. Make a new preview." };
  try {
    const result = await runSync(event.id, event.name);
    await db.query("update hubspot_sync_log set result = $2::jsonb where id = $1", [log.id, JSON.stringify(result)]);
    await audit(db, { eventId: event.id, actor: { type: "staff", id: staff.id }, action: "hubspot_sync", entity: "hubspot_sync_log", entityId: log.id, diff: result });
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.query("update hubspot_sync_log set result = $2::jsonb where id = $1", [log.id, JSON.stringify({ error: message })]);
    return { ok: false, error: message };
  }
}

// An AI summary of common themes. Shown with a "needs review" label.
export async function draftThemes(input: unknown): Promise<{ ok: true; themes: Themes["themes"] } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = z.object({ slug }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const event = await getEventBySlug(parsed.data.slug);
  if (!event) return { ok: false, error: "Event not found" };
  if (!event.ai_enabled) return { ok: false, error: "The AI helper is turned off for this event." };
  const db = await getDb();
  const rows = await db.query<{ company: string; title: string; type: string | null; today_state: string | null; sector: string | null }>(
    `select c.id as company, p.title, p.type, p.today_state, c.sector from problems p join companies c on c.id = p.company_id
      where c.event_id = $1 and p.deleted_at is null and length(trim(p.title)) >= 10 order by c.id`,
    [event.id],
  );
  if (rows.length === 0) return { ok: false, error: "There are no problems to summarise yet." };
  // Companies are numbered, not named.
  const ids = [...new Set(rows.map((r) => r.company))];
  const text = rows
    .map((r) => `Company ${ids.indexOf(r.company) + 1} (${r.sector ?? "sector not given"}): ${r.title}. Type: ${r.type ? PROBLEM_TYPE_INFO[r.type as ProblemType].label : "not set"}. Today: ${r.today_state ?? "-"}`)
    .join("\n");
  try {
    const themes = await commonThemes(`${ids.length} companies wrote these problems:\n${text}`);
    await db.query("insert into ai_suggestions (event_id, field, input, output) values ($1, 'insights.themes', $2::jsonb, $3)", [
      event.id,
      JSON.stringify({ companies: ids.length, problems: rows.length }),
      JSON.stringify(themes),
    ]);
    return { ok: true, themes: themes.themes };
  } catch (err) {
    if (err instanceof AiUnavailable) return { ok: false, error: err.message };
    return { ok: false, error: "The AI helper could not summarise the themes." };
  }
}
