// Load check: simulated participants editing at once, then a check that no write was lost.
//
//   npm run load                         60 participants for 10 minutes (the spec's check)
//   npm run load -- --users 60 --minutes 2
//
// It makes a production build in .next-load, starts it on port 3200 with a fresh embedded
// database (event at the problems stage), runs the simulation, stops the server and compares
// every field's last acknowledged value with what is in the database.
//
// Each participant scans a table code, picks a registered name (or adds themselves when
// their company's names are taken), creates one problem and keeps editing its fields every
// 1 to 4 seconds. About 1 in 20 requests is cut off on purpose and retried, like a dropped
// connection.

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../lib/db-core";

const args = process.argv.slice(2);
const arg = (name: string, d: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const USERS = arg("users", 60);
const MINUTES = arg("minutes", 10);
const PORT = 3200;
const BASE = `http://localhost:${PORT}`;
const DB_DIR = ".data/load-db";
const LINKS = ".data/load-links.json";

type Jar = Map<string, string>;
function store(jar: Jar, res: Response) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
const cookie = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function req(jar: Jar, url: string, init: RequestInit = {}) {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  const res = await fetch(`${BASE}${url}`, { ...init, signal, redirect: "manual", headers: { ...(init.headers ?? {}), cookie: cookie(jar) } });
  store(jar, res);
  return res;
}

type User = { n: number; jar: Jar; problemId: string; expected: Record<string, string>; acked: number; retries: number };

async function join(n: number, tablePath: string, claimed: Set<string>): Promise<User> {
  const jar: Jar = new Map();
  await req(jar, tablePath);
  const tableHtml = await (await req(jar, `/${slug}/table`)).text();
  const companyIds = [...new Set([...tableHtml.matchAll(/\/c\/([0-9a-f-]{36})\/who/g)].map((m) => m[1]))];
  // Spread people evenly over the companies at the table (at most 4 problems per company).
  const companyId = companyIds[Math.floor(n / 6) % companyIds.length];
  const whoHtml = await (await req(jar, `/${slug}/c/${companyId}/who`)).text();
  const personIds = [...whoHtml.matchAll(/name="personId" value="([0-9a-f-]{36})"/g)].map((m) => m[1]);
  const free = personIds.find((id) => !claimed.has(id));
  const post = (form: URLSearchParams) =>
    req(jar, "/api/p/session", { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  let res: Response | null = null;
  if (free) {
    claimed.add(free);
    res = await post(new URLSearchParams({ eventSlug: slug, companyId, personId: free }));
  }
  // No free registered name (or it is in use on another device): add a new person, like "Add me".
  if (!res || !jar.has("ucb_session")) {
    res = await post(
      new URLSearchParams({ eventSlug: slug, companyId, newName: `Load Tester ${n}`, newRole: "Tester", newEmail: `load-${n}@load.example` }),
    );
  }
  if (res.status !== 303 || !jar.has("ucb_session")) {
    throw new Error(`user ${n} could not sign in (${res.status} ${res.headers.get("location")})`);
  }
  return { n, jar, problemId: crypto.randomUUID(), expected: {}, acked: 0, retries: 0 };
}

// Sends ops until the server acknowledges them, like the browser's autosave queue.
async function send(u: User, ops: unknown[]) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const drop = Math.random() < 0.05;
    if (drop) setTimeout(() => controller.abort(), Math.random() * 30);
    try {
      const res = await req(u.jar, "/api/p/save", {
        method: "POST",
        body: JSON.stringify({ ops }),
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { results } = (await res.json()) as { results: { ok: boolean; error?: string; permanent?: boolean }[] };
      const bad = results.find((r) => !r.ok);
      if (bad?.permanent) throw Object.assign(new Error(`rejected: ${bad.error}`), { fatal: true });
      if (bad) throw new Error(bad.error);
      return;
    } catch (err: any) {
      if (err?.fatal) throw err;
      u.retries++;
      await sleep(Math.min(5000, 300 * (attempt + 1)));
    }
  }
}

const FIELDS = ["title", "today_state", "future_state", "affected_role"] as const;
let slug = "";

async function simulate(u: User, until: number) {
  // Positions must be unique enough for ordering. They do not need to be exact.
  await send(u, [{ kind: "problem.create", id: u.problemId, position: (u.n % 4) + 1 }]);
  let k = 0;
  while (Date.now() < until) {
    k++;
    const field = FIELDS[k % FIELDS.length];
    const value = field === "title" ? `Load test problem from user ${u.n}, edit ${k}` : `user ${u.n} edit ${k} ${field}`;
    await send(u, [{ kind: "problem.set", id: u.problemId, field, value }]);
    u.expected[field] = value;
    u.acked++;
    await sleep(1000 + Math.random() * 3000);
  }
}

async function waitFor(url: string, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`server did not start: ${url}`);
}

async function loadCheck() {
  console.log(`Preparing a fresh database and starting a server on port ${PORT}...`);
  const env = {
    ...process.env,
    PGLITE_DIR: DB_DIR,
    SEED_LINKS_FILE: LINKS,
    SEED_STAGE: "problems",
    SEED_ACCESS_CLOSES_AT: "2030-01-01T00:00:00+10:00",
    DATABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_DIST_DIR: ".next-load",
    // Production mode without Supabase Auth: allow the dev sign in and a fixed local secret.
    ALLOW_DEV_LOGIN: "1",
  };
  execSync("npx tsx scripts/migrate.ts --reset && npx tsx scripts/seed.ts", { env, stdio: "inherit" });
  if (!args.includes("--no-build")) {
    console.log("Building the app (production mode)...");
    execSync("npx next build", { env, stdio: "ignore" });
  }
  const links = JSON.parse(fs.readFileSync(LINKS, "utf8"));
  slug = links.slug;
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(d));
  const users: User[] = [];
  let total = 0;
  try {
    await waitFor(`${BASE}/privacy`, 180_000);
    const warm: Jar = new Map();
    await req(warm, links.tables[0].path);
    await req(warm, `/${slug}/table`);

    console.log(`Signing in ${USERS} participants...`);
    const claimed = new Set<string>();
    for (let n = 0; n < USERS; n++) users.push(await join(n, links.tables[n % links.tables.length].path, claimed));

    console.log(`Editing for ${MINUTES} minute(s)...`);
    const started = Date.now();
    const until = started + MINUTES * 60_000;
    const ticker = setInterval(() => {
      const acked = users.reduce((s, u) => s + u.acked, 0);
      console.log(`  ${Math.round((Date.now() - started) / 1000)}s: ${acked} edits saved, ${users.reduce((s, u) => s + u.retries, 0)} retries`);
    }, 30_000);
    await Promise.all(users.map((u) => simulate(u, until)));
    clearInterval(ticker);
    total = users.reduce((s, u) => s + u.acked, 0);
    console.log(
      `Done: ${total} edits saved (${(total / (MINUTES * 60)).toFixed(1)} per second), ${users.reduce((s, u) => s + u.retries, 0)} retries after dropped or failed requests.`,
    );
  } finally {
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {}
    await sleep(4000);
  }

  console.log("Checking every field against the database...");
  process.env.PGLITE_DIR = path.resolve(DB_DIR);
  delete process.env.DATABASE_URL;
  const db = await openDb();
  let lost = 0;
  for (const u of users) {
    const row = await db.one<Record<string, string | null>>("select * from problems where id = $1 and deleted_at is null", [u.problemId]);
    if (!row) {
      console.error(`  user ${u.n}: problem missing`);
      lost++;
      continue;
    }
    for (const [field, value] of Object.entries(u.expected)) {
      if (row[field] !== value) {
        console.error(`  user ${u.n}: ${field} is "${row[field]}", expected "${value}"`);
        lost++;
      }
    }
  }
  const audits = await db.one<{ n: number }>("select count(*) as n from audit_log where action = 'update' and entity = 'problems'");
  await db.close();
  console.log(`Audit log has ${audits?.n} problem updates for ${total} acknowledged edits (retries can add a few extra).`);
  if (lost > 0 || (audits?.n ?? 0) < total) {
    console.error(`FAILED: ${lost} lost or mismatched values.`);
    process.exit(1);
  }
  console.log(`PASSED: ${users.length} participants, ${total} edits, no lost writes.`);
}

loadCheck().catch((err) => {
  console.error(err);
  process.exit(1);
});
