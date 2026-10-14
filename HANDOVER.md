# Handover: decisions and checks before 20 October

Things the build could not settle on its own. Nothing here has been filled in with a guess:
where a value was unknown it is either left out of the page or clearly marked as demo data.

## Needs accounts or credentials (ARM Hub)

1. **Supabase project** in `ap-southeast-2` (Sydney). Staff sign in and realtime broadcasts
   switch on automatically once the four Supabase variables are set. Not yet tested against a
   real Supabase project: locally the app ran on its built-in database, dev sign in and polling.
2. **Vercel project** with the variables from `.env.example`. `vercel.json` pins functions to `syd1`.
3. **Resend** (or Postmark) with a verified ARM Hub sending domain. Until `RESEND_API_KEY` is set,
   plan emails are written to the `email_outbox` table and the server log, not sent.
4. **HubSpot private app token** with CRM scopes for companies, contacts, notes and tasks.
   The sync code follows HubSpot's v3/v4 CRM API but has not been run against a real portal.
   Do a first run on a HubSpot test portal.
5. **Anthropic API key**, only if the AI helpers will be used (see item 9).

## Needs a decision or review

6. **Privacy statement** (`app/privacy/page.tsx`): needs review by ARM Hub's privacy or legal
   contact. Set `PRIVACY_CONTACT_EMAIL` once confirmed. Nothing is shown in its place until then.
7. **Consent wording** (`lib/copy.ts`, `CONSENT_TEXT`): written for this build. Confirm it. The
   exact text is stored with each consent, so change it before the event, not during. It says
   "funding options" rather than naming AI Adopt, because many attendees may not be eligible.
8. **HubSpot lead status mapping** (`lib/hubspot.ts`, `LEAD_STATUS_MAP`): currently
   hot → IN_PROGRESS, warm → OPEN, cold → BAD_TIMING. Confirm against ARM Hub's HubSpot setup.
9. **AI and data residency.** The spec says data stays in Australia. The Anthropic API is not
   hosted in Australia, so the AI helpers send workshop text overseas when switched on. They are
   off by default per event, and the Setup page and privacy statement both say this. Decide
   whether to use them at AusBiotech.
10. **Workshop wording written for this build**, all in `lib/copy.ts`: the four default poll
    questions, the discovery guide prompts, frequency options, data ready and value labels,
    approval levels, start timings and next step choices. Read them through with the facilitators.
11. **Event settings**: the demo seed runs 2 pm to 5 pm on Tuesday 20 October, opens access at
    1:30 pm, locks editing at 6 pm, and sets the plans due date to Tuesday 27 October (5 working
    days later). It has no booking link. Set the real values in Setup. The "Book a follow-up" button is hidden until a
    booking link is set.

## Choices made in the build (worth knowing)

- **Changes after reviewing the attendee list (20 October event):**
  - CSV rows with a person but no company (personal email registrations) get their own
    placeholder organisation, "Organisation to confirm: Name", flagged on Live and Setup. The
    person is asked for the real name on the Welcome page, and the flag clears once they give it.
    Re-importing never pulls them back into a placeholder.
  - Participants can correct their own name on the Welcome page (names guessed from emails).
  - The P7 choice is "Explore funding options", not "Explore AI Adopt funding".
  - Three sectors were added: Research institute or university, Professional services, and
    Software and data.
  - Participant wording says "organisation" rather than "company". Staff screens still say company.

- **Realtime uses Supabase broadcast pings, not row change streams.** Participants are not
  Supabase users, so letting their browsers subscribe to table changes would need the anon key
  to read rows. Instead the server sends a "this changed" ping with no data and the screen
  re-fetches through its own scoped session. Every screen also checks every 3 seconds (20 with
  Supabase) so a missed ping only delays an update.
- **The server connects to Postgres directly** and enforces participant scoping in code. Row
  level security (`db/supabase/rls.sql`) is on for every table so the public anon key can read
  nothing, and signed-in staff get read access, as the spec asks.
- **A Welcome page covers the arrival stage.** After picking their name, people confirm company
  details and their role there (the "confirm" half of P2) while the room settles.
- **Additions to the data model**, needed to run the spec: `companies.golden_problem_id`,
  `shortlist_confirmed_at`, `last_activity_at`, `hubspot_note_id`, `hubspot_task_id`;
  `events.booking_url` and `venue`; `device_sessions.expires_at`; and three supporting tables:
  `email_outbox` (every email sent), `live_versions` (realtime counters) and `editing_markers`
  (who is typing where).
- **Audit log**: every participant and staff write is recorded. Presence markers and "last seen"
  times are not, as they are not changes to anyone's data.
- **Deleting a person** (Setup, Privacy requests) removes their row, sessions and poll answers,
  and blanks the details of their entries in the audit log while keeping the record that a
  deletion happened.
- **One-page PDF**: the plan fields have character limits sized to fit one A4 page. Very long
  text in every field at once could still spill onto a second page.
- **"Email to my team" on P9** opens the person's own email app with a short message. It does not
  forward their personal link, because that link is just for them.

## Verified locally

- `npm run typecheck` and a production `next build`: clean.
- `npm run test:unit`: 12 tests on the business rules.
- `npm run test:e2e`: the P1 to P8 journey, two teammates editing at once, stage gating (page
  and API), the consent rule, company isolation (including forged cookies), the plan review to
  P9 flow, poll screen privacy, CSV import and re-import, exports, notes and the HubSpot preview.
- `npm run load`: 60 simulated participants editing for 10 minutes on a production build:
  14,329 edits (about 24 a second), 185 retries after deliberately dropped requests, and no lost
  writes. This used the built-in database, not Supabase, so repeat it against the Supabase
  project before the event (set `DATABASE_URL` and adapt the script's final check).
- Participant pages checked at phone width (375 px) with no sideways scrolling.
