import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { eventInsights } from "@/lib/insights";
import { formatDateTime } from "@/lib/format";
import { BarList } from "@/components/console/BarList";
import { HubspotPanel, ThemesPanel } from "./InsightsClient";

export const metadata: Metadata = { title: "Insights" };

const EXPORTS = [
  ["combined", "Everything, one row per company"],
  ["companies", "Companies"],
  ["people", "People"],
  ["problems", "Problems"],
  ["golden_drafts", "Golden drafts"],
  ["next_steps", "Next steps"],
  ["poll_responses", "Poll answers"],
  ["facilitator_notes", "Facilitator notes"],
  ["final_plans", "Final plans"],
] as const;

// A4: what the whole room said, exports and the HubSpot sync.
export default async function InsightsPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const staff = await requireStaff();
  const event = await getEventBySlug(eventSlug);
  if (!event) notFound();
  const data = await eventInsights(event.id);
  const db = await getDb();
  const last = await db.one<{ at: Date }>("select at from hubspot_sync_log where event_id = $1 and result is not null order by at desc limit 1", [event.id]);
  const pct = data.consent.total ? Math.round((data.consent.yes / data.consent.total) * 100) : 0;
  return (
    <div className="grid gap-8">
      <h1 className="text-3xl font-semibold">Insights</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-muted">People who gave marketing consent</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{data.consent.yes} <span className="text-base font-normal text-muted">of {data.consent.total} ({pct}%)</span></p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted">Next steps submitted</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{data.nextSteps.reduce((s, r) => s + r.value, 0)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted">Hot leads</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{data.leads.find((l) => l.label === "Hot")?.value ?? 0}</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title="Problems by type" rows={data.problemTypes} />
        <BarList title="Fix types" rows={data.fixTypes} />
        <BarList title="Data ready spread" rows={data.dataReady} />
        <BarList title="Sector split (companies)" rows={data.sectors} />
        <BarList title="Lead pipeline" rows={data.leads} />
        <BarList title="Next step choices" rows={data.nextSteps} />
      </div>
      <ThemesPanel slug={event.slug} aiEnabled={event.ai_enabled} />
      {staff.role === "admin" && (
      <section aria-labelledby="exports-title">
        <h2 id="exports-title" className="text-2xl font-semibold">Download CSV</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {EXPORTS.map(([k, label]) => (
            <li key={k}><a className={`btn ${k === "combined" ? "" : "btn-secondary"} btn-small`} href={`/console/${event.slug}/export/${k}`}>{label}</a></li>
          ))}
        </ul>
      </section>
      )}
      <section aria-labelledby="hubspot-title">
        <h2 id="hubspot-title" className="text-2xl font-semibold">HubSpot</h2>
        <div className="mt-3"><HubspotPanel slug={event.slug} isAdmin={staff.role === "admin"} lastRun={last ? formatDateTime(last.at) : null} /></div>
      </section>
    </div>
  );
}
