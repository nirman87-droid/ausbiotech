"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type Queryable } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { randomToken } from "@/lib/sign";
import { notify } from "@/lib/live";
import { topics } from "@/lib/topics";
import { fromLocalInput } from "@/lib/format";
import { normaliseSizeBand } from "@/lib/rules";
import { PLACEHOLDER_PREFIX, SECTORS, STATES } from "@/lib/copy";
import type { StaffRow } from "@/lib/types";

// A0 event setup. Admin only. Every action validates with Zod and writes to the audit log.

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const slugSchema = z.string().regex(/^[a-z0-9-]{3,60}$/);

async function adminEvent(slug: unknown) {
  const staff = await requireStaff("admin");
  const s = slugSchema.parse(slug);
  const event = await getEventBySlug(s);
  if (!event) throw new Error("Event not found");
  return { staff, event };
}

async function done(eventId: string, slug: string, extra: string[] = []) {
  await notify([topics.event(eventId), topics.activity(eventId), ...extra]);
  revalidatePath(`/console/${slug}`, "layout");
}

function logStaff(q: Queryable, eventId: string, staff: StaffRow, action: string, entity: string, entityId: string | null, diff?: unknown) {
  return audit(q, { eventId, actor: { type: "staff", id: staff.id }, action, entity, entityId, diff });
}

// Event settings --------------------------------------------------------------

const settingsSchema = z.object({
  name: z.string().trim().min(3).max(150),
  venue: z.string().trim().max(200).optional().default(""),
  starts_at: z.string().optional().default(""),
  access_opens_at: z.string().optional().default(""),
  access_closes_at: z.string().optional().default(""),
  plans_due_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional().default(""),
  booking_url: z.union([z.literal(""), z.string().url().max(500)]).optional().default(""),
  ai_enabled: z.enum(["on"]).optional(),
  weight_ready: z.coerce.number().int().min(0).max(100),
  weight_value: z.coerce.number().int().min(0).max(100),
  weight_foundation: z.coerce.number().int().min(0).max(100),
  stuck_threshold_min: z.coerce.number().int().min(1).max(120),
  status: z.enum(["setup", "live", "closed"]),
});

export async function saveSettings(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { staff, event } = await adminEvent(form.get("slug"));
  const parsed = settingsSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: `Check "${String(i.path[0])}": ${i.message}` };
  }
  const v = parsed.data;
  if (v.weight_ready + v.weight_value + v.weight_foundation === 0) return { ok: false, error: "Score weights cannot all be zero." };
  const opens = fromLocalInput(v.access_opens_at);
  const closes = fromLocalInput(v.access_closes_at);
  if (opens && closes && new Date(closes) <= new Date(opens)) return { ok: false, error: "Access must close after it opens." };
  const row = {
    name: v.name,
    venue: v.venue || null,
    starts_at: fromLocalInput(v.starts_at),
    access_opens_at: opens,
    access_closes_at: closes,
    plans_due_date: v.plans_due_date || null,
    booking_url: v.booking_url || null,
    ai_enabled: v.ai_enabled === "on",
    score_weights: { ready: v.weight_ready, value: v.weight_value, foundation: v.weight_foundation },
    stuck_threshold_min: v.stuck_threshold_min,
    status: v.status,
  };
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query(
      `update events set name=$2, venue=$3, starts_at=$4, access_opens_at=$5, access_closes_at=$6, plans_due_date=$7,
         booking_url=$8, ai_enabled=$9, score_weights=$10::jsonb, stuck_threshold_min=$11, status=$12 where id=$1`,
      [event.id, row.name, row.venue, row.starts_at, row.access_opens_at, row.access_closes_at, row.plans_due_date,
        row.booking_url, row.ai_enabled, JSON.stringify(row.score_weights), row.stuck_threshold_min, row.status],
    );
    // Device sessions end when access closes, so keep them in step with the new time.
    if (closes) {
      await q.query(
        `update device_sessions ds set expires_at = $2 from people p join companies c on c.id = p.company_id
          where ds.person_id = p.id and c.event_id = $1 and ds.revoked_at is null`,
        [event.id, closes],
      );
    }
    // New weights change every score. Recompute them.
    const w = row.score_weights;
    await q.query(
      `update problems pr set score = round(coalesce(pr.data_ready,0)/5.0 * $2 + coalesce(pr.value,0)/5.0 * $3
          + case when pr.builds_foundation then $4 else 0 end)
         from companies c where c.id = pr.company_id and c.event_id = $1`,
      [event.id, w.ready, w.value, w.foundation],
    );
    await logStaff(q, event.id, staff, "update_settings", "events", event.id, row);
  });
  await done(event.id, event.slug);
  return { ok: true, message: "Settings saved." };
}

