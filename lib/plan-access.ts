import "server-only";
import { getDb } from "./db";
import { readPersonToken } from "./sign";
import { latestSentPlan } from "./plans";
import type { EventRow, FinalPlanRow } from "./types";

// P9 access: a signed personal link (90 days) identifies the person. Only sent plans show.
export async function loadPlanForToken(token: string) {
  const personId = readPersonToken(decodeURIComponent(token));
  if (!personId) return null;
  const db = await getDb();
  const row = await db.one<{ person_id: string; person_name: string; company_id: string; company_name: string; event: EventRow }>(
    `select p.id as person_id, p.name as person_name, c.id as company_id, c.name as company_name, row_to_json(e) as event
       from people p join companies c on c.id = p.company_id join events e on e.id = c.event_id where p.id = $1`,
    [personId],
  );
  if (!row) return null;
  const plan: FinalPlanRow | null = await latestSentPlan(db, row.company_id);
  return { ...row, plan };
}
