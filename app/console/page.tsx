import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff";
import { formatDate } from "@/lib/format";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { CreateEventForm } from "./CreateEventForm";
import type { EventRow } from "@/lib/types";

export const metadata: Metadata = { title: "Team console" };

export default async function ConsoleHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const staff = await requireStaff();
  const { denied } = await searchParams;
  const db = await getDb();
  const events = await db.query<EventRow & { companies: number }>(
    `select e.*, (select count(*) from companies c where c.event_id = e.id) as companies
       from events e order by e.starts_at desc nulls last`,
  );
  return (
    <>
      <ConsoleHeader staff={staff} />
      <main id="main" className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-3xl font-semibold">Events</h1>
        {denied && <p className="notice notice-warning mt-4" role="alert">That page is for admins only.</p>}
        <ul className="mt-6 grid gap-3">
          {events.map((e) => (
            <li key={e.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-lg font-semibold text-ink">{e.name}</p>
                <p className="text-sm text-muted">
                  {formatDate(e.starts_at)} · {e.companies} companies · <span className="pill">{e.status}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="btn" href={`/console/${e.slug}/live`}>Live</Link>
                {staff.role === "admin" && <Link className="btn btn-secondary" href={`/console/${e.slug}/setup`}>Setup</Link>}
                {staff.role === "admin" && <Link className="btn btn-secondary" href={`/console/${e.slug}/plans`}>Plans</Link>}
              </div>
            </li>
          ))}
          {events.length === 0 && <li className="notice">No events yet.</li>}
        </ul>
        {staff.role === "admin" && (
          <section className="card mt-10 p-5" aria-labelledby="new-event">
            <h2 id="new-event" className="text-xl font-semibold">New event</h2>
            <CreateEventForm />
          </section>
        )}
      </main>
    </>
  );
}
