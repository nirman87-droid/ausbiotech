import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getEventBySlug } from "@/lib/queries";
import { getTablePass, loadParticipant, readSessionId, sessionCookie } from "@/lib/session";
import { isEditingLocked } from "@/lib/rules";
import { notify } from "@/lib/live";
import { topics } from "@/lib/topics";
import { STAGE_INFO } from "@/lib/copy";
import { ACTIVE_WINDOW_MIN } from "@/lib/queries";

// P2: "this is me". Creates a device session for a registered person, or adds an
// unlisted person first ("Add me"). Works as a plain HTML form, so it needs no JavaScript.

const schema = z.object({
  eventSlug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  companyId: z.string().uuid(),
  personId: z.string().uuid().optional(),
  confirm: z.literal("1").optional(),
  newName: z.string().trim().min(2).max(120).optional(),
  newRole: z.string().trim().min(2).max(120).optional(),
  newEmail: z.string().trim().email().max(200).optional(),
});

function back(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: Request) {
  const form = Object.fromEntries(
    [...(await request.formData()).entries()].filter(([, v]) => typeof v === "string" && v !== ""),
  );
  const parsed = schema.safeParse(form);
  const slug = typeof form.eventSlug === "string" ? form.eventSlug : "";
  if (!parsed.success) {
    const companyId = typeof form.companyId === "string" ? form.companyId : "";
    const bad = parsed.error.issues.map((i) => i.path[0]).join(",");
    return back(request, `/${slug}/c/${companyId}/who?error=${encodeURIComponent(bad)}`);
  }
  const input = parsed.data;
  const event = await getEventBySlug(input.eventSlug);
  if (!event) return back(request, `/${input.eventSlug}/no-access`);
  const whoPath = `/${event.slug}/c/${input.companyId}/who`;

  // Only someone who scanned a table code for this event, or who already has a
  // session at this event, may pick a name.
  const pass = await getTablePass();
  const existing = await loadParticipant(await readSessionId());
  const allowed = pass?.eventId === event.id || existing?.event.id === event.id;
  if (!allowed) return back(request, `/${event.slug}/no-access`);

  const db = await getDb();
  const company = await db.one<{ id: string; is_locked: boolean }>(
    "select id, is_locked from companies where id = $1 and event_id = $2",
    [input.companyId, event.id],
  );
  if (!company) return back(request, `/${event.slug}/no-access`);
  if (isEditingLocked(event, company)) return back(request, `${whoPath}?error=closed`);

  let personId = input.personId;
  if (!personId) {
    if (!input.newName || !input.newRole || !input.newEmail) {
      return back(request, `${whoPath}?error=add&add=1`);
    }
    // "Add me": reuse the row if this email is already registered at the company.
    const found = await db.one<{ id: string }>(
      "select id from people where company_id = $1 and lower(email) = lower($2)",
      [company.id, input.newEmail],
    );
    if (found) personId = found.id;
    else {
      const created = await db.tx(async (q) => {
        const row = await q.one<{ id: string }>(
          `insert into people (company_id, name, role, email, is_walk_in) values ($1, $2, $3, $4, true) returning id`,
          [company.id, input.newName, input.newRole, input.newEmail],
        );
        await audit(q, {
          eventId: event.id,
          actor: { type: "participant", id: row!.id },
          action: "create",
          entity: "people",
          entityId: row!.id,
          diff: { name: input.newName, role: input.newRole, email: input.newEmail, walk_in: true },
        });
        return row!;
      });
      personId = created.id;
    }
  }

  const person = await db.one<{ id: string; name: string }>("select id, name from people where id = $1 and company_id = $2", [
    personId,
    company.id,
  ]);
  if (!person) return back(request, `${whoPath}?error=person`);

  // Rule 4: if this person is already working on another device, ask first and alert admin.
  const active = await db.one<{ n: number }>(
    `select count(*) as n from device_sessions where person_id = $1 and revoked_at is null
       and (expires_at is null or expires_at > now()) and last_seen_at > now() - interval '${ACTIVE_WINDOW_MIN} minutes'
       and id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000')`,
    [person.id, existing?.sessionId ?? null],
  );
  const alreadyWorking = (active?.n ?? 0) > 0;
  if (alreadyWorking && !input.confirm) {
    return back(request, `${whoPath}?already=${person.id}`);
  }

  const expires = event.access_closes_at ?? new Date(Date.now() + 12 * 3_600_000);
  const userAgent = request.headers.get("user-agent") ?? "";
  const deviceLabel = userAgent.slice(0, 160);
  const session = await db.tx(async (q) => {
    const row = await q.one<{ id: string }>(
      "insert into device_sessions (person_id, device_label, expires_at) values ($1, $2, $3) returning id",
      [person.id, deviceLabel, new Date(expires).toISOString()],
    );
    await audit(q, {
      eventId: event.id,
      actor: { type: "participant", id: person.id },
      action: alreadyWorking ? "duplicate_session" : "sign_in",
      entity: "device_sessions",
      entityId: row!.id,
      diff: { device: deviceLabel },
    });
    await q.query("update companies set last_activity_at = now() where id = $1", [company.id]);
    return row!;
  });
  await notify([topics.activity(event.id), topics.company(company.id)]);

  const res = back(request, `/${event.slug}/${STAGE_INFO.arrival.path}`);
  res.cookies.set(sessionCookie(session.id, new Date(expires)));
  return res;
}