// Poll questions ---------------------------------------------------------------

const questionSchema = z.object({
  slug: slugSchema,
  id: z.string().uuid().optional(),
  text: z.string().trim().min(3).max(200),
  type: z.enum(["single", "scale"]),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(10),
});

export async function saveQuestion(input: unknown): Promise<ActionResult> {
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A question needs text and 2 to 10 options." };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const v = parsed.data;
  const options = v.type === "scale" ? ["1", "2", "3", "4", "5"] : [...new Set(v.options)];
  const db = await getDb();
  await db.tx(async (q) => {
    if (v.id) {
      await q.query("update poll_questions set text=$3, type=$4, options=$5::jsonb where id=$1 and event_id=$2", [
        v.id, event.id, v.text, v.type, JSON.stringify(options),
      ]);
      // Answers that no longer match an option are removed so counts stay honest.
      await q.query("delete from poll_responses where question_id = $1 and not (to_jsonb(answer) <@ $2::jsonb)", [
        v.id, JSON.stringify(options),
      ]);
      await logStaff(q, event.id, staff, "update", "poll_questions", v.id, { text: v.text, type: v.type, options });
    } else {
      const pos = await q.one<{ n: number }>("select coalesce(max(position),0)+1 as n from poll_questions where event_id=$1", [event.id]);
      const row = await q.one<{ id: string }>(
        "insert into poll_questions (event_id, position, text, type, options) values ($1,$2,$3,$4,$5::jsonb) returning id",
        [event.id, pos!.n, v.text, v.type, JSON.stringify(options)],
      );
      await logStaff(q, event.id, staff, "create", "poll_questions", row!.id, { text: v.text, type: v.type, options });
    }
  });
  await done(event.id, event.slug, [topics.poll(event.id)]);
  return { ok: true };
}

const questionRef = z.object({ slug: slugSchema, id: z.string().uuid(), direction: z.enum(["up", "down"]).optional() });

export async function deleteQuestion(input: unknown): Promise<ActionResult> {
  const parsed = questionRef.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query("delete from poll_questions where id=$1 and event_id=$2", [parsed.data.id, event.id]);
    await logStaff(q, event.id, staff, "delete", "poll_questions", parsed.data.id);
  });
  await done(event.id, event.slug, [topics.poll(event.id)]);
  return { ok: true };
}

export async function moveQuestion(input: unknown): Promise<ActionResult> {
  const parsed = questionRef.safeParse(input);
  if (!parsed.success || !parsed.data.direction) return { ok: false, error: "Invalid request" };
  const { event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  await db.tx(async (q) => {
    const list = await q.query<{ id: string }>("select id from poll_questions where event_id=$1 order by position", [event.id]);
    const i = list.findIndex((x) => x.id === parsed.data.id);
    const j = parsed.data.direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [k, item] of list.entries()) await q.query("update poll_questions set position=$2 where id=$1", [item.id, k + 1]);
  });
  await done(event.id, event.slug, [topics.poll(event.id)]);
  return { ok: true };
}

// Tables -----------------------------------------------------------------------

const addTablesSchema = z.object({ slug: slugSchema, count: z.number().int().min(1).max(40) });

export async function addTables(input: unknown): Promise<ActionResult> {
  const parsed = addTablesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Add between 1 and 40 tables." };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  await db.tx(async (q) => {
    const max = await q.one<{ n: number }>("select coalesce(max(number),0) as n from tables where event_id=$1", [event.id]);
    for (let k = 1; k <= parsed.data.count; k++) {
      const row = await q.one<{ id: string }>(
        "insert into tables (event_id, number, table_token) values ($1,$2,$3) returning id",
        [event.id, max!.n + k, randomToken()],
      );
      await logStaff(q, event.id, staff, "create", "tables", row!.id, { number: max!.n + k });
    }
  });
  await done(event.id, event.slug);
  return { ok: true };
}

const tableFacilitatorSchema = z.object({ slug: slugSchema, tableId: z.string().uuid(), facilitatorId: z.string().uuid().nullable() });

