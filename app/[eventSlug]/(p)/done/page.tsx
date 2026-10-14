import Link from "next/link";
import type { Metadata } from "next";
import { requireParticipant } from "@/lib/session";
import { goldenDraftsForCompany, nextStepsForCompany, pollAnswersForPerson, pollQuestions, problemsForCompany } from "@/lib/queries";
import { PageTitle } from "@/lib/stage-gate";
import { NEXT_CHOICE_LABELS, STAGE_INFO, type NextChoice } from "@/lib/copy";
import { rankProblems } from "@/lib/rules";
import { formatDate } from "@/lib/format";
import { GoldenSummary, NextSummary, ProblemSummary } from "@/components/Answers";

export const metadata: Metadata = { title: "Thank you" };

// P8: thank you, the golden use case, the other shortlisted items, and what happens next.
export default async function DonePage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const ctx = await requireParticipant(eventSlug);
  const next = await nextStepsForCompany(ctx.company.id);
  if (!next?.submitted_at && ctx.event.current_stage !== "done") {
    return (
      <section className="card mx-auto max-w-xl p-6 text-center">
        <h1 className="text-2xl font-semibold">Almost there</h1>
        <p className="mt-2">Finish the next steps page first. Then you will see your summary here.</p>
        <p className="mt-4">
          <Link className="btn" href={`/${ctx.event.slug}/${STAGE_INFO.next_steps.path}`}>
            Go to next steps
          </Link>
        </p>
      </section>
    );
  }
  const [problems, drafts, questions, answers] = await Promise.all([
    problemsForCompany(ctx.company.id),
    goldenDraftsForCompany(ctx.company.id),
    pollQuestions(ctx.event.id),
    pollAnswersForPerson(ctx.person.id),
  ]);
  const golden = problems.find((p) => p.id === ctx.company.golden_problem_id) ?? null;
  const goldenDraft = golden ? (drafts.find((d) => d.problem_id === golden.id) ?? null) : null;
  const others = rankProblems(problems.filter((p) => p.shortlisted && p.id !== golden?.id));
  const due = ctx.event.plans_due_date ? formatDate(ctx.event.plans_due_date) : null;
  const choice = next?.choice as NextChoice | null;

  return (
    <div className="grid max-w-4xl gap-8">
      <PageTitle step="Done" title="Thank you" intro="Great work today. Here is what your team came up with." />

      <section className="card p-5" aria-labelledby="golden-title">
        <p className="mono-label">Your golden use case</p>
        <h2 id="golden-title" className="mt-1 text-2xl font-semibold">
          {golden?.title ?? "Not picked yet"}
        </h2>
        <div className="mt-4">
          <GoldenSummary draft={goldenDraft} problemTitle={null} />
        </div>
      </section>

      {others.length > 0 && (
        <section aria-labelledby="others-title">
          <h2 id="others-title" className="text-xl font-semibold">
            Also on your shortlist
          </h2>
          <ul className="mt-3 grid gap-2">
            {others.map((p) => (
              <li key={p.id} className="card flex items-center justify-between gap-3 p-3">
                <span className="text-ink">{p.title}</span>
                <span className="pill font-mono">Score {p.score}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="text-xl font-semibold">
          What happens next
        </h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          <li className="card p-4">
            <p className="mono-label">Step 1 · Today</p>
            <p className="mt-1 font-semibold text-ink">Your draft is with ARM Hub</p>
            <p className="mt-1 text-sm">Our team reads every draft after the workshop.</p>
          </li>
          <li className="card p-4">
            <p className="mono-label">Step 2 · {due ? `By ${due}` : "Soon"}</p>
            <p className="mt-1 font-semibold text-ink">You get your AI starter plan</p>
            <p className="mt-1 text-sm">We email everyone registered from your organisation a personal link to the final plan.</p>
          </li>
          <li className="card p-4">
            <p className="mono-label">Step 3 · After that</p>
            <p className="mt-1 font-semibold text-ink">{choice ? NEXT_CHOICE_LABELS[choice].label : "Your next step"}</p>
            <p className="mt-1 text-sm">{choice ? NEXT_CHOICE_LABELS[choice].hint : "Tell us on the next steps page."}</p>
          </li>
        </ol>
      </section>

      <details className="card p-4">
        <summary className="cursor-pointer text-lg font-semibold text-teal">See all your answers</summary>
        <div className="mt-4 grid gap-6">
          <section>
            <h3 className="font-semibold">Your poll answers</h3>
            <dl className="mt-2 grid gap-2">
              {questions.map((q) => (
                <div key={q.id}>
                  <dt className="text-sm text-muted">{q.text}</dt>
                  <dd className="text-ink">{answers[q.id] ?? "Not answered"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="grid gap-3">
            <h3 className="font-semibold">Problems</h3>
            {problems.map((p, i) => (
              <ProblemSummary key={p.id} p={p} index={i} />
            ))}
          </section>
          {drafts.filter((d) => d.problem_id !== golden?.id).length > 0 && (
            <section className="grid gap-3">
              <h3 className="font-semibold">Other drafts</h3>
              {drafts
                .filter((d) => d.problem_id !== golden?.id)
                .map((d) => (
                  <div key={d.id} className="card p-4">
                    <GoldenSummary draft={d} problemTitle={problems.find((p) => p.id === d.problem_id)?.title ?? null} />
                  </div>
                ))}
            </section>
          )}
          <section>
            <h3 className="font-semibold">Next steps</h3>
            <div className="mt-2">
              <NextSummary next={next} />
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
