import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTableAccess } from "@/lib/table-access";
import { getCompany, peopleForCompany } from "@/lib/queries";
import { PublicShell } from "@/components/PublicShell";

export const metadata: Metadata = { title: "Pick your name" };

const ERRORS: Record<string, string> = {
  closed: "Editing is closed for this organisation. Ask the ARM Hub team for help.",
  add: "To add yourself, enter your name, role and email.",
  person: "We could not find that person. Please try again.",
};

// P2: pick your name. Each card is a small form that posts to /api/p/session.
export default async function PickName({
  params,
  searchParams,
}: {
  params: Promise<{ eventSlug: string; companyId: string }>;
  searchParams: Promise<{ already?: string; error?: string; add?: string }>;
}) {
  const { eventSlug, companyId } = await params;
  const sp = await searchParams;
  const { event, table } = await requireTableAccess(eventSlug);
  const company = await getCompany(event.id, companyId);
  if (!company) redirect(`/${event.slug}/table`);
  const people = await peopleForCompany(company.id);
  const already = sp.already ? people.find((p) => p.id === sp.already) : undefined;
  const errorText = sp.error ? (ERRORS[sp.error] ?? "Please check the highlighted fields.") : null;
  const showAdd = sp.add === "1" || people.length === 0 || sp.error === "add";

  return (
    <PublicShell eyebrow={table ? `Table ${table.number}` : undefined}>
      <p>
        <Link className="link" href={`/${event.slug}/table`}>
          Back to organisations
        </Link>
      </p>
      <p className="mono-label mt-4">{company.name}</p>
      <h1 className="mt-1 text-3xl font-semibold">Who are you?</h1>
      <p className="mt-2 text-lg">Pick your name. Your answers are saved for your whole organisation.</p>

      {errorText && (
        <p className="notice notice-warning mt-4" role="alert">
          {errorText}
        </p>
      )}

      {already && (
        <section className="notice notice-warning mt-6" role="alertdialog" aria-labelledby="already-title" aria-describedby="already-text">
          <h2 id="already-title" className="text-lg font-semibold text-warning">
            {already.name} is already working on another device
          </h2>
          <p id="already-text" className="mt-1 text-body">
            If this is you on a new device, you can continue here. The ARM Hub team will be told, in case it was a mistake.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form method="post" action="/api/p/session">
              <input type="hidden" name="eventSlug" value={event.slug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="personId" value={already.id} />
              <input type="hidden" name="confirm" value="1" />
              <button className="btn" type="submit">
                Yes, continue as {already.name}
              </button>
            </form>
            <Link className="btn btn-secondary" href={`/${event.slug}/c/${company.id}/who`}>
              No, go back
            </Link>
          </div>
        </section>
      )}

      {people.length > 0 && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Registered people">
          {people.map((p) => (
            <li key={p.id}>
              <form method="post" action="/api/p/session">
                <input type="hidden" name="eventSlug" value={event.slug} />
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="personId" value={p.id} />
                <button
                  type="submit"
                  className="card flex min-h-[72px] w-full cursor-pointer items-center justify-between gap-3 p-4 text-left hover:border-teal hover:bg-tint"
                >
                  <span>
                    <span className="block text-lg font-semibold text-ink">{p.name}</span>
                    {p.role && <span className="block text-sm text-muted">{p.role}</span>}
                  </span>
                  {p.active && <span className="pill pill-success shrink-0">Active</span>}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <details className="card mt-8 p-4" open={showAdd}>
        <summary className="cursor-pointer text-lg font-semibold text-teal">I am not on the list. Add me.</summary>
        <form method="post" action="/api/p/session" className="mt-4 grid gap-4">
          <input type="hidden" name="eventSlug" value={event.slug} />
          <input type="hidden" name="companyId" value={company.id} />
          <div>
            <label htmlFor="newName" className="field-label">
              Your name
            </label>
            <input id="newName" name="newName" className="input" required minLength={2} maxLength={120} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="newRole" className="field-label">
              Your role
            </label>
            <input id="newRole" name="newRole" className="input" required minLength={2} maxLength={120} autoComplete="organization-title" />
          </div>
          <div>
            <label htmlFor="newEmail" className="field-label">
              Your work email
            </label>
            <input id="newEmail" name="newEmail" type="email" className="input" required maxLength={200} autoComplete="email" />
            <span className="field-hint">We use this to send you the final plan.</span>
          </div>
          <div>
            <button className="btn" type="submit">
              Add me and continue
            </button>
          </div>
        </form>
      </details>
    </PublicShell>
  );
}
