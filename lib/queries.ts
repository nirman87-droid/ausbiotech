import "server-only";
import { getDb } from "./db";
import type {
  CompanyRow,
  EventRow,
  GoldenDraftRow,
  NextStepsRow,
  PersonRow,
  PollQuestionRow,
  ProblemRow,
  TableRow,
} from "./types";

// Read queries shared by participant and console pages.

export const ACTIVE_WINDOW_MIN = 30;

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  const db = await getDb();
  return db.one<EventRow>("select * from events where slug = $1", [slug]);
}

export async function getTableByToken(eventId: string, token: string): Promise<TableRow | null> {
  if (!token || token.length < 20) return null;
  const db = await getDb();
  return db.one<TableRow>("select * from tables where event_id = $1 and table_token = $2", [eventId, token]);
}

export type CompanyCard = CompanyRow & { table_number: number | null; registered: number; active: number };

const companyCardSql = `
  select c.*, t.number as table_number,
    (select count(*) from people p where p.company_id = c.id) as registered,
    (select count(distinct ds.person_id) from device_sessions ds join people p on p.id = ds.person_id
      where p.company_id = c.id and ds.revoked_at is null
        and (ds.expires_at is null or ds.expires_at > now())
        and ds.last_seen_at > now() - interval '${ACTIVE_WINDOW_MIN} minutes') as active
  from companies c left join tables t on t.id = c.table_id`;

export async function companiesAtTable(tableId: string): Promise<CompanyCard[]> {
  const db = await getDb();
  return db.query<CompanyCard>(`${companyCardSql} where c.table_id = $1 order by c.name`, [tableId]);
}

export async function searchCompanies(eventId: string, q: string): Promise<CompanyCard[]> {
  const db = await getDb();
  const term = q.trim();
  if (term.length < 2) return [];
  return db.query<CompanyCard>(
    `${companyCardSql} where c.event_id = $1 and c.name ilike $2 order by c.name limit 12`,
    [eventId, `%${term.replace(/[%_]/g, "")}%`],
  );
}

export async function getCompany(eventId: string, companyId: string): Promise<CompanyCard | null> {
  if (!/^[0-9a-f-]{36}$/.test(companyId)) return null;
  const db = await getDb();
  return db.one<CompanyCard>(`${companyCardSql} where c.event_id = $1 and c.id = $2`, [eventId, companyId]);
}

export type PersonWithActivity = PersonRow & { active: boolean };

export async function peopleForCompany(companyId: string): Promise<PersonWithActivity[]> {
  const db = await getDb();
  return db.query<PersonWithActivity>(
    `select p.*, exists (select 1 from device_sessions ds where ds.person_id = p.id and ds.revoked_at is null
        and (ds.expires_at is null or ds.expires_at > now())
        and ds.last_seen_at > now() - interval '${ACTIVE_WINDOW_MIN} minutes') as active
       from people p where p.company_id = $1 order by p.is_walk_in, p.name`,
    [companyId],
  );
}

export async function problemsForCompany(companyId: string): Promise<ProblemRow[]> {
  const db = await getDb();
  return db.query<ProblemRow>(
    "select * from problems where company_id = $1 and deleted_at is null order by position, created_at",
    [companyId],
  );
}

export async function goldenDraftsForCompany(companyId: string): Promise<GoldenDraftRow[]> {
  const db = await getDb();
  return db.query<GoldenDraftRow>("select * from golden_drafts where company_id = $1", [companyId]);
}

export async function nextStepsForCompany(companyId: string): Promise<NextStepsRow | null> {
  const db = await getDb();
  return db.one<NextStepsRow>("select * from next_steps where company_id = $1", [companyId]);
}

export async function pollQuestions(eventId: string): Promise<PollQuestionRow[]> {
  const db = await getDb();
  return db.query<PollQuestionRow>("select * from poll_questions where event_id = $1 order by position", [eventId]);
}

export async function pollAnswersForPerson(personId: string): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.query<{ question_id: string; answer: string }>(
    "select question_id, answer from poll_responses where person_id = $1",
    [personId],
  );
  return Object.fromEntries(rows.map((r) => [r.question_id, r.answer]));
}

export type EditingMarker = { person_id: string; name: string; field_key: string };

// Teammates editing a field right now (refreshed every 15 seconds while a field has focus).
export async function editingMarkers(companyId: string, exceptPersonId: string): Promise<EditingMarker[]> {
  const db = await getDb();
  return db.query<EditingMarker>(
    `select m.person_id, p.name, m.field_key from editing_markers m join people p on p.id = m.person_id
      where m.company_id = $1 and m.person_id <> $2 and m.updated_at > now() - interval '30 seconds'`,
    [companyId, exceptPersonId],
  );
}

export async function shortlistReview(companyId: string) {
  const db = await getDb();
  return db.one<{ reviewed_at: Date; staff_name: string | null }>(
    `select r.reviewed_at, s.name as staff_name from shortlist_reviews r left join staff s on s.id = r.staff_id
      where r.company_id = $1 order by r.reviewed_at desc limit 1`,
    [companyId],
  );
}
