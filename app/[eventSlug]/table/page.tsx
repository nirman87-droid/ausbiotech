import Link from "next/link";
import type { Metadata } from "next";
import { requireTableAccess } from "@/lib/table-access";
import { companiesAtTable, searchCompanies, type CompanyCard } from "@/lib/queries";
import { PublicShell } from "@/components/PublicShell";

export const metadata: Metadata = { title: "Pick your organisation" };

function CompanyLink({ slug, c }: { slug: string; c: CompanyCard }) {
  return (
    <li>
      <Link
        href={`/${slug}/c/${c.id}/who`}
        className="card flex min-h-[72px] items-center justify-between gap-4 p-4 hover:border-teal hover:bg-tint"
      >
        <span>
          <span className="block text-lg font-semibold text-ink">{c.name}</span>
          {c.sector && <span className="block text-sm text-muted">{c.sector}</span>}
        </span>
        <span className="shrink-0 text-right text-sm">
          <span className="block">{c.registered} registered</span>
          <span className={`block ${c.active > 0 ? "text-success" : "text-muted"}`}>{c.active} active now</span>
        </span>
      </Link>
    </li>
  );
}

// P1: companies at this table as large tap targets, plus search and walk-ins.
export default async function PickCompany({
  params,
  searchParams,
}: {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { eventSlug } = await params;
  const { q = "" } = await searchParams;
  const { event, table } = await requireTableAccess(eventSlug);
  const atTable = table ? await companiesAtTable(table.id) : [];
  const results = q ? await searchCompanies(event.id, q) : [];

  return (
    <PublicShell eyebrow={table ? `Table ${table.number}` : undefined}>
      <p className="mono-label">{event.name}</p>
      <h1 className="mt-1 text-3xl font-semibold">Pick your organisation</h1>
      <p className="mt-2 text-lg">Tap your organisation to get started.</p>

      {atTable.length > 0 ? (
        <ul className="mt-6 grid gap-3" aria-label={`Organisations at table ${table?.number}`}>
          {atTable.map((c) => (
            <CompanyLink key={c.id} slug={event.slug} c={c} />
          ))}
        </ul>
      ) : (
        <p className="notice mt-6">No organisations are assigned to this table yet. Search for yours below.</p>
      )}

      <section className="mt-10" aria-labelledby="search-title">
        <h2 id="search-title" className="text-xl font-semibold">
          Not at this table?
        </h2>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-2" role="search">
          <div className="min-w-0 flex-1">
            <label htmlFor="q" className="field-label">
              Search all organisations at the event
            </label>
            <input id="q" name="q" type="search" defaultValue={q} className="input" autoComplete="organization" minLength={2} />
          </div>
          <button className="btn" type="submit">
            Search
          </button>
        </form>
        {q && (
          <div className="mt-4" aria-live="polite">
            {results.length > 0 ? (
              <ul className="grid gap-3">
                {results.map((c) => (
                  <CompanyLink key={c.id} slug={event.slug} c={c} />
                ))}
              </ul>
            ) : (
              <p>No organisations match &ldquo;{q}&rdquo;.</p>
            )}
          </div>
        )}
        <p className="mt-6">
          Not listed?{" "}
          <Link className="link font-semibold" href={`/${event.slug}/table/add`}>
            Add my organisation
          </Link>
        </p>
      </section>
    </PublicShell>
  );
}
