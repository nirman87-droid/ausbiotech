import "server-only";
import type { Queryable } from "./db";

export type Actor = { type: "participant" | "staff" | "system"; id: string | null };

// Records one write. Call it inside the same transaction as the change it describes.
export async function audit(
  q: Queryable,
  entry: {
    eventId: string | null;
    actor: Actor;
    action: string;
    entity: string;
    entityId?: string | null;
    diff?: unknown;
  },
) {
  await q.query(
    `insert into audit_log (event_id, actor_type, actor_id, action, entity, entity_id, diff)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      entry.eventId,
      entry.actor.type,
      entry.actor.id,
      entry.action,
      entry.entity,
      entry.entityId ?? null,
      entry.diff === undefined ? null : JSON.stringify(entry.diff),
    ],
  );
}
