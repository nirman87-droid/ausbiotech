import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { liveCompanies } from "@/lib/console-queries";
import { getDb } from "@/lib/db";
import { topics } from "@/lib/topics";
import { formatTime } from "@/lib/format";
import { LiveRefresh } from "@/components/LiveRefresh";
import { LiveControls } from "./LiveControls";
import { CompanyTable } from "./CompanyTable";
import { STAGE_INFO } from "@/lib/copy";
import { Timer } from "@/components/Timer";

export const metadata: Metadata = { title: "Live" };

// A1: the room at a glance. Updates by itself through realtime.
export default async function LivePage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const staff = await requireStaff();
  const event = await getEventBySlug(eventSlug);
  if (!event) notFound();
  const companies = await liveCompanies(event);
  const db = await getDb();
  const people = await db.one<{ n: number }>(
    `select count(distinct ds.person_id) as n from device_sessions ds join people p on p.id = ds.person_id
       join companies c on c.id = p.company_id where c.event_id = $1 and ds.revoked_at is null`,
    [event.id],
  );
  const alerts = await db.query<{ at: Date; name: string; company: string }>(
    `select a.at, p.name, c.name as company from audit_log a join people p on p.id = a.actor_id
       join companies c on c.id = p.company_id
      where a.event_id = $1 and a.action = 'duplicate_session' order by a.at desc limit 5`,
    [event.id],
  );
  const kpis = [
    { label: "Companies signed in", value: companies.filter((c) => c.signed_in > 0).length, of: companies.length },
    { label: "People signed in", value: people?.n ?? 0, of: companies.reduce((s, c) => s + Number(c.people), 0) },
    { label: "Shortlists confirmed", value: companies.filter((c) => c.shortlist_confirmed).length, of: companies.length },
    { label: "Companies stuck", value: companies.filter((c) => c.flags.includes("stuck")).length, of: null, warn: true },
  ];
  const timer = {
    endsAt: event.timer_ends_at ? new Date(event.timer_ends_at).toISOString() : null,
    pausedRemaining: event.timer_paused_remaining_s,
    serverNow: Date.now(),
  };

  return (
    <>
      <LiveRefresh topics={[topics.event(event.id), topics.activity(event.id)]} debounceMs={1200} />
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-semibold">Live</h1>
        {staff.role !== "admin" && (
          <p className="text-lg">
            Stage: <strong className="text-ink">{STAGE_INFO[event.current_stage].label}</strong>{" "}
            {(timer.endsAt || timer.pausedRemaining != null) && <Timer {...timer} className="ml-2" />}
          </p>
        )}
      </div>
      {staff.role === "admin" && (
        <LiveControls slug={event.slug} stage={event.current_stage} timer={timer} pollOpen={event.poll_open} />
      )}
      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={`card p-4 ${k.warn && k.value > 0 ? "border-warning-line" : ""}`}>
            <dt className="text-sm text-muted">{k.label}</dt>
            <dd className={`mt-1 text-3xl font-semibold ${k.warn && k.value > 0 ? "text-warning" : "text-ink"}`}>
              {k.value}
              {k.of != null && <span className="text-base font-normal text-muted"> / {k.of}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {alerts.length > 0 && (
        <section className="notice notice-warning mt-4" aria-labelledby="alerts-title">
          <h2 id="alerts-title" className="font-semibold">Second device alerts</h2>
          <ul className="mt-1 text-sm text-body">
            {alerts.map((a, i) => (
              <li key={i}>{formatTime(a.at)}: {a.name} ({a.company}) signed in on another device. Revoke a session in Setup if this was a mistake.</li>
            ))}
          </ul>
        </section>
      )}
      <CompanyTable slug={event.slug} companies={companies} staffId={staff.id} isFacilitator={staff.role === "facilitator"} serverNow={timer.serverNow} />
    </>
  );
}
