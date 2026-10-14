# AI Use Case Builder

The web app for ARM Hub's AI Adopt workshops, built for AusBiotech 2026 on Tuesday 20 October 2026, 2 pm to 5 pm.
Companies scan a table QR code and work through the workshop stage by stage to a golden use
case draft. Afterwards the ARM Hub team turns each draft into a final AI starter plan and sends
it back. The build follows `SPEC.md` (version 0.2).

## Try it on your laptop

You need Node.js 22. No database or accounts are needed: the app uses a built-in database
stored in the `.data` folder.

```bash
npm install
npm run db:reset
npm run dev
```

`db:reset` creates the demo event (6 tables, 21 placeholder companies, 44 people) and prints
the table links. Open one, for example `http://localhost:3000/ausbiotech-2026/t/<token>`.

For the team console go to `http://localhost:3000/console`. Without Supabase set up, the
sign-in page lets you pick "Demo Admin" or "Demo Facilitator". That shortcut never appears in
a production build.

A good first run: open the console Live page in one window and a table link in another. Use
"Open next stage for everyone" and watch the participant screen move on by itself.

## Where things are

| Screen | Address | Code |
|---|---|---|
| P1 Pick your company | `/{event}/t/{tableToken}` then `/{event}/table` | `app/[eventSlug]/t`, `app/[eventSlug]/table` |
| P2 Pick your name | `/{event}/c/{companyId}/who` | `app/[eventSlug]/c/[companyId]/who`, `app/api/p/session` |
| Welcome and confirm details | `/{event}/welcome` | `app/[eventSlug]/(p)/welcome` |
| P3 to P8 | `/{event}/poll`, `problems`, `shortlist`, `golden`, `next`, `done` | `app/[eventSlug]/(p)/...` |
| P9 Final plan | `/plan/{personToken}` | `app/plan/[personToken]` |
| A0 Setup | `/console/{event}/setup` | `app/console/[eventSlug]/setup` |
| A1 Live | `/console/{event}/live` | `app/console/[eventSlug]/live` |
| A2 Company | `/console/{event}/company/{id}` | `app/console/[eventSlug]/company/[id]` |
| A3 Poll screen | `/console/{event}/poll-screen` | `app/console/[eventSlug]/poll-screen` |
| A4 Insights | `/console/{event}/insights` | `app/console/[eventSlug]/insights` |
| A5 Plans | `/console/{event}/plans` | `app/console/[eventSlug]/plans` |

Shared logic lives in `lib/`:

- `lib/rules.ts`: the business rules from spec section 6 (score, shortlist, gating, flags). Unit tested.
- `lib/copy.ts`: fixed lists and participant wording, including the exact consent text.
- `lib/participant-ops.ts`: every participant autosave change, validated with Zod and audited.
- `lib/session.ts`, `lib/staff.ts`: participant sessions and staff sign in.
- `lib/live.ts`, `lib/client/use-live.ts`: realtime updates.
- `lib/client/save-queue.ts`: the autosave queue (600 ms debounce, retry, offline storage).
- `db/migrations/001_init.sql`: the database schema. `db/supabase/rls.sql`: row level security.

## How the important parts work

**Participant access.** The QR code link sets a signed "table pass" cookie. Picking a name
creates a `device_sessions` row and a signed, httpOnly session cookie that ends at the event's
`access_closes_at`. Every participant read and write starts from that session and is scoped to
the session's company on the server. Admin can revoke sessions and lock companies in Setup.

**Autosave.** Each field waits 600 ms, then is sent to `/api/p/save` with any other waiting
changes. Unsent changes are kept in the browser's local storage, so a laptop that sleeps or loses
wifi sends them when it wakes. Failed sends retry with a growing delay. The header shows
"Saving" or "All changes saved".

**Realtime.** After every write the server bumps a version number for the topic (a company, the
event, the poll) and, when Supabase is configured, sends a Supabase Realtime broadcast. Screens
listening to that topic fetch fresh data. Broadcasts carry only a number, never data, so
participants still only read through their own session. Without Supabase, screens check for
new versions every 3 seconds, which is also the safety net if a broadcast is missed. The timer
is calculated in the browser from `timer_ends_at`.

**Teammates editing together.** Last write wins per field. A field someone is typing in is never
overwritten under them. A small "Name is editing" marker shows on the field a teammate has open.

**Facilitator notes** are saved automatically, never shown to participants and never copied
into the plan. The AI plan draft is built from participant answers only.

**AI helpers** are off unless turned on per event in Setup. Suggestions are shown beside the
person's own words and only applied when they press "Use this". Every suggestion is logged in
`ai_suggestions`. The model is `claude-opus-5-5`.

## Checks

```bash
npm run typecheck     # TypeScript
npm run test:unit     # business rules
npm run test:e2e      # Playwright: full journey, teammates, gating, consent, isolation, plans, console
npm run load          # 60 simulated participants for 10 minutes, then checks no write was lost
```

The end-to-end tests and the load check each start their own server with a fresh database, so
stop `npm run dev` first if you are short on memory.

## Going live

1. **Supabase**: create a project in `ap-southeast-2` (Sydney). Copy the connection string
   (pooler, port 6543), the project URL, the anon key and the service role key.
2. **Database**: with `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` set locally, run
   `npm run db:migrate`. This creates the tables and turns on row level security.
3. **Staff**: run `npm run db:seed` only if you want the demo data. Otherwise add staff in the
   Supabase SQL editor (`insert into staff (email, name, role) values (...)`) for the first admin,
   then add the rest from Setup. In Supabase Auth, set the site URL to your `APP_URL` and add
   `APP_URL/console/auth/callback` as a redirect URL.
4. **Vercel**: import the project, set the environment variables from `.env.example`, and keep
   the function region `syd1` (set in `vercel.json`).
5. **Event**: create the event in the console, import the registrations CSV, check the
   companies table, assign facilitators to tables, then print the table cards.
6. **Email**: verify the ARM Hub sending domain in Resend and set `RESEND_API_KEY` and
   `EMAIL_FROM`. Until then emails are logged, not sent.

See `HANDOVER.md` for what still needs a decision from ARM Hub.
