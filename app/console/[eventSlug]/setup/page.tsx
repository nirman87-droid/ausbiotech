import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { normaliseWeights } from "@/lib/rules";
import { toLocalInput } from "@/lib/format";
import { SettingsForm } from "./SettingsForm";
import { CompaniesPanel, CsvImport, PollEditor, PrivacyPanel, SessionsPanel, StaffPanel, TablesPanel } from "./SetupPanels";

export const metadata: Metadata = { title: "Setup" };

const SECTIONS = [
  ["settings", "Settings"],
  ["poll", "Poll questions"],
  ["import", "Import registrations"],
  ["tables", "Tables and QR cards"],
  ["companies", "Companies"],
  ["sessions", "Device sessions"],
  ["staff", "Team"],
  ["privacy", "Privacy requests"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 border-t border-line pt-6">
      <h2 id={`${id}-title`} className="mb-4 text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// A0: event setup. Admin only.
export default async function SetupPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const me = await requireStaff("admin");
  const event = await getEventBySlug(eventSlug);
  if (!event) notFound();
  const db = await getDb();
  const [questions, tables, staff, companies, sessions, people] = await Promise.all([
    db.query(
      `select q.id, q.text, q.type, q.options, (select count(*) from poll_responses r where r.question_id = q.id) as responses
         from poll_questions q where q.event_id = $1 order by q.position`,
      [event.id],
    ),
    db.query(
      `select t.id, t.number, t.table_token, t.facilitator_id, (select count(*) from companies c where c.table_id = t.id) as companies
         from tables t where t.event_id = $1 order by t.number`,
      [event.id],
    ),
    db.query("select id, name, email, role from staff order by role, name"),
    db.query(
      `select c.id, c.name, c.table_id, c.size_band, c.is_locked, c.is_walk_in, s.name as facilitator_name,
         coalesce((c.flags->>'org_to_confirm')::boolean, false) as org_to_confirm,
         (select count(*) from people p where p.company_id = c.id) as people
         from companies c left join tables t on t.id = c.table_id left join staff s on s.id = t.facilitator_id
        where c.event_id = $1 order by c.name`,
      [event.id],
    ),
    db.query(
      `select ds.id, p.name as person, c.name as company, ds.device_label, ds.last_seen_at, ds.created_at
         from device_sessions ds join people p on p.id = ds.person_id join companies c on c.id = p.company_id
        where c.event_id = $1 and ds.revoked_at is null and (ds.expires_at is null or ds.expires_at > now())
        order by ds.last_seen_at desc`,
      [event.id],
    ),
    db.query(
      `select p.id, p.name, p.email, c.name as company from people p join companies c on c.id = p.company_id
        where c.event_id = $1 order by p.name`,
      [event.id],
    ),
  ]);
  const h = await headers();
  const origin = h.get("x-forwarded-host") ? `https://${h.get("x-forwarded-host")}` : env.appUrl.replace(/\/$/, "") || `http://${h.get("host")}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
      <nav aria-label="Setup sections" className="no-print lg:sticky lg:top-4 lg:h-fit">
        <h1 className="text-3xl font-semibold">Setup</h1>
        <ul className="mt-4 grid gap-1">
          {SECTIONS.map(([id, label]) => (
            <li key={id}><a className="link text-sm" href={`#${id}`}>{label}</a></li>
          ))}
        </ul>
      </nav>
      <div className="grid min-w-0 gap-10">
        <Section id="settings" title="Settings">
          <SettingsForm
            slug={event.slug}
            values={{
              name: event.name,
              venue: event.venue ?? "",
              starts_at: toLocalInput(event.starts_at),
              access_opens_at: toLocalInput(event.access_opens_at),
              access_closes_at: toLocalInput(event.access_closes_at),
              plans_due_date: event.plans_due_date ? String(event.plans_due_date) : "",
              booking_url: event.booking_url ?? "",
              ai_enabled: event.ai_enabled,
              weights: normaliseWeights(event.score_weights),
              stuck_threshold_min: event.stuck_threshold_min,
              status: event.status,
            }}
          />
        </Section>
        <Section id="poll" title="Poll questions"><PollEditor slug={event.slug} questions={questions as any} /></Section>
        <Section id="import" title="Import registrations"><CsvImport slug={event.slug} /></Section>
        <Section id="tables" title="Tables and QR cards"><TablesPanel slug={event.slug} tables={tables as any} staff={staff as any} origin={origin} /></Section>
        <Section id="companies" title="Companies"><CompaniesPanel slug={event.slug} companies={companies as any} tables={tables as any} /></Section>
        <Section id="sessions" title="Device sessions">
          <SessionsPanel slug={event.slug} sessions={sessions.map((s: any) => ({ ...s, last_seen_at: new Date(s.last_seen_at).toISOString(), created_at: new Date(s.created_at).toISOString() }))} />
        </Section>
        <Section id="staff" title="Team"><StaffPanel slug={event.slug} staff={staff as any} me={me.id} /></Section>
        <Section id="privacy" title="Privacy requests">
          <p className="mb-3 max-w-2xl">Export or delete everything held about one person, for example when they ask under the Australian Privacy Principles.</p>
          <PrivacyPanel slug={event.slug} people={people as any} />
        </Section>
      </div>
    </div>
  );
}