export async function setTableFacilitator(input: unknown): Promise<ActionResult> {
  const parsed = tableFacilitatorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query("update tables set facilitator_id=$3 where id=$1 and event_id=$2", [parsed.data.tableId, event.id, parsed.data.facilitatorId]);
    await logStaff(q, event.id, staff, "set_facilitator", "tables", parsed.data.tableId, { facilitator_id: parsed.data.facilitatorId });
  });
  await done(event.id, event.slug);
  return { ok: true };
}

export async function rotateTableToken(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ slug: slugSchema, tableId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query("update tables set table_token=$3 where id=$1 and event_id=$2", [parsed.data.tableId, event.id, randomToken()]);
    await logStaff(q, event.id, staff, "rotate_token", "tables", parsed.data.tableId);
  });
  await done(event.id, event.slug);
  return { ok: true, message: "New QR code made. Reprint this table card." };
}

// Companies --------------------------------------------------------------------

const companyTableSchema = z.object({ slug: slugSchema, companyId: z.string().uuid(), tableId: z.string().uuid().nullable() });

export async function setCompanyTable(input: unknown): Promise<ActionResult> {
  const parsed = companyTableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query("update companies set table_id=$3 where id=$1 and event_id=$2", [parsed.data.companyId, event.id, parsed.data.tableId]);
    await logStaff(q, event.id, staff, "set_table", "companies", parsed.data.companyId, { table_id: parsed.data.tableId });
  });
  await done(event.id, event.slug, [topics.company(parsed.data.companyId)]);
  return { ok: true };
}

const lockSchema = z.object({ slug: slugSchema, companyId: z.string().uuid(), locked: z.boolean() });

export async function setCompanyLocked(input: unknown): Promise<ActionResult> {
  const parsed = lockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query("update companies set is_locked=$3 where id=$1 and event_id=$2", [parsed.data.companyId, event.id, parsed.data.locked]);
    await logStaff(q, event.id, staff, parsed.data.locked ? "lock" : "unlock", "companies", parsed.data.companyId);
  });
  await done(event.id, event.slug, [topics.company(parsed.data.companyId)]);
  return { ok: true };
}

// Device sessions --------------------------------------------------------------

export async function revokeSession(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ slug: slugSchema, sessionId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  const companyId = await db.tx(async (q) => {
    const row = await q.one<{ company_id: string }>(
      `update device_sessions ds set revoked_at = now() from people p join companies c on c.id = p.company_id
        where ds.id = $1 and ds.person_id = p.id and c.event_id = $2 returning p.company_id`,
      [parsed.data.sessionId, event.id],
    );
    await logStaff(q, event.id, staff, "revoke", "device_sessions", parsed.data.sessionId);
    return row?.company_id;
  });
  await done(event.id, event.slug, companyId ? [topics.company(companyId)] : []);
  return { ok: true };
}

// CSV import -------------------------------------------------------------------

const importRow = z.object({
  company_name: z.string().trim().max(120).optional().default(""),
  person_name: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  role: z.string().trim().max(120).optional().default(""),
  website: z.string().trim().max(200).optional().default(""),
  sector: z.string().trim().max(120).optional().default(""),
  size_band: z.string().trim().max(60).optional().default(""),
  state: z.string().trim().max(60).optional().default(""),
  table_number: z.string().trim().max(10).optional().default(""),
});
const importSchema = z.object({ slug: slugSchema, rows: z.array(importRow).min(1).max(2000) });

function matchSector(raw: string): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const exact = SECTORS.find((x) => x.toLowerCase() === s);
  if (exact) return exact;
  const rules: [RegExp, (typeof SECTORS)[number]][] = [
    [/universit|research institute|institute|research facility|academic|college/, "Research institute or university"],
    [/patent|legal|law firm|attorney|consult|accounting|advisory|professional services/, "Professional services"],
    [/software|saas|data platform|\bai\b|analytics|informatics|it services/, "Software and data"],
    [/cdmo|manufactur/, "Contract manufacturing (CDMO)"],
    [/\bcro\b|contract research|clinical trial/, "Contract research (CRO)"],
    [/medtech|device/, "MedTech and devices"],
    [/diagnos/, "Diagnostics"],
    [/digital health|health ?tech/, "Digital health"],
    [/therap|drug|pharma|biotech|vaccine/, "Therapeutics and drug discovery"],
  ];
  return rules.find(([re]) => re.test(s))?.[1] ?? "Other";
}

