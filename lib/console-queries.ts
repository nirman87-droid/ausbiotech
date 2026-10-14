import "server-only";
import { getDb } from "./db";
import { eligibilityFlags, isStuck } from "./rules";
import type { EventRow } from "./types";

export type LiveCompany = {
  id: string;
  name: string;
  sector: string | null;
  size_band: string | null;
  table_id: string | null;
  table_number: number | null;
  facilitator_id: string | null;
  is_locked: boolean;
  is_walk_in: boolean;
  last_activity_at: string | null;
  people: number;
  signed_in: number;
  problems: number;
  valid_problems: number;
  poll_done: boolean;
  shortlist_confirmed: boolean;
  golden_ready: boolean;
  next_submitted: boolean;
  reviewed: boolean;
  lead_rating: string | null;
  duplicate_alert: boolean;
  org_to_confirm: boolean;
  flags: string[];
  progress: number;
};

// Everything A1 needs about every company in one query.
export async function liveCompanies(event: EventRow): Promise<LiveCompany[]> {
  const db = await getDb();
  const rows = await db.query<Omit<LiveCompany, "flags" | "progress">>(
    `select c.id, c.name, c.sector, c.size_band, c.table_id, t.number as table_number, t.facilitator_id,
       c.is_locked, c.is_walk_in, c.last_activity_at, coalesce((c.flags->>'org_to_confirm')::boolean, false) as org_to_confirm,
       (select count(*) from people p where p.company_id = c.id) as people,
       (select count(distinct ds.person_id) from device_sessions ds join people p on p.id = ds.person_id
          where p.company_id = c.id and ds.revoked_at is null) as signed_in,
       (select count(*) from problems pr where pr.company_id = c.id and pr.deleted_at is null) as problems,
       (select count(*) from problems pr where pr.company_id = c.id and pr.deleted_at is null and length(trim(pr.title)) >= 10) as valid_problems,
       exists (select 1 from poll_responses r join people p on p.id = r.person_id where p.company_id = c.id) as poll_done,
       c.shortlist_confirmed_at is not null as shortlist_confirmed,
       exists (select 1 from golden_drafts g where g.company_id = c.id and g.problem_id = c.golden_problem_id
          and coalesce(trim(g.first_project),'') <> '' and coalesce(trim(g.metric),'') <> ''
          and coalesce(trim(g.data_location),'') <> '' and coalesce(trim(g.owner),'') <> '') as golden_ready,
       exists (select 1 from next_steps n where n.company_id = c.id and n.submitted_at is not null) as next_submitted,
       exists (select 1 from shortlist_reviews sr where sr.company_id = c.id) as reviewed,
       (select lead_rating from facilitator_notes fn where fn.company_id = c.id) as lead_rating,
       exists (select 1 from audit_log a join people p on p.id = a.actor_id where p.company_id = c.id
          and a.action = 'duplicate_session' and a.event_id = c.event_id) as duplicate_alert
     from companies c left join tables t on t.id = c.table_id
     where c.event_id = $1
     order by t.number nulls last, c.name`,
    [event.id],
  );
  return rows.map((r) => {
    const flags = [...eligibilityFlags(r.size_band)];
    if (r.org_to_confirm) flags.unshift("org_to_confirm");
    if (!r.table_id) flags.push("no_table");
    if (r.signed_in > 0 && isStuck(r.last_activity_at, event.current_stage, event.stuck_threshold_min)) flags.push("stuck");
    if (r.is_locked) flags.push("locked");
    if (r.duplicate_alert) flags.push("duplicate_session");
    if (r.is_walk_in) flags.push("walk_in");
    const progress = [r.signed_in > 0, r.poll_done, r.valid_problems > 0, r.shortlist_confirmed, r.golden_ready, r.next_submitted].filter(
      Boolean,
    ).length;
    return { ...r, flags, progress };
  });
}
