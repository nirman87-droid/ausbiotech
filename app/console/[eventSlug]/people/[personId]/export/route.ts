import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { audit } from "@/lib/audit";

// Admin: download everything held about one person as JSON (privacy access request).
export async function GET(_req: Request, { params }: { params: Promise<{ eventSlug: string; personId: string }> }) {
  const { eventSlug, personId } = await params;
  const staff = await getStaff();
  if (!staff || staff.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const event = await getEventBySlug(eventSlug);
  if (!event || !/^[0-9a-f-]{36}$/.test(personId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const person = await db.one(
    `select p.*, c.name as company_name from people p join companies c on c.id = p.company_id where p.id = $1 and c.event_id = $2`,
    [personId, event.id],
  );
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [sessions, poll, actions, nextSteps] = await Promise.all([
    db.query("select id, device_label, created_at, last_seen_at, revoked_at from device_sessions where person_id = $1", [personId]),
    db.query(
      "select q.text as question, r.answer, r.updated_at from poll_responses r join poll_questions q on q.id = r.question_id where r.person_id = $1",
      [personId],
    ),
    db.query("select action, entity, entity_id, diff, at from audit_log where actor_id = $1 order by at", [personId]),
    db.query("select * from next_steps where submitted_by = $1", [personId]),
  ]);
  await audit(db, { eventId: event.id, actor: { type: "staff", id: staff.id }, action: "export_person_data", entity: "people", entityId: personId });
  const body = JSON.stringify({ exported_at: new Date().toISOString(), event: event.name, person, sessions, poll, next_steps_submitted: nextSteps, actions }, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="person-${personId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
