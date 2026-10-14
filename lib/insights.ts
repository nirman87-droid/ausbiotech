import "server-only";
import { getDb } from "./db";
import { DATA_READY_LABELS, FIX_TYPES, FIX_TYPE_LABELS, NEXT_CHOICES, NEXT_CHOICE_LABELS, PROBLEM_TYPES, PROBLEM_TYPE_INFO, SECTORS } from "./copy";

// Aggregates for A4. Counts only.
export async function eventInsights(eventId: string) {
  const db = await getDb();
  const count = async (sql: string) =>
    Object.fromEntries((await db.query<{ k: string | null; n: number }>(sql, [eventId])).map((r) => [r.k ?? "", Number(r.n)]));
  const live = "from problems p join companies c on c.id = p.company_id where c.event_id = $1 and p.deleted_at is null";
  const [types, fixes, ready, sectors, leads, choices, consent] = await Promise.all([
    count(`select p.type as k, count(*) as n ${live} group by p.type`),
    count(`select p.fix_type as k, count(*) as n ${live} group by p.fix_type`),
    count(`select p.data_ready::text as k, count(*) as n ${live} group by p.data_ready`),
    count("select sector as k, count(*) as n from companies where event_id = $1 group by sector"),
    count("select coalesce(f.lead_rating, 'unrated') as k, count(*) as n from companies c left join facilitator_notes f on f.company_id = c.id where c.event_id = $1 group by 1"),
    count("select n.choice as k, count(*) as n from next_steps n join companies c on c.id = n.company_id where c.event_id = $1 and n.submitted_at is not null group by n.choice"),
    db.one<{ yes: number; total: number }>(
      "select count(*) filter (where p.marketing_consent) as yes, count(*) as total from people p join companies c on c.id = p.company_id where c.event_id = $1",
      [eventId],
    ),
  ]);
  return {
    problemTypes: [...PROBLEM_TYPES.map((t) => ({ label: PROBLEM_TYPE_INFO[t].label, value: types[t] ?? 0 })), { label: "Not set", value: types[""] ?? 0 }],
    fixTypes: [...FIX_TYPES.map((t) => ({ label: FIX_TYPE_LABELS[t], value: fixes[t] ?? 0 })), { label: "Not set", value: fixes[""] ?? 0 }],
    dataReady: [1, 2, 3, 4, 5].map((n) => ({ label: `${n}: ${DATA_READY_LABELS[n]}`, value: ready[String(n)] ?? 0 })),
    sectors: [...SECTORS.map((s) => ({ label: s, value: sectors[s] ?? 0 })), { label: "Not given", value: sectors[""] ?? 0 }],
    leads: ["hot", "warm", "cold", "unrated"].map((k) => ({ label: k[0].toUpperCase() + k.slice(1), value: leads[k] ?? 0 })),
    nextSteps: NEXT_CHOICES.map((k) => ({ label: NEXT_CHOICE_LABELS[k].label, value: choices[k] ?? 0 })),
    consent: { yes: Number(consent?.yes ?? 0), total: Number(consent?.total ?? 0) },
  };
}
