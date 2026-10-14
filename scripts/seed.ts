// Creates the demo event: 6 tables, 21 placeholder companies, 44 people,
// the default poll questions and two staff users.
//
//   npm run db:seed              create the demo event (skips if it already exists)
//   npm run db:seed -- --force   delete and recreate the demo event
//
// All names are placeholders. Emails use the reserved .example domain so nothing can be sent.
// Table links are printed and saved to .data/seed-links.json.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { migrate, openDb } from "../lib/db-core";
import { DEFAULT_POLL } from "../lib/copy";

const SLUG = process.env.SEED_SLUG ?? "ausbiotech-2026";

const SECTORS = [
  "Therapeutics and drug discovery",
  "MedTech and devices",
  "Diagnostics",
  "Digital health",
  "Contract research (CRO)",
  "Contract manufacturing (CDMO)",
  "Other",
];
const SIZES = ["1-19", "20-49", "50-199", "1-19", "20-49", null, "200+"];
const STATES = ["QLD", "NSW", "VIC", "QLD", "SA", "WA", "QLD"];
const FIRST = ["Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Quinn", "Drew", "Robin"];
const LAST = ["Nguyen", "Smith", "Patel", "Chen", "Williams", "Kelly", "Singh", "Brown", "Wilson", "Taylor"];
const ROLES = ["CEO", "Head of Quality", "Lab Manager", "Operations Lead", "Data Scientist", "CTO"];

function token() {
  return crypto.randomBytes(18).toString("base64url");
}

async function main() {
  const force = process.argv.includes("--force");
  const db = await openDb();
  await migrate(db);

  const existing = await db.one<{ id: string }>("select id from events where slug = $1", [SLUG]);
  if (existing && !force) {
    console.log(`Event "${SLUG}" already exists. Use --force to recreate it.`);
    await db.close();
    return;
  }

  const links = await db.tx(async (q) => {
    if (existing) await q.query("delete from events where id = $1", [existing.id]);

    const staff = [
      { email: "admin@armhub.example", name: "Demo Admin", role: "admin" },
      { email: "facilitator@armhub.example", name: "Demo Facilitator", role: "facilitator" },
    ];
    const staffIds: string[] = [];
    for (const s of staff) {
      const row = await q.one<{ id: string }>(
        `insert into staff (email, name, role) values ($1, $2, $3)
         on conflict ((lower(email))) do update set name = excluded.name returning id`,
        [s.email, s.name, s.role],
      );
      staffIds.push(row!.id);
    }

    const closes = process.env.SEED_ACCESS_CLOSES_AT ?? "2026-10-20T18:00:00+10:00";
    const event = await q.one<{ id: string }>(
      `insert into events (slug, name, venue, starts_at, access_opens_at, access_closes_at, plans_due_date, status, booking_url, current_stage, poll_open)
       values ($1, $2, $3, $4, $5, $6, $7, 'live', $8, $9, $9 = 'poll') returning id`,
      [
        SLUG,
        "AusBiotech 2026 AI Use Case Workshop",
        "Gold Coast Convention and Exhibition Centre",
        "2026-10-20T14:00:00+10:00", // Tuesday 20 October, 2 pm to 5 pm
        "2026-10-20T13:30:00+10:00",
        closes,
        "2026-10-27" /* 5 working days after the workshop */,
        null,
        process.env.SEED_STAGE ?? "arrival",
      ],
    );
    const eventId = event!.id;

    for (const [i, pq] of DEFAULT_POLL.entries()) {
      await q.query(
        "insert into poll_questions (event_id, position, text, type, options) values ($1, $2, $3, $4, $5::jsonb)",
        [eventId, i + 1, pq.text, pq.type, JSON.stringify(pq.options)],
      );
    }

    const tableIds: string[] = [];
    const tableLinks: { table: number; token: string; path: string }[] = [];
    for (let n = 1; n <= 6; n++) {
      const t = token();
      const row = await q.one<{ id: string }>(
        "insert into tables (event_id, number, table_token, facilitator_id) values ($1, $2, $3, $4) returning id",
        [eventId, n, t, n <= 3 ? staffIds[1] : null],
      );
      tableIds.push(row!.id);
      tableLinks.push({ table: n, token: t, path: `/${SLUG}/t/${t}` });
    }

    // 21 companies over 6 tables (4, 4, 4, 3, 3, 3). 44 people: 2 each, plus 1 extra at two companies.
    const perTable = [4, 4, 4, 3, 3, 3];
    let c = 0;
    let people = 0;
    for (const [ti, count] of perTable.entries()) {
      for (let k = 0; k < count; k++) {
        const letter = String.fromCharCode(65 + c); // A..U
        const sector = SECTORS[c % SECTORS.length];
        const name = `Demo ${sector.split(" ")[0]} ${letter}`;
        const slugName = name.toLowerCase().replace(/[^a-z]+/g, "-");
        const company = await q.one<{ id: string }>(
          `insert into companies (event_id, table_id, name, website, sector, size_band, state)
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [eventId, tableIds[ti], name, `https://${slugName}.example`, sector, SIZES[c % SIZES.length], STATES[c % STATES.length]],
        );
        const size = c === 0 || c === 7 ? 3 : 2;
        for (let p = 0; p < size; p++) {
          const first = FIRST[(c * 2 + p) % FIRST.length];
          const last = LAST[(c + p * 3) % LAST.length];
          await q.query("insert into people (company_id, name, role, email) values ($1, $2, $3, $4)", [
            company!.id,
            `${first} ${last}`,
            ROLES[(c + p) % ROLES.length],
            `${first}.${last}@${slugName}.example`.toLowerCase(),
          ]);
          people++;
        }
        c++;
      }
    }
    console.log(`Created ${c} companies and ${people} people at 6 tables.`);
    return tableLinks;
  });

  const linksFile = process.env.SEED_LINKS_FILE ?? path.join(process.cwd(), ".data", "seed-links.json");
  fs.mkdirSync(path.dirname(linksFile), { recursive: true });
  fs.writeFileSync(linksFile, JSON.stringify({ slug: SLUG, tables: links }, null, 2));
  console.log("Table links:");
  for (const l of links) console.log(`  Table ${l.table}: ${l.path}`);
  console.log("Staff: admin@armhub.example (admin), facilitator@armhub.example (facilitator)");
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
