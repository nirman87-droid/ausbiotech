// Applies database migrations.
//   npm run db:migrate            apply anything new
//   npm run db:migrate -- --reset wipe the LOCAL embedded database first (refuses on a real database)
import fs from "node:fs";
import path from "node:path";
import { migrate, openDb } from "../lib/db-core";

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset) {
    if (process.env.DATABASE_URL) {
      console.error("--reset only works on the local embedded database. Unset DATABASE_URL first.");
      process.exit(1);
    }
    const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${dir}`);
  }
  const db = await openDb();
  await migrate(db, console.log);
  if (db.kind === "postgres" && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    await db.exec(fs.readFileSync(path.join(process.cwd(), "db", "supabase", "rls.sql"), "utf8"));
    console.log("applied row level security policies");
  }
  await db.close();
  console.log("database is up to date");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
