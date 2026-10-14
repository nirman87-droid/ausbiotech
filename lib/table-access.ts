import "server-only";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { getEventBySlug } from "./queries";
import { getParticipant, getTablePass } from "./session";
import type { EventRow, TableRow } from "./types";

// P1 and P2 need a table pass (from the QR code) or an existing session at this event.
export async function requireTableAccess(slug: string): Promise<{ event: EventRow; table: TableRow | null }> {
  const event = await getEventBySlug(slug);
  if (!event) redirect(`/${slug}/no-access`);
  const pass = await getTablePass();
  const db = await getDb();
  if (pass?.eventId === event.id) {
    const table = await db.one<TableRow>("select * from tables where id = $1 and event_id = $2", [pass.tableId, event.id]);
    if (table) return { event, table };
  }
  const ctx = await getParticipant(slug);
  if (ctx) return { event, table: ctx.table };
  redirect(`/${slug}/no-access`);
}
