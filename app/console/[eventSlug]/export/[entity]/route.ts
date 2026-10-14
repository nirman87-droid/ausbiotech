import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { audit } from "@/lib/audit";

// A4: CSV downloads, one per entity plus one combined file (a row per company).
const QUERIES: Record<string, string> = {
  companies: `select c.id, c.name, t.number as table_number, c.website, c.sector, c.size_band, c.state, c.is_walk_in, c.is_locked,
      c.shortlist_confirmed_at, c.last_activity_at, c.hubspot_company_id, c.created_at
    from companies c left join tables t on t.id = c.table_id where c.event_id = $1 order by c.name`,
  people: `select p.id, c.name as company, p.name, p.role, p.email, p.is_walk_in, p.marketing_consent, p.consent_text, p.consent_at, p.hubspot_contact_id
    from people p join companies c on c.id = p.company_id where c.event_id = $1 order by c.name, p.name`,
  problems: `select pr.id, c.name as company, pr.position, pr.title, pr.today_state, pr.future_state, pr.type, pr.affected_role, pr.frequency,
      pr.data_ready, pr.value, pr.fix_type, pr.builds_foundation, pr.score, pr.shortlisted, pr.shortlist_overridden
    from problems pr join companies c on c.id = pr.company_id where c.event_id = $1 and pr.deleted_at is null order by c.name, pr.position`,
  golden_drafts: `select g.id, c.name as company, pr.title as problem, (c.golden_problem_id = g.problem_id) as selected, g.first_project, g.metric,
      g.baseline, g.target, g.data_location, g.sample_access, g.approval_level, g.owner, g.check_mvp, g.check_collab, g.check_metric, g.check_data, g.saved_at
    from golden_drafts g join companies c on c.id = g.company_id join problems pr on pr.id = g.problem_id where c.event_id = $1 order by c.name`,
  next_steps: `select c.name as company, n.choice, n.start_timing, n.extra_contact, p.name as submitted_by, n.submitted_at
    from next_steps n join companies c on c.id = n.company_id left join people p on p.id = n.submitted_by where c.event_id = $1 order by c.name`,
  poll_responses: `select q.text as question, r.answer, c.name as company, r.updated_at
    from poll_responses r join poll_questions q on q.id = r.question_id join people p on p.id = r.person_id join companies c on c.id = p.company_id
    where q.event_id = $1 order by q.position, c.name`,
  facilitator_notes: `select c.name as company, f.decision_maker, f.lead_rating, f.funding_fit, f.signals, f.notes, f.next_action, f.action_owner, f.action_due,
      s.name as updated_by, f.updated_at
    from facilitator_notes f join companies c on c.id = f.company_id left join staff s on s.id = f.updated_by where c.event_id = $1 order by c.name`,
  final_plans: `select c.name as company, fp.version, fp.status, fp.title, fp.first_project, fp.metric, fp.baseline, fp.target, fp.recommendation, fp.risks,
      fp.sent_at, fp.opened_at
    from final_plans fp join companies c on c.id = fp.company_id where c.event_id = $1 order by c.name, fp.version`,
  combined: `select c.name as company, t.number as table_number, c.sector, c.size_band, c.state,
      (select count(*) from people p where p.company_id = c.id) as people,
      (select count(*) from people p where p.company_id = c.id and p.marketing_consent) as consented,
      (select string_agg(p.name || ' <' || coalesce(p.email,'') || '>', '; ') from people p where p.company_id = c.id and p.marketing_consent) as consented_contacts,
      (select count(*) from problems pr where pr.company_id = c.id and pr.deleted_at is null) as problems,
      gp.title as golden_problem, gd.first_project, gd.metric, gd.baseline, gd.target, gd.data_location, gd.owner,
      n.choice as next_step, n.start_timing, n.submitted_at as next_submitted_at,
      f.lead_rating, f.decision_maker, f.funding_fit, f.next_action, f.action_owner, f.action_due,
      (select status from final_plans fp where fp.company_id = c.id order by version desc limit 1) as plan_status
    from companies c left join tables t on t.id = c.table_id
    left join problems gp on gp.id = c.golden_problem_id
    left join golden_drafts gd on gd.company_id = c.id and gd.problem_id = c.golden_problem_id
    left join next_steps n on n.company_id = c.id
    left join facilitator_notes f on f.company_id = c.id
    where c.event_id = $1 order by t.number nulls last, c.name`,
};

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Stop spreadsheet apps running a cell as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: Promise<{ eventSlug: string; entity: string }> }) {
  const { eventSlug, entity } = await params;
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (staff.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const sql = QUERIES[entity];
  const event = await getEventBySlug(eventSlug);
  if (!sql || !event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(sql, [event.id]);
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
  await audit(db, { eventId: event.id, actor: { type: "staff", id: staff.id }, action: "export_csv", entity, entityId: null, diff: { rows: rows.length } });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-${entity}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
