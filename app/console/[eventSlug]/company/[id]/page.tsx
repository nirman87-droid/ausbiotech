import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { getCompany, getEventBySlug, goldenDraftsForCompany, nextStepsForCompany, peopleForCompany, pollQuestions, problemsForCompany, shortlistReview } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { topics } from "@/lib/topics";
import { rankProblems, eligibilityFlags } from "@/lib/rules";
import { formatDateTime } from "@/lib/format";
import { SIZE_BAND_LABELS, type SizeBand } from "@/lib/copy";
import { LiveRefresh } from "@/components/LiveRefresh";
import { GoldenSummary, NextSummary, ProblemSummary } from "@/components/Answers";
import { NotesForm } from "./NotesForm";
import { MergePanel, ReviewButton } from "./CompanyActions";
import type { FacilitatorNotesRow } from "@/lib/types";

export const metadata: Metadata = { title: "Company" };

// A2: everything about one company on the left (read only), facilitator notes on the right.
export default async function CompanyPage({ params }: { params: Promise<{ eventSlug: string; id: string }> }) {
  const { eventSlug, id } = await params;
  const staff = await requireStaff();
  const event = await getEventBySlug(eventSlug);
  if (!event) notFound();
  const company = await getCompany(event.id, id);
  if (!company) notFound();
  const db = await getDb();
  const [people, problems, drafts, next, questions, review, notes, pollRows, others] = await Promise.all([
    peopleForCompany(company.id),
    problemsForCompany(company.id),
    goldenDraftsForCompany(company.id),
    nextStepsForCompany(company.id),
    pollQuestions(event.id),
    shortlistReview(company.id),
    db.one<FacilitatorNotesRow & { editor: string | null }>(
      "select n.*, s.name as editor from facilitator_notes n left join staff s on s.id = n.updated_by where n.company_id = $1",
      [company.id],
    ),
    db.query<{ question_id: string; answer: string; n: number }>(
      `select r.question_id, r.answer, count(*) as n from poll_responses r join people p on p.id = r.person_id
        where p.company_id = $1 group by r.question_id, r.answer`,
      [company.id],
    ),
    staff.role === "admin"
      ? db.query<{ id: string; name: string }>("select id, name from companies where event_id = $1 and id <> $2 order by name", [event.id, company.id])
      : Promise.resolve([]),
  ]);
  const golden = problems.find((p) => p.id === company.golden_problem_id) ?? null;
  const goldenDraft = golden ? (drafts.find((d) => d.problem_id === golden.id) ?? null) : null;
  const flags = eligibilityFlags(company.size_band);

  return (
    <>
      <LiveRefresh topics={[topics.company(company.id), topics.activity(event.id)]} debounceMs={1500} />
      <p className="no-print">
        <Link className="link" href={`/console/${event.slug}/live`}>Back to live</Link>
      </p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-semibold">{company.name}</h1>
        <p className="text-sm text-muted">
          {company.table_number != null ? `Table ${company.table_number}` : "No table"} · {company.sector ?? "No sector"} ·{" "}
          {company.size_band ? SIZE_BAND_LABELS[company.size_band as SizeBand] : "Size missing"} · {company.state ?? "No state"}
          {company.website && <> · <a className="link" href={company.website} target="_blank" rel="noreferrer">{company.website.replace(/^https?:\/\//, "")}</a></>}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {flags.includes("over_200") && <span className="pill pill-warning">Over 200 staff: outside AI Adopt SME eligibility</span>}
        {flags.includes("size_missing") && <span className="pill pill-warning">Size missing</span>}
        {company.is_walk_in && <span className="pill pill-teal">Walk-in</span>}
        {company.is_locked && <span className="pill">Locked</span>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="grid min-w-0 gap-8">
          <section aria-labelledby="team-title">
            <h2 id="team-title" className="text-xl font-semibold">Team</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {people.map((p) => (
                <li key={p.id} className="card p-3">
                  <p className="font-medium text-ink">
                    {p.name} {p.active && <span className="pill pill-success ml-1">Active</span>}
                    {p.is_walk_in && <span className="pill pill-teal ml-1">Added on the day</span>}
                  </p>
                  <p className="text-sm text-muted">{p.role ?? "No role"} · {p.email ?? "No email"}</p>
                  <p className="text-sm">{p.marketing_consent ? <span className="text-success">Consented {formatDateTime(p.consent_at)}</span> : <span className="text-muted">No marketing consent</span>}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="problems-title" className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="problems-title" className="text-xl font-semibold">Problems and scores</h2>
              <span className="text-sm">{company.shortlist_confirmed_at ? <span className="text-success">Shortlist confirmed</span> : <span className="text-muted">Shortlist not confirmed</span>}</span>
            </div>
            {problems.length === 0 && <p className="text-muted">No problems yet.</p>}
            {rankProblems(problems).map((p, i) => <ProblemSummary key={p.id} p={p} index={i} />)}
            <ReviewButton slug={event.slug} companyId={company.id}
              reviewed={review ? `by ${review.staff_name ?? "staff"} at ${formatDateTime(review.reviewed_at)}` : null} />
          </section>

          <section aria-labelledby="golden-title" className="card p-4">
            <h2 id="golden-title" className="mb-3 text-xl font-semibold">Golden use case draft</h2>
            <GoldenSummary draft={goldenDraft} problemTitle={golden?.title ?? null} />
          </section>

          <section aria-labelledby="poll-title">
            <h2 id="poll-title" className="text-xl font-semibold">Poll answers from this team</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {questions.map((q) => {
                const rows = pollRows.filter((r) => r.question_id === q.id);
                const total = rows.reduce((s, r) => s + Number(r.n), 0);
                const avg = q.type === "scale" && total > 0 ? rows.reduce((s, r) => s + Number(r.answer) * Number(r.n), 0) / total : null;
                return (
                  <div key={q.id} className="card p-3">
                    <dt className="text-sm text-muted">{q.text}</dt>
                    <dd className="mt-1 text-ink">
                      {total === 0 ? <span className="text-muted">No answers</span>
                        : avg != null ? <>Average <strong>{avg.toFixed(1)}</strong> from {total}</>
                        : rows.map((r) => `${r.answer} (${r.n})`).join(", ")}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section aria-labelledby="next-title" className="card p-4">
            <h2 id="next-title" className="mb-3 text-xl font-semibold">Next steps</h2>
            <NextSummary next={next} />
            <p className="mt-2 text-sm text-muted">{next?.submitted_at ? `Submitted ${formatDateTime(next.submitted_at)}` : "Not submitted yet"}</p>
          </section>

          {staff.role === "admin" && others.length > 0 && <MergePanel slug={event.slug} companyId={company.id} others={others} />}
        </div>

        <div className="lg:sticky lg:top-4 lg:h-fit">
          <NotesForm
            companyId={company.id}
            initial={{
              decision_maker: notes?.decision_maker ?? null,
              lead_rating: notes?.lead_rating ?? null,
              funding_fit: notes?.funding_fit ?? null,
              signals: notes?.signals ?? null,
              notes: notes?.notes ?? null,
              next_action: notes?.next_action ?? null,
              action_owner: notes?.action_owner ?? null,
              action_due: notes?.action_due ? String(notes.action_due) : null,
            }}
            lastEdited={{ by: notes?.editor ?? null, at: notes?.updated_at ? new Date(notes.updated_at).toISOString() : null }}
          />
        </div>
      </div>
    </>
  );
}
