// Database access shared by the app and the scripts.
//
// Two backends with the same interface:
// * DATABASE_URL set: real Postgres (Supabase in production) through node-postgres.
// * otherwise: PGlite, an embedded Postgres that stores its files in PGLITE_DIR.
//   This lets the whole app run on a laptop with no database server installed.
//
// Write plain SQL with $1, $2 placeholders. Pass jsonb values through JSON.stringify
// and cast them with ::jsonb so both backends behave the same.

import fs from "node:fs";
import path from "node:path";

export type Params = unknown[];

export interface Queryable {
  query<T = Record<string, any>>(text: string, params?: Params): Promise<T[]>;
  one<T = Record<string, any>>(text: string, params?: Params): Promise<T | null>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: "postgres" | "pglite";
}

function wrap(run: (text: string, params?: Params) => Promise<any[]>): Queryable {
  return {
    query: run as Queryable["query"],
    one: async (text, params) => {
      const rows = await run(text, params);
      return (rows[0] as any) ?? null;
    },
  };
}

async function createPostgres(url: string): Promise<Db> {
  const pgModule = await import("pg");
  const { Pool, types } = pgModule.default ?? pgModule;
  // Return dates as "YYYY-MM-DD" text and counts as numbers, the same as PGlite below.
  types.setTypeParser(1082, (v: string) => v);
  types.setTypeParser(20, (v: string) => Number(v));
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  const base = wrap(async (text, params) => (await pool.query(text, params as any[])).rows);
  return {
    ...base,
    kind: "postgres",
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn(wrap(async (t, p) => (await client.query(t, p as any[])).rows));
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

async function createPglite(dir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
  const parsers = { 1082: (v: string) => v, 20: (v: string) => Number(v) };
  const pg = dir === "memory://" ? new PGlite({ parsers }) : new PGlite(dir, { parsers });
  await pg.waitReady;
  const base = wrap(async (text, params) => (await pg.query(text, params as any[])).rows as any[]);
  return {
    ...base,
    kind: "pglite",
    async tx(fn) {
      return pg.transaction(async (t) =>
        fn(wrap(async (text, params) => (await t.query(text, params as any[])).rows as any[])),
      );
    },
    async exec(sql) {
      await pg.exec(sql);
    },
    async close() {
      await pg.close();
    },
  };
}

export async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return createPostgres(url);
  return createPglite(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
}

// Applies any SQL files in db/migrations that have not run yet, in name order.
export async function migrate(db: Db, log: (msg: string) => void = () => {}) {
  await db.exec(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await db.exec(`begin;\n${sql}\ninsert into schema_migrations (name) values ('${file}');\ncommit;`);
    log(`applied ${file}`);
  }
}