function matchState(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  const map: Record<string, string> = {
    QUEENSLAND: "QLD", "NEW SOUTH WALES": "NSW", VICTORIA: "VIC", "SOUTH AUSTRALIA": "SA",
    "WESTERN AUSTRALIA": "WA", TASMANIA: "TAS", "NORTHERN TERRITORY": "NT", "AUSTRALIAN CAPITAL TERRITORY": "ACT",
  };
  const code = map[s] ?? s;
  return (STATES as readonly string[]).includes(code) ? code : "Outside Australia";
}

// Re-imports upsert: companies by name, people by email (or by name within the company
// when there is no email). Blank cells never wipe existing values.
// A person with no company (for example registered with a personal email) gets their own
// placeholder organisation, "Organisation to confirm: Name", flagged for staff. They can
// correct the organisation name on the day.
export async function importRegistrations(input: unknown): Promise<ActionResult & { summary?: Record<string, number> }> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Row ${(parsed.error.issues[0]?.path[1] as number) + 1 || "?"} is not valid. Every row needs a company name.` };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  const summary = { companiesCreated: 0, companiesUpdated: 0, peopleCreated: 0, peopleUpdated: 0, tablesCreated: 0, toConfirm: 0, skipped: 0 };
  await db.tx(async (q) => {
    const tableIds = new Map<number, string>();
    for (const t of await q.query<{ id: string; number: number }>("select id, number from tables where event_id=$1", [event.id])) {
      tableIds.set(t.number, t.id);
    }
    for (const r of parsed.data.rows) {
      const email = r.email && z.string().email().safeParse(r.email).success ? r.email.toLowerCase() : null;
      let companyName = r.company_name;
      const toConfirm = !companyName;
      if (toConfirm) {
        if (!r.person_name && !email) {
          summary.skipped++;
          continue;
        }
        // Already imported before: leave them in whatever organisation they are in now,
        // which may have been corrected on the day.
        const known = email
          ? await q.one<{ id: string }>(
              "select p.id from people p join companies c on c.id = p.company_id where c.event_id=$1 and lower(p.email)=$2",
              [event.id, email],
            )
          : null;
        if (known) {
          await q.query("update people set name=coalesce(nullif($2,''),name), role=coalesce(nullif($3,''),role) where id=$1", [
            known.id, r.person_name, r.role,
          ]);
          summary.peopleUpdated++;
          continue;
        }
        companyName = `${PLACEHOLDER_PREFIX}${r.person_name || email}`.slice(0, 120);
      }
      let tableId: string | null = null;
      const tn = parseInt(r.table_number, 10);
      if (Number.isFinite(tn) && tn > 0 && tn < 1000) {
        tableId = tableIds.get(tn) ?? null;
        if (!tableId) {
          const t = await q.one<{ id: string }>("insert into tables (event_id, number, table_token) values ($1,$2,$3) returning id", [
            event.id, tn, randomToken(),
          ]);
          tableId = t!.id;
          tableIds.set(tn, tableId);
          summary.tablesCreated++;
        }
      }
      const fields = {
        website: r.website || null,
        sector: matchSector(r.sector),
        size_band: normaliseSizeBand(r.size_band),
        state: matchState(r.state),
      };
      const existing = await q.one<{ id: string }>("select id from companies where event_id=$1 and lower(name)=lower($2)", [event.id, companyName]);
      let companyId: string;
      if (existing) {
        companyId = existing.id;
        await q.query(
          `update companies set website=coalesce($2,website), sector=coalesce($3,sector), size_band=coalesce($4,size_band),
             state=coalesce($5,state), table_id=coalesce($6,table_id) where id=$1`,
          [companyId, fields.website, fields.sector, fields.size_band, fields.state, tableId],
        );
        summary.companiesUpdated++;
      } else {
        const c = await q.one<{ id: string }>(
          `insert into companies (event_id, table_id, name, website, sector, size_band, state, flags)
           values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) returning id`,
          [event.id, tableId, companyName, fields.website, fields.sector, fields.size_band, fields.state,
            JSON.stringify(toConfirm ? { org_to_confirm: true } : {})],
        );
        companyId = c!.id;
        if (toConfirm) summary.toConfirm++;
        else summary.companiesCreated++;
      }
      if (!r.person_name && !r.email) continue;
      const person = email
        ? await q.one<{ id: string }>(
            `select p.id from people p join companies c on c.id = p.company_id where c.event_id=$1 and lower(p.email)=$2`,
            [event.id, email],
          )
        : await q.one<{ id: string }>("select id from people where company_id=$1 and lower(name)=lower($2)", [companyId, r.person_name]);
      if (person) {
        await q.query(
          `update people set company_id=$2, name=coalesce(nullif($3,''),name), role=coalesce(nullif($4,''),role),
             email=coalesce($5,email) where id=$1`,
          [person.id, companyId, r.person_name, r.role, email],
        );
        summary.peopleUpdated++;
      } else {
        await q.query("insert into people (company_id, name, role, email) values ($1,$2,$3,$4)", [
          companyId, r.person_name || email || "Unnamed", r.role || null, email,
        ]);
        summary.peopleCreated++;
      }
    }
    await logStaff(q, event.id, staff, "import_csv", "companies", null, { rows: parsed.data.rows.length, ...summary });
  });
  await done(event.id, event.slug);
  return {
    ok: true,
    summary,
    message:
      `Imported ${parsed.data.rows.length} rows: ${summary.companiesCreated} new companies, ${summary.companiesUpdated} updated, ` +
      `${summary.peopleCreated} new people, ${summary.peopleUpdated} updated.` +
      (summary.toConfirm ? ` ${summary.toConfirm} people had no company, so each got an "Organisation to confirm" placeholder.` : "") +
      (summary.skipped ? ` ${summary.skipped} empty rows were skipped.` : ""),
  };
}

// Staff ------------------------------------------------------------------------

const staffSchema = z.object({
  slug: slugSchema,
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(2).max(120),
  role: z.enum(["admin", "facilitator"]),
});

export async function addStaff(input: unknown): Promise<ActionResult> {
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a name, a valid email and a role." };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  await db.tx(async (q) => {
    const row = await q.one<{ id: string }>(
      `insert into staff (email, name, role) values ($1,$2,$3)
       on conflict ((lower(email))) do update set name = excluded.name, role = excluded.role returning id`,
      [parsed.data.email, parsed.data.name, parsed.data.role],
    );
    await logStaff(q, event.id, staff, "upsert", "staff", row!.id, { email: parsed.data.email, role: parsed.data.role });
  });
  revalidatePath(`/console/${event.slug}/setup`);
  return { ok: true, message: `${parsed.data.name} can now sign in with ${parsed.data.email}.` };
}

export async function removeStaff(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ slug: slugSchema, staffId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { staff, event } = await adminEvent(parsed.data.slug);
  if (parsed.data.staffId === staff.id) return { ok: false, error: "You cannot remove yourself." };
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query("delete from staff where id=$1", [parsed.data.staffId]);
    await logStaff(q, event.id, staff, "delete", "staff", parsed.data.staffId);
  });
  revalidatePath(`/console/${event.slug}/setup`);
  return { ok: true };
}

// Privacy requests -------------------------------------------------------------

export async function deletePerson(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ slug: slugSchema, personId: z.string().uuid(), confirmName: z.string() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { staff, event } = await adminEvent(parsed.data.slug);
  const db = await getDb();
  const person = await db.one<{ id: string; name: string; company_id: string }>(
    `select p.id, p.name, p.company_id from people p join companies c on c.id = p.company_id where p.id=$1 and c.event_id=$2`,
    [parsed.data.personId, event.id],
  );
  if (!person) return { ok: false, error: "Person not found" };
  if (person.name.trim().toLowerCase() !== parsed.data.confirmName.trim().toLowerCase()) {
    return { ok: false, error: "Type the person's name exactly to confirm." };
  }
  await db.tx(async (q) => {
    // Cascades remove their device sessions, poll answers and editing markers.
    await q.query("delete from people where id=$1", [person.id]);
    // Remove personal details from the audit trail but keep the record that a deletion happened.
    await q.query("update audit_log set diff = null where actor_id = $1 or entity_id = $1", [person.id]);
    await q.query("update ai_suggestions set input = input - 'person_id' where input->>'person_id' = $1", [person.id]);
    await logStaff(q, event.id, staff, "delete_person_data", "people", person.id, null);
  });
  await done(event.id, event.slug, [topics.company(person.company_id)]);
  return { ok: true, message: "All of this person's data has been deleted." };
}
