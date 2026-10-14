import "server-only";
import { migrate, openDb, type Db } from "./db-core";

export type { Db, Queryable } from "./db-core";

// One database connection for the whole server process. Stored on globalThis so
// hot reloads in development do not open a second copy of the embedded database.
const g = globalThis as unknown as { __ucbDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__ucbDb) {
    g.__ucbDb = (async () => {
      const db = await openDb();
      // The embedded database is created on first use, so bring its schema up to date.
      if (db.kind === "pglite") await migrate(db);
      return db;
    })();
    g.__ucbDb.catch(() => {
      g.__ucbDb = undefined;
    });
  }
  return g.__ucbDb;
}
