import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { sign, unsign } from "./sign";
import { env } from "./env";
import type { CompanyRow, EventRow, PersonRow, TableRow } from "./types";

// Participant sessions (spec section 4).
// * Scanning a table QR code sets a "table pass" cookie for that event and table.
// * Picking a name creates a device_sessions row and a signed session cookie.
// Every participant read and write starts from getParticipant(), which scopes
// everything to the session's company.

export const SESSION_COOKIE = "ucb_session";
export const TABLE_COOKIE = "ucb_table";

export type Participant = {
  sessionId: string;
  person: PersonRow;
  company: CompanyRow;
  event: EventRow;
  table: TableRow | null;
};

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.isProduction,
  path: "/",
};

export function tablePassCookie(eventId: string, tableId: string, expires: Date | null) {
  return {
    name: TABLE_COOKIE,
    value: sign(`${eventId}:${tableId}`),
    ...cookieBase,
    expires: expires && expires.getTime() > Date.now() ? expires : new Date(Date.now() + 12 * 3_600_000),
  };
}

export async function getTablePass(): Promise<{ eventId: string; tableId: string } | null> {
  const jar = await cookies();
  const value = unsign(jar.get(TABLE_COOKIE)?.value);
  if (!value) return null;
  const [eventId, tableId] = value.split(":");
  return eventId && tableId ? { eventId, tableId } : null;
}

export function sessionCookie(sessionId: string, expires: Date | null) {
  return {
    name: SESSION_COOKIE,
    value: sign(sessionId),
    ...cookieBase,
    expires: expires ?? new Date(Date.now() + 12 * 3_600_000),
  };
}

export async function readSessionId(): Promise<string | null> {
  const jar = await cookies();
  return unsign(jar.get(SESSION_COOKIE)?.value);
}

export async function loadParticipant(sessionId: string | null): Promise<Participant | null> {
  if (!sessionId || !/^[0-9a-f-]{36}$/.test(sessionId)) return null;
  const db = await getDb();
  const row = await db.one<{ s: any; p: PersonRow; c: CompanyRow; e: EventRow; t: TableRow | null }>(
    `select row_to_json(ds) as s, row_to_json(p) as p, row_to_json(c) as c, row_to_json(e) as e,
            case when t.id is null then null else row_to_json(t) end as t
       from device_sessions ds
       join people p on p.id = ds.person_id
       join companies c on c.id = p.company_id
       join events e on e.id = c.event_id
       left join tables t on t.id = c.table_id
      where ds.id = $1 and ds.revoked_at is null
        and (ds.expires_at is null or ds.expires_at > now())`,
    [sessionId],
  );
  if (!row) return null;
  // row_to_json returns timestamps as strings. Turn the ones we compare into Dates.
  const e = row.e as any;
  for (const k of ["starts_at", "access_opens_at", "access_closes_at", "timer_ends_at"]) {
    if (e[k]) e[k] = new Date(e[k]);
  }
  // Keep last_seen_at fresh, at most once a minute, so "active" counts are accurate.
  if (Date.now() - new Date(row.s.last_seen_at).getTime() > 60_000) {
    await db.query("update device_sessions set last_seen_at = now() where id = $1", [sessionId]);
  }
  return { sessionId, person: row.p, company: row.c, event: row.e, table: row.t };
}

export async function getParticipant(eventSlug?: string): Promise<Participant | null> {
  const p = await loadParticipant(await readSessionId());
  if (!p) return null;
  if (eventSlug && p.event.slug !== eventSlug) return null;
  return p;
}

export async function requireParticipant(eventSlug: string): Promise<Participant> {
  const p = await getParticipant(eventSlug);
  if (!p) redirect(`/${eventSlug}/no-access`);
  return p;
}
